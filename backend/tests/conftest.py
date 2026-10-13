"""Fixtures comunes de la batería de pruebas del núcleo.

* Cada prueba usa un ``Kernel`` en memoria y una carpeta de módulos VACÍA (solo se
  carga el núcleo), de modo que las pruebas no dependen de los módulos de juego de
  ``modules/`` ni tocan ``data/``.
* Todo acceso HTTP a Wikidata/DBpedia pasa por un ``httpx.MockTransport``
  (``kernel.http_transport``); nunca se sale a la red.
"""

from __future__ import annotations

import socket
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from loregraph.config import Settings
from loregraph.main import create_app
from loregraph.services.kernel import Kernel

WD_MADRID = "http://www.wikidata.org/entity/Q2807"
CAMP = "prueba"


# --------------------------------------------------------------------- red
@pytest.fixture(autouse=True)
def _sin_red(monkeypatch: pytest.MonkeyPatch) -> None:
    """Salvaguarda: cualquier conexión a un host no local hace fallar la prueba.

    (Las conexiones de bucle local se permiten: asyncio las usa en Windows para su
    tubería interna.)"""
    original = socket.socket.connect

    def _connect(self: socket.socket, address: Any) -> Any:
        host = address[0] if isinstance(address, tuple) else address
        if host not in ("127.0.0.1", "::1", "localhost"):
            raise RuntimeError(f"Acceso a la red bloqueado en las pruebas: {address!r}")
        return original(self, address)

    original_gai = socket.getaddrinfo

    def _getaddrinfo(host: Any, *a: Any, **k: Any) -> Any:
        if host not in (None, "127.0.0.1", "::1", "localhost", b"localhost"):
            raise RuntimeError(f"Resolución DNS bloqueada en las pruebas: {host!r}")
        return original_gai(host, *a, **k)

    monkeypatch.setattr(socket.socket, "connect", _connect)
    monkeypatch.setattr(socket, "getaddrinfo", _getaddrinfo)


