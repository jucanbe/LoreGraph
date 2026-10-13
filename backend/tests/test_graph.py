"""Vista de grafo (Cytoscape): estilos, filtros y estado temporal por sesión."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.conftest import Campana, crear_entidad

G = "/campanas/prueba/grafo"


def _grafo(client: TestClient, **params: Any) -> dict:
    r = client.get(G, params=params)
    assert r.status_code == 200, r.json()
    return r.json()


def _ids(g: dict) -> set[str]:
    return {n["id"] for n in g["nodos"]}


def _cualificadas(g: dict) -> set[tuple[str, str, str]]:
    return {(a["origen"], a["propiedad"], a["destino"]) for a in g["aristas"] if a["cualificada"]}


def test_nodos_con_estilos_del_manifiesto(campana: Campana, client: TestClient) -> None:
    g = _grafo(client)
    nodos = {n["id"]: n for n in g["nodos"]}
    assert set(nodos) == {"madrid", "toledo", "camarilla", "primogenitura", "ernesto", "lucia"}
    assert nodos["lucia"]["tipo"] == "rpg:PlayerCharacter"
    assert nodos["lucia"]["color"] == "#2563eb" and nodos["lucia"]["forma"] == "ellipse"
    assert nodos["lucia"]["icono"] == "user-round"
    assert nodos["madrid"]["forma"] == "round-rectangle" and nodos["madrid"]["color"] == "#059669"
    assert nodos["camarilla"]["forma"] == "hexagon"
    assert nodos["ernesto"]["etiqueta"] == "Don Ernesto"
    assert g["truncado"] is False
    etiquetas = [n["etiqueta"].lower() for n in g["nodos"]]
    assert etiquetas == sorted(etiquetas)


def test_sesiones_opcionales(campana: Campana, client: TestClient) -> None:
    assert {"s1", "s2", "s3"} <= _ids(_grafo(client, sesiones=True))
    assert not {"s1", "s2", "s3"} & _ids(_grafo(client))


def test_aristas_directas_y_cualificadas(campana: Campana, client: TestClient) -> None:
    g = _grafo(client)
    aristas = {(a["origen"], a["propiedad"], a["destino"]): a for a in g["aristas"]}
    loc = aristas[("lucia", "rpg:locatedIn", "madrid")]
    assert loc["color"] == "#059669" and loc["linea"] == "dashed"
    assert loc["etiqueta"] == "ubicado en"
    assert loc["cualificada"] is False
    deuda = aristas[("lucia", "rpg:rel-debt", "ernesto")]
    assert deuda["cualificada"] is True
    assert deuda["intensidad"] == -2
    assert deuda["etiqueta"] == "deuda"
    assert deuda["color"] == "#ca8a04" and deuda["linea"] == "dashed"
    assert ("primogenitura", "rpg:memberOf", "camarilla") in aristas
    # el atajo derivado y las propiedades internas no se dibujan
    props = {a["propiedad"] for a in g["aristas"]}
    assert not props & {"rpg:relatedTo", "rpg:hasRelationship", "rdf:type"}
    # ninguna arista apunta a nodos inexistentes (p. ej. nodos de relación o IRIs reales)
    ids = _ids(g)
    assert all(a["origen"] in ids and a["destino"] in ids for a in g["aristas"])
    assert len({a["id"] for a in g["aristas"]}) == len(g["aristas"])


def test_knows_simetrica_una_sola_arista(campana: Campana, client: TestClient) -> None:
    client.put("/campanas/prueba/entidades/ernesto", json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": ["Don Ernesto"], "rpg:knows": ["lucia"]}})
    g = _grafo(client)
    knows = [a for a in g["aristas"] if a["propiedad"] == "rpg:knows"]
    assert len(knows) == 1  # la regla deriva lucia knows ernesto, pero se dibuja una vez


def test_filtro_por_tipo(campana: Campana, client: TestClient) -> None:
    g = _grafo(client, tipo="rpg:Place")
    assert _ids(g) == {"madrid", "toledo"}
    g = _grafo(client, tipo=["rpg:Character", "rpg:Faction"])
    assert _ids(g) == {"lucia", "ernesto", "camarilla", "primogenitura"}
    assert client.get(G, params={"tipo": "zz:Nada"}).status_code == 400


def test_filtro_por_faccion_incluye_subfacciones(campana: Campana, client: TestClient) -> None:
    assert _ids(_grafo(client, faccion="camarilla")) == {"camarilla", "primogenitura", "ernesto"}
    assert _ids(_grafo(client, faccion="primogenitura")) == {"primogenitura", "ernesto"}


def test_filtro_por_centro_y_profundidad(campana: Campana, client: TestClient) -> None:
    assert _ids(_grafo(client, centro="lucia")) == {"lucia", "madrid", "ernesto"}
    assert _ids(_grafo(client, centro="lucia", profundidad=2)) == {
        "lucia", "madrid", "ernesto", "toledo", "primogenitura"}
    assert "camarilla" in _ids(_grafo(client, centro="lucia", profundidad=3))
    assert client.get(G, params={"centro": "lucia", "profundidad": 9}).status_code == 422


def test_filtro_por_relacion(campana: Campana, client: TestClient) -> None:
    g = _grafo(client, relacion="rpg:locatedIn")
    assert {a["propiedad"] for a in g["aristas"]} == {"rpg:locatedIn"}
    g = _grafo(client, relacion=["rpg:rel-debt", "rpg:memberOf"])
    assert {a["propiedad"] for a in g["aristas"]} == {"rpg:rel-debt", "rpg:memberOf"}


@pytest.fixture
def con_alianza(campana: Campana, client: TestClient) -> Campana:
    """Mateo es aliado de Don Ernesto desde la sesión 1 hasta la 3 (exclusiva)."""
    crear_entidad(client, "prueba", ["rpg:PlayerCharacter"], {
        "rdfs:label": ["Mateo"],
        "rpg:hasRelationship": [{"valores": {
            "rpg:target": ["ernesto"], "rpg:relationshipType": ["rpg:rel-ally"], "rpg:strength": [2],
            "rpg:validFrom": ["s1"], "rpg:validUntil": ["s3"]}}]}, eid="mateo")
    return campana


def test_filtro_temporal_por_sesion(con_alianza: Campana, client: TestClient) -> None:
    alianza = ("mateo", "rpg:rel-ally", "ernesto")
    deuda = ("lucia", "rpg:rel-debt", "ernesto")
    assert alianza in _cualificadas(_grafo(client, sesion=1))
    assert alianza in _cualificadas(_grafo(client, sesion=2))
    assert alianza not in _cualificadas(_grafo(client, sesion=3))
    # sin sesión: estado actual (la alianza ya terminó)
    actual = _cualificadas(_grafo(client))
    assert alianza not in actual and deuda in actual
    # antes de la sesión 1 no existe ninguna de las dos
    assert _cualificadas(_grafo(client, sesion=0)) == set()
    assert deuda in _cualificadas(_grafo(client, sesion=7))
    arista = next(a for a in _grafo(client, sesion=2)["aristas"] if a["propiedad"] == "rpg:rel-ally")
    assert arista["intensidad"] == 2 and arista["ancho"] == 2
    assert client.get(G, params={"sesion": -1}).status_code == 422


def test_relacion_terminada_no_en_el_atajo_derivado(con_alianza: Campana, client: TestClient) -> None:
    ent = client.get("/campanas/prueba/entidades/mateo").json()
    rel = next(r for r in ent["relaciones"] if r["cualificada"])
    assert rel["desde"]["id"] == "s1" and rel["hasta"]["id"] == "s3"
    r = client.post("/campanas/prueba/sparql", json={"consulta": "ASK { ?a rpg:relatedTo ?b . FILTER(?a = <"
                                                                 + ent["iri"] + ">) }"})
    assert r.json()["booleano"] is False


def test_truncado_por_limite(campana: Campana, client: TestClient) -> None:
    for i in range(5):
        crear_entidad(client, "prueba", ["rpg:Item"], {"rdfs:label": [f"Objeto {i}"]})
    g = _grafo(client, limite=10)
    assert g["truncado"] is True
    assert len(g["nodos"]) == 10
    ids = _ids(g)
    assert all(a["origen"] in ids and a["destino"] in ids for a in g["aristas"])
    assert client.get(G, params={"limite": 5}).status_code == 422


def test_grafo_en_ingles(campana: Campana, client: TestClient) -> None:
    g = _grafo(client, idioma="en")
    aristas = {a["propiedad"]: a["etiqueta"] for a in g["aristas"]}
    assert aristas["rpg:locatedIn"] == "located in"
    assert aristas["rpg:rel-debt"] == "debt"


def test_grafo_de_campana_vacia(client: TestClient) -> None:
    client.post("/campanas", json={"nombre": "Vacía", "id": "vacia"})
    assert client.get("/campanas/vacia/grafo").json() == {"nodos": [], "aristas": [], "truncado": False}
