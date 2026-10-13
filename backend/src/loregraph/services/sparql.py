"""Consultas SPARQL de solo lectura (locales, federadas con SERVICE o remotas)."""

from __future__ import annotations

import hashlib
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutTimeout
from typing import TYPE_CHECKING, Any

import httpx
import pyoxigraph as ox

from loregraph.errors import BadRequest, Timeout, UpstreamError
from loregraph.models import ConsultaEjemplo, ConsultaSparql, ResultadoSparql, Termino
from loregraph.services.federation import Federator, has_service_keyword
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

_SERVICE_RE = re.compile(r"\bSERVICE\b", re.IGNORECASE)
_UPDATE_RE = re.compile(r"^\s*(INSERT|DELETE|LOAD|CLEAR|CREATE|DROP|COPY|MOVE|ADD)\b", re.IGNORECASE | re.MULTILINE)
LOCAL_FEDERATED_TTL = 600


class SparqlService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel
        self._pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="sparql")

    # ------------------------------------------------------------ ejemplos
    def examples(self, camp: CampaignHandle) -> list[ConsultaEjemplo]:
        out = [
            ConsultaEjemplo(id=q.id, titulo=q.titulo, descripcion=q.descripcion, consulta=q.consulta, modulo=q.modulo)
            for m in camp.ctx.modules for q in m.queries
        ]
        out.extend(
            ConsultaEjemplo(id=f"guardada:{q['id']}", titulo=q["titulo"], descripcion=q["descripcion"],
                            consulta=q["consulta"], guardada=True)
            for q in self.k.aux.list_queries(camp.id)
        )
        return out

    # ------------------------------------------------------------- ejecución
    def run(self, camp: CampaignHandle, req: ConsultaSparql, lang: str = "es") -> ResultadoSparql:
        settings = self.k.settings
        limit = min(req.limite or settings.sparql_max_results, settings.sparql_max_results)
        timeout = min(req.timeout or settings.sparql_timeout_s, settings.sparql_timeout_s * 3)
        if _UPDATE_RE.search(_strip_comments_and_prefixes(req.consulta)):
            raise BadRequest("Solo se permiten consultas de lectura (SELECT, ASK, CONSTRUCT, DESCRIBE)")
        if req.destino != "local":
            return self._remote(req, limit, timeout)
        federated = has_service_keyword(req.consulta)
        key = None
        if federated:
            if not settings.federation_enabled:
                raise BadRequest("Las consultas federadas están desactivadas en la configuración")
            key = "sparql:" + hashlib.sha256(f"{camp.id}|{limit}|{lang}|{req.consulta}".encode()).hexdigest()
            cached = self.k.aux.cache_get(key)
            if cached is not None:
                res = ResultadoSparql.model_validate(cached)
                res.cache = True
                return res
        cancel = threading.Event()
        start = time.monotonic()

        def job() -> ResultadoSparql:
            query = req.consulta
            if federated:
                query = Federator(self.k, camp, min(timeout, settings.federation_timeout_s)).rewrite(query)
                if has_service_keyword(query):
                    # Nunca se deja a pyoxigraph hacer peticiones HTTP por su cuenta.
                    raise BadRequest("Patrón SERVICE no admitido: usa SERVICE <endpoint> { … } con una IRI fija")
            return self._run_local(camp, query, limit, lang, cancel, start + timeout)

        fut = self._pool.submit(job)
        try:
            res = fut.result(timeout=timeout)
        except FutTimeout:
            cancel.set()
            raise Timeout(f"La consulta superó el tiempo máximo de {timeout:.0f} s") from None
        res.duracion = round(time.monotonic() - start, 3)
        if key:
            self.k.aux.cache_set(key, res.model_dump(), LOCAL_FEDERATED_TTL)
        return res

    def _run_local(
        self, camp: CampaignHandle, query: str, limit: int, lang: str, cancel: threading.Event, deadline: float
    ) -> ResultadoSparql:
        named = [g for g in self.k.store.named_graphs() if g.startswith(camp.iri + "/")] + camp.module_graphs
        try:
            result = self.k.store.query(query, default_graph=camp.read_graphs, named_graphs=named,
                                        prefixes=camp.ctx.prefixes)
        except SyntaxError as exc:
            raise BadRequest(f"Consulta no válida: {exc}") from exc
        except OSError as exc:
            raise UpstreamError(f"Error al ejecutar la consulta: {exc}") from exc
        labeler = Labeler(self.k.store, camp, lang)
        if isinstance(result, ox.QueryBoolean):
            return ResultadoSparql(tipo="ask", booleano=bool(result))
        if isinstance(result, ox.QuerySolutions):
            variables = [v.value for v in result.variables]
            rows_raw: list[dict[str, Any]] = []
            truncated = False
            for sol in result:
                if cancel.is_set() or time.monotonic() > deadline:
                    truncated = True
                    break
                if len(rows_raw) >= limit:
                    truncated = True
                    break
                rows_raw.append({v: sol[v] for v in variables if sol[v] is not None})
            labeler.preload(t.value for r in rows_raw for t in r.values() if isinstance(t, ox.NamedNode))
            rows = [{k: labeler.term(t) for k, t in r.items()} for r in rows_raw]
            return ResultadoSparql(tipo="select", variables=variables, filas=rows, truncado=truncated)
        triples = []
        truncated = False
        for t in result:
            if cancel.is_set() or len(triples) >= limit:
                truncated = True
                break
            triples.append((t.subject, t.predicate, t.object))
        return ResultadoSparql(tipo="construct", tripletas=labeler.triples(triples), truncado=truncated)

    # --------------------------------------------------------------- remotas
    def _remote(self, req: ConsultaSparql, limit: int, timeout: float) -> ResultadoSparql:
        settings = self.k.settings
        if not settings.federation_enabled:
            raise BadRequest("Las consultas federadas están desactivadas en la configuración")
        endpoint = settings.wikidata_endpoint if req.destino == "wikidata" else settings.dbpedia_endpoint
        key = "remote:" + hashlib.sha256(f"{endpoint}|{limit}|{req.consulta}".encode()).hexdigest()
        cached = self.k.aux.cache_get(key)
        if cached is not None:
            res = ResultadoSparql.model_validate(cached)
            res.cache = True
            return res
        start = time.monotonic()
        data = remote_select(self.k, endpoint, req.consulta, timeout)
        res = results_json_to_model(data, limit)
        res.duracion = round(time.monotonic() - start, 3)
        self.k.aux.cache_set(key, res.model_dump(), settings.federation_cache_ttl_s)
        return res