def sparql_json(vars_: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Construye un JSON de resultados SPARQL. Los valores pueden ser str (literal),
    o dicts ya con forma de binding (``{"type": "uri", "value": ...}``)."""
    bindings = []
    for row in rows:
        b = {}
        for k, v in row.items():
            b[k] = v if isinstance(v, dict) else {"type": "literal", "value": str(v)}
        bindings.append(b)
    return {"head": {"vars": vars_}, "results": {"bindings": bindings}}


@dataclass
class RemotoFalso:
    """Servidor SPARQL remoto simulado.

    ``reglas``: lista de (predicado(request, consulta) -> bool, respuesta). La respuesta
    puede ser un dict (JSON 200), un ``httpx.Response`` o una excepción a lanzar.
    """

    reglas: list[tuple[Callable[[httpx.Request, str], bool], Any]] = field(default_factory=list)
    llamadas: list[tuple[str, str]] = field(default_factory=list)

    def cuando(self, pred: Callable[[httpx.Request, str], bool], respuesta: Any) -> None:
        self.reglas.insert(0, (pred, respuesta))

    def __call__(self, request: httpx.Request) -> httpx.Response:
        from urllib.parse import parse_qs

        body = request.content.decode()
        consulta = parse_qs(body).get("query", [""])[0]
        self.llamadas.append((str(request.url), consulta))
        for pred, resp in self.reglas:
            if pred(request, consulta):
                if isinstance(resp, BaseException):
                    raise resp
                if isinstance(resp, httpx.Response):
                    return resp
                return httpx.Response(200, json=resp)
        return httpx.Response(200, json=sparql_json([], []))


@pytest.fixture
def remoto() -> RemotoFalso:
    return RemotoFalso()


# ------------------------------------------------------------------ núcleo
def make_settings(tmp_path: Path, modules_dir: Path | None = None, **kw: Any) -> Settings:
    mdir = modules_dir or (tmp_path / "modules")
    mdir.mkdir(parents=True, exist_ok=True)
    kw.setdefault("federation_enabled", True)
    return Settings(modules_dir=mdir, data_dir=tmp_path / "data", _env_file=None, **kw)  # type: ignore[call-arg]


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
def kernel(settings: Settings, remoto: RemotoFalso) -> Iterator[Kernel]:
    k = Kernel(settings, in_memory=True)
    k.http_transport = httpx.MockTransport(remoto)  # type: ignore[attr-defined]
    yield k


@pytest.fixture
def app(settings: Settings, kernel: Kernel):  # type: ignore[no-untyped-def]
    return create_app(settings, kernel, with_mcp=False)


@pytest.fixture
def client(app) -> Iterator[TestClient]:  # type: ignore[no-untyped-def]
    with TestClient(app) as c:
        yield c


# --------------------------------------------------------- campaña de prueba
@dataclass
class Campana:
    """Ids de la campaña pequeña construida por la API."""

    id: str
    madrid: str
    toledo: str
    s1: str
    s2: str
    s3: str
    ernesto: str
    lucia: str
    faccion: str
    subfaccion: str
    extra: dict[str, str] = field(default_factory=dict)


def crear_entidad(client: TestClient, cid: str, clases: list[str], valores: dict[str, list[Any]],
                  eid: str | None = None, **headers: str) -> str:
    body: dict[str, Any] = {"clases": clases, "valores": valores}
    if eid:
        body["id"] = eid
    r = client.post(f"/campanas/{cid}/entidades", json=body, headers=headers or None)
    assert r.status_code == 201, r.json()
    return r.json()["id"]


def construir_campana(client: TestClient, cid: str = CAMP) -> Campana:
    """Campaña pequeña: lugares, sesiones, facciones, un PNJ y un PJ con relación cualificada."""
    r = client.post("/campanas", json={"nombre": "Prueba", "id": cid, "modulos": []})
    assert r.status_code == 201, r.json()
    madrid = crear_entidad(client, cid, ["rpg:Place"], {
        "rdfs:label": ["Madrid"], "rpg:correspondsTo": [WD_MADRID]}, eid="madrid")
    toledo = crear_entidad(client, cid, ["rpg:Place"], {"rdfs:label": ["Toledo"]}, eid="toledo")
    s1 = crear_entidad(client, cid, ["rpg:Session"], {"rdfs:label": ["Sesión 1"], "rpg:sessionNumber": [1]}, eid="s1")
    s2 = crear_entidad(client, cid, ["rpg:Session"], {"rdfs:label": ["Sesión 2"], "rpg:sessionNumber": [2]}, eid="s2")
    s3 = crear_entidad(client, cid, ["rpg:Session"], {"rdfs:label": ["Sesión 3"], "rpg:sessionNumber": [3]}, eid="s3")
    faccion = crear_entidad(client, cid, ["rpg:Faction"], {"rdfs:label": ["Camarilla"]}, eid="camarilla")
    sub = crear_entidad(client, cid, ["rpg:Faction"], {
        "rdfs:label": ["Primogenitura"], "rpg:memberOf": [faccion]}, eid="primogenitura")
    ernesto = crear_entidad(client, cid, ["rpg:NonPlayerCharacter"], {
        "rdfs:label": ["Don Ernesto"], "rpg:locatedIn": [toledo], "rpg:memberOf": [sub],
        "schema:description": ["Prestamista de la corte"]}, eid="ernesto")
    lucia = crear_entidad(client, cid, ["rpg:PlayerCharacter"], {
        "rdfs:label": ["Lucía"], "rpg:locatedIn": [madrid],
        "rpg:hasRelationship": [{"valores": {
            "rpg:target": [ernesto], "rpg:relationshipType": ["rpg:rel-debt"],
            "rpg:strength": [-2], "rpg:validFrom": [s1]}}],
    }, eid="lucia")
    return Campana(id=cid, madrid=madrid, toledo=toledo, s1=s1, s2=s2, s3=s3, ernesto=ernesto, lucia=lucia,
                   faccion=faccion, subfaccion=sub)


@dataclass
class _Plantilla:
    campana: Campana
    quads: list[Any]
    meta: list[tuple[str, str, float, float]]


@pytest.fixture(scope="session")
def _plantilla(tmp_path_factory: pytest.TempPathFactory) -> _Plantilla:
    """Construye la campaña de prueba UNA vez por la API y guarda una instantánea.

    Así cada prueba parte de un núcleo nuevo con los mismos datos sin repetir las
    validaciones SHACL de la construcción (la batería es mucho más rápida)."""
    tmp = tmp_path_factory.mktemp("plantilla")
    s = make_settings(tmp)
    k = Kernel(s, in_memory=True)
    k.http_transport = httpx.MockTransport(RemotoFalso())  # type: ignore[attr-defined]
    with TestClient(create_app(s, k, with_mcp=False)) as c:
        camp = construir_campana(c)
        quads = list(k.store.store)
        with k.aux.lock:
            meta = k.aux.conn.execute("SELECT iri, campana, creada, modificada FROM entidad_meta").fetchall()
    return _Plantilla(campana=camp, quads=quads, meta=meta)


@pytest.fixture
def campana(client: TestClient, kernel: Kernel, _plantilla: _Plantilla) -> Campana:
    """Campaña de prueba (ver :func:`construir_campana`), restaurada desde la instantánea."""
    kernel.store.store.extend(_plantilla.quads)
    kernel.campaigns.invalidate()
    kernel.campaigns.rebuild_indexes()  # reglas, índice de búsqueda y metadatos
    for iri, cid, creada, modificada in _plantilla.meta:  # fechas con precisión de subsegundo
        kernel.aux.touch(iri, cid, modificada)
        kernel.aux.touch(iri, cid, creada)
    return _plantilla.campana


# ------------------------------------------------------------ módulos falsos
MOD_ONTOLOGY = """\
@prefix rpg:  <https://loregraph.example.org/ont/core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix {prefijo}: <{iri}> .

{prefijo}:Monster a owl:Class ;
    rdfs:subClassOf rpg:Character ;
    rpg:variantOf rpg:Character ;
    rdfs:label "Monstruo {id}"@es , "Monster {id}"@en .

{prefijo}:ferocity a owl:DatatypeProperty ;
    rdfs:label "ferocidad"@es , "ferocity"@en .
"""

MOD_SHAPES = """\
@prefix sh:   <http://www.w3.org/ns/shacl#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix {prefijo}: <{iri}> .

{prefijo}:MonsterShape a sh:NodeShape ;
    sh:targetClass {prefijo}:Monster ;
    sh:property [
        sh:path {prefijo}:ferocity ;
        sh:name "ferocidad"@es , "ferocity"@en ;
        sh:datatype xsd:integer ; sh:maxCount 1 ;
        sh:minInclusive 0 ; sh:maxInclusive 5 ;
        sh:order 10 ;
    ] .
"""


def escribir_modulo(
    base: Path,
    mid: str,
    version: str = "0.1.0",
    depende_de: dict[str, str] | None = None,
    categoria: str = "sistema",
    tema: dict[str, Any] | None = None,
    extra_manifest: str = "",
    ontologia: bool = True,
) -> Path:
    """Crea un módulo mínimo en ``base/<mid>`` (manifest.yaml + ontology.ttl + shapes.ttl)."""
    import yaml

    d = base / mid
    d.mkdir(parents=True, exist_ok=True)
    iri = f"https://rpg-modules.example.net/{mid}/ont#"
    prefijo = mid.replace("-", "").replace("_", "")
    man: dict[str, Any] = {
        "id": mid,
        "nombre": {"es": f"Módulo {mid}", "en": f"Module {mid}"},
        "descripcion": {"es": "Módulo de prueba", "en": "Test module"},
        "version": version,
        "categoria": categoria,
        "iri": iri,
        "prefijo": prefijo,
        "depende_de": depende_de if depende_de is not None else {"core": ">=0.1"},
        "vocabulario": [],
        "estilos_tipos": {f"{prefijo}:Monster": {"color": "#123456", "forma": "star", "icono": "skull"}},
    }
    if tema is not None:
        man["tema"] = tema
    (d / "manifest.yaml").write_text(yaml.safe_dump(man, allow_unicode=True) + extra_manifest, encoding="utf-8")
    if ontologia:
        (d / "ontology.ttl").write_text(MOD_ONTOLOGY.format(prefijo=prefijo, iri=iri, id=mid), encoding="utf-8")
        (d / "shapes.ttl").write_text(MOD_SHAPES.format(prefijo=prefijo, iri=iri), encoding="utf-8")
    return d
