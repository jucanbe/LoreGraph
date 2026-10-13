"""Federación SPARQL controlada (``SERVICE``) sin delegar el HTTP en pyoxigraph.

pyoxigraph puede quedarse colgado o abortar el proceso con algunas respuestas
remotas, así que los bloques ``SERVICE`` se resuelven aquí con una estrategia
*bind join* por lotes:

1. Se localizan los bloques ``SERVICE <endpoint> { … }`` del texto de la consulta.
2. Para cada bloque se calculan las variables de unión (las que aparecen dentro
   y fuera del bloque) y se obtienen sus valores con una consulta local.
3. Se envía al endpoint ``SELECT * WHERE { VALUES (…) { … } <cuerpo> }`` en lotes,
   con timeout, User-Agent conforme a la política de Wikidata y caché.
4. El bloque ``SERVICE`` se sustituye por un bloque ``VALUES`` con las respuestas
   y la consulta resultante se ejecuta localmente.

Cubre el uso habitual (traer datos reales de las anclas de la campaña). Solo se
permiten los endpoints configurados (evita SSRF).
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

import pyoxigraph as ox

from loregraph.errors import BadRequest, DomainError
from loregraph.services.kernel import CampaignHandle

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

_VAR_RE = re.compile(r"[?$]([A-Za-z0-9_À-ɏ]+)")
_FORM_RE = re.compile(r"\b(SELECT|ASK|CONSTRUCT|DESCRIBE)\b", re.IGNORECASE)
BATCH = 80


@dataclass
class ServiceBlock:
    start: int
    end: int
    endpoint: str
    body: str
    silent: bool


def _scan(text: str, i: int) -> int:
    """Avanza sobre una cadena, IRI o comentario que empieza en ``i``; devuelve el índice siguiente."""
    c = text[i]
    if c == "#":
        j = text.find("\n", i)
        return len(text) if j < 0 else j + 1
    if c == "<":
        # IRI si no hay espacios hasta '>' (si no, es un operador «menor que»)
        m = re.match(r"<[^<>\"{}|^`\\\s]*>", text[i:])
        return i + m.end() if m else i + 1
    if c in ("'", '"'):
        triple = text[i:i + 3] == c * 3
        q = c * 3 if triple else c
        j = i + len(q)
        while j < len(text):
            if text[j] == "\\":
                j += 2
                continue
            if text.startswith(q, j):
                return j + len(q)
            j += 1
        return len(text)
    return i + 1


def _matching_brace(text: str, open_idx: int) -> int:
    depth = 0
    i = open_idx
    while i < len(text):
        c = text[i]
        if c in "#<'\"":
            i = _scan(text, i)
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise BadRequest("Llaves desequilibradas en la consulta")


def find_service_blocks(text: str) -> list[ServiceBlock]:
    blocks: list[ServiceBlock] = []
    i = 0
    pattern = re.compile(r"SERVICE\s+(SILENT\s+)?<([^>\s]+)>\s*\{", re.IGNORECASE)
    while i < len(text):
        c = text[i]
        if c in "#'\"<":
            i = _scan(text, i)
            continue
        m = pattern.match(text, i) if c in "sS" else None
        if m and (i == 0 or not (text[i - 1].isalnum() or text[i - 1] == "_")):
            open_idx = m.end() - 1
            close = _matching_brace(text, open_idx)
            blocks.append(ServiceBlock(start=i, end=close + 1, endpoint=m.group(2),
                                       body=text[open_idx + 1:close], silent=bool(m.group(1))))
            i = close + 1
            continue
        i += 1
    return blocks


def has_service_keyword(text: str) -> bool:
    """¿Aparece la palabra clave SERVICE fuera de cadenas, IRIs y comentarios?"""
    i = 0
    while i < len(text):
        c = text[i]
        if c in "#'\"<":
            i = _scan(text, i)
            continue
        if c in "sS" and text[i:i + 7].upper() == "SERVICE" and (i == 0 or not text[i - 1].isalnum()) \
                and (i + 7 >= len(text) or not (text[i + 7].isalnum() or text[i + 7] == "_")):
            return True
        i += 1
    return False


def _variables(text: str) -> set[str]:
    out: set[str] = set()
    i = 0
    while i < len(text):
        c = text[i]
        if c in "#'\"<":
            i = _scan(text, i)
            continue
        m = _VAR_RE.match(text, i)
        if m:
            out.add(m.group(1))
            i = m.end()
            continue
        i += 1
    return out


def _split_query(text: str) -> tuple[str, str]:
    """Devuelve (prólogo, cuerpo WHERE sin las llaves exteriores)."""
    m = _FORM_RE.search(text)
    if not m:
        raise BadRequest("No se reconoce la forma de la consulta (SELECT, ASK, CONSTRUCT, DESCRIBE)")
    prologue = text[:m.start()]
    form = m.group(1).upper()
    i = m.end()
    if form == "CONSTRUCT":
        # salta la plantilla si existe: CONSTRUCT { … } WHERE { … }
        rest = text[i:].lstrip()
        if rest.startswith("{") and not re.match(r"\{\s*\}", rest) and not re.search(r"^\s*WHERE", text[i:], re.I):
            open_t = text.index("{", i)
            i = _matching_brace(text, open_t) + 1
    where = re.compile(r"\bWHERE\b", re.IGNORECASE).search(text, i)
    start = where.end() if where else i
    open_idx = text.find("{", start)
    if open_idx < 0:
        raise BadRequest("La consulta no tiene patrón WHERE")
    close = _matching_brace(text, open_idx)
    return prologue, text[open_idx + 1:close]


def _term_sparql(binding: dict[str, Any]) -> str | None:
    t = binding.get("type")
    v = binding.get("value", "")
    if t == "uri":
        if re.search(r"[<>\"{}|^`\\\s]", v):
            return None
        return f"<{v}>"
    if t in ("literal", "typed-literal"):
        lang = binding.get("xml:lang")
        if lang:
            return str(ox.Literal(v, language=lang))
        dt = binding.get("datatype")
        if dt and dt != "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString":
            try:
                return str(ox.Literal(v, datatype=ox.NamedNode(dt)))
            except ValueError:
                return str(ox.Literal(v))
        return str(ox.Literal(v))
    return None  # nodos en blanco: sin equivalente local


class Federator:
    """Resuelve los bloques SERVICE de una consulta para una campaña."""

    def __init__(self, kernel: Kernel, camp: CampaignHandle, timeout: float) -> None:
        self.k = kernel
        self.camp = camp
        self.timeout = timeout
        s = kernel.settings
        self.allowed = {s.wikidata_endpoint, s.dbpedia_endpoint, *s.federation_extra_endpoints}

    def _local(self, query: str) -> list[dict[str, ox.NamedNode | ox.Literal | ox.BlankNode]]:
        named = [g for g in self.k.store.named_graphs() if g.startswith(self.camp.iri + "/")] + self.camp.module_graphs
        try:
            return self.k.store.select(query, default_graph=self.camp.read_graphs, named_graphs=named,
                                       prefixes=self.camp.ctx.prefixes)
        except SyntaxError as exc:
            raise BadRequest(f"Consulta no válida: {exc}") from exc

    def _remote(self, endpoint: str, query: str, silent: bool) -> tuple[list[str], list[dict[str, Any]]]:
        from loregraph.services.sparql import remote_select

        key = "service:" + hashlib.sha256(f"{endpoint}|{query}".encode()).hexdigest()
        cached = self.k.aux.cache_get(key)
        if cached is not None:
            return cached["vars"], cached["rows"]
        try:
            data = remote_select(self.k, endpoint, query, self.timeout)
        except DomainError:
            if silent:
                return [], []
            raise
        head = data.get("head", {}).get("vars", [])
        rows = data.get("results", {}).get("bindings", [])
        self.k.aux.cache_set(key, {"vars": head, "rows": rows}, self.k.settings.federation_cache_ttl_s)
        return head, rows

    def rewrite(self, query: str) -> str:
        blocks = find_service_blocks(query)
        if not blocks:
            return query
        prologue, _ = _split_query(query)
        replacements: list[tuple[ServiceBlock, str]] = []
        for idx, block in enumerate(blocks):
            if block.endpoint not in self.allowed:
                raise BadRequest(
                    f"Endpoint no permitido en SERVICE: {block.endpoint}. "
                    "Añádelo a LOREGRAPH_FEDERATION_EXTRA_ENDPOINTS si es de confianza."
                )
            if find_service_blocks(block.body):
                raise BadRequest("No se admiten bloques SERVICE anidados")
            # Variables de unión: dentro del bloque y fuera de él.
            outside = query[:block.start] + query[block.end:]
            join_vars = sorted(_variables(block.body) & _variables(outside))
            rows_values: list[str] = []
            if join_vars:
                # Consulta local con todos los SERVICE sustituidos por un grupo vacío.
                local = query
                for other in sorted(blocks, key=lambda b: -b.start):
                    local = local[:other.start] + "{}" + local[other.end:]
                _, body = _split_query(local)
                probe = f"{prologue}\nSELECT DISTINCT {' '.join('?' + v for v in join_vars)} WHERE {{ {body} }}"
                for r in self._local(probe):
                    cells = [str(r[v]) if v in r and not isinstance(r[v], ox.BlankNode) else "UNDEF" for v in join_vars]
                    if any(c != "UNDEF" for c in cells):
                        rows_values.append("(" + " ".join(cells) + ")")
            head: list[str] = []
            results: list[dict[str, Any]] = []
            if join_vars and not rows_values:
                head = sorted(_variables(block.body))
            else:
                batches = [rows_values[i:i + BATCH] for i in range(0, len(rows_values), BATCH)] or [[]]
                for batch in batches:
                    values = (f"VALUES ({' '.join('?' + v for v in join_vars)}) {{ {' '.join(batch)} }}"
                              if batch else "")
                    remote_q = f"{prologue}\nSELECT * WHERE {{ {values} {block.body} }}"
                    h, rows = self._remote(block.endpoint, remote_q, block.silent)
                    head = head or h
                    results.extend(rows)
            replacements.append((block, self._values_block(head, results, idx)))
        out = query
        for block, text in sorted(replacements, key=lambda t: -t[0].start):
            out = out[:block.start] + text + out[block.end:]
        return out

    @staticmethod
    def _values_block(head: list[str], rows: list[dict[str, Any]], idx: int) -> str:
        if not head:
            return f"VALUES ?__servicio{idx} {{ }}"
        lines = []
        seen: set[str] = set()
        for r in rows:
            cells = []
            for v in head:
                term = _term_sparql(r[v]) if v in r else None
                cells.append(term or "UNDEF")
            line = "(" + " ".join(cells) + ")"
            if line not in seen:
                seen.add(line)
                lines.append(line)
        return f"VALUES ({' '.join('?' + v for v in head)}) {{ {' '.join(lines)} }}"