def remote_select(k: Kernel, endpoint: str, query: str, timeout: float) -> dict[str, Any]:
    """Ejecuta un SELECT/ASK en un endpoint remoto y devuelve el JSON de resultados."""
    headers = {
        "Accept": "application/sparql-results+json",
        "User-Agent": k.settings.federation_user_agent,
    }
    transport = getattr(k, "http_transport", None)
    try:
        with httpx.Client(timeout=timeout, transport=transport, follow_redirects=True) as client:
            resp = client.post(endpoint, data={"query": query}, headers=headers)
    except httpx.TimeoutException as exc:
        raise Timeout(f"El servicio remoto no respondió en {timeout:.0f} s") from exc
    except httpx.HTTPError as exc:
        raise UpstreamError(f"No se pudo contactar con {endpoint}: {exc}") from exc
    if resp.status_code == 400:
        raise BadRequest(f"El servicio remoto rechazó la consulta: {resp.text[:300]}")
    if resp.status_code >= 400:
        raise UpstreamError(f"El servicio remoto devolvió {resp.status_code}")
    try:
        return resp.json()  # type: ignore[no-any-return]
    except ValueError as exc:
        raise UpstreamError("Respuesta remota no válida (se esperaba JSON de resultados SPARQL)") from exc


def results_json_to_model(data: dict[str, Any], limit: int) -> ResultadoSparql:
    if "boolean" in data:
        return ResultadoSparql(tipo="ask", booleano=bool(data["boolean"]))
    variables = data.get("head", {}).get("vars", [])
    bindings = data.get("results", {}).get("bindings", [])
    rows = []
    for b in bindings[:limit]:
        row = {}
        for var, val in b.items():
            t = val.get("type")
            if t == "uri":
                row[var] = Termino(tipo="iri", valor=val["value"], etiqueta=val["value"])
            elif t == "bnode":
                row[var] = Termino(tipo="blanco", valor=val["value"], etiqueta=val["value"])
            else:
                row[var] = Termino(tipo="literal", valor=val["value"], etiqueta=val["value"],
                                   datatype=val.get("datatype"), idioma=val.get("xml:lang"))
        rows.append(row)
    return ResultadoSparql(tipo="select", variables=variables, filas=rows, truncado=len(bindings) > limit)


def _strip_comments_and_prefixes(q: str) -> str:
    lines = []
    for line in q.splitlines():
        s = line.split("#", 1)[0] if not line.strip().startswith("<") else line
        if re.match(r"^\s*(PREFIX|BASE)\b", s, re.IGNORECASE):
            continue
        lines.append(s)
    return "\n".join(lines)
