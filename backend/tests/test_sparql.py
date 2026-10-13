"""SPARQL de solo lectura, consultas guardadas y destinos remotos simulados (sin red)."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import Campana, RemotoFalso, sparql_json

Q = "/campanas/prueba/sparql"


def _q(client: TestClient, consulta: str, **kw) -> httpx.Response:  # type: ignore[no-untyped-def]
    return client.post(Q, json={"consulta": consulta, **kw})


def test_select_sin_prefijos_declarados(campana: Campana, client: TestClient) -> None:
    r = _q(client, "SELECT ?s ?n WHERE { ?s a rpg:PlayerCharacter ; rdfs:label ?n }")
    assert r.status_code == 200, r.json()
    res = r.json()
    assert res["tipo"] == "select"
    assert res["variables"] == ["s", "n"]
    assert len(res["filas"]) == 1
    fila = res["filas"][0]
    assert fila["s"]["id"] == "lucia" and fila["s"]["etiqueta"] == "Lucía" and fila["s"]["tipo"] == "iri"
    assert fila["n"] == {"tipo": "literal", "valor": "Lucía", "etiqueta": "Lucía", "id": None, "clave": None,
                         "datatype": "http://www.w3.org/2001/XMLSchema#string", "idioma": None}
    assert res["truncado"] is False and res["cache"] is False


def test_lee_canon_derivado_y_vocabulario(campana: Campana, client: TestClient) -> None:
    res = _q(client, "SELECT ?b WHERE { ?a rpg:relatedTo ?b }").json()
    assert [f["b"]["id"] for f in res["filas"]] == ["ernesto"]
    res = _q(client, 'SELECT ?c WHERE { ?c skos:inScheme rpg:RelationshipTypes }').json()
    assert {f["c"]["clave"] for f in res["filas"]} >= {"rpg:rel-ally", "rpg:rel-debt"}
    # la procedencia y las propuestas no están en el grafo por defecto, pero sí como grafos con nombre
    assert _q(client, "ASK { ?c a rpg:Change }").json()["booleano"] is False
    assert _q(client, "ASK { GRAPH ?g { ?c a rpg:Change } }").json()["booleano"] is True


@pytest.mark.parametrize("consulta", [
    "INSERT DATA { <urn:a> <urn:b> <urn:c> }",
    "PREFIX x: <urn:x#>\nDELETE WHERE { ?s ?p ?o }",
    "  delete data { <urn:a> <urn:b> <urn:c> }",
    "# comentario\nDROP GRAPH <urn:g>",
    "CLEAR ALL",
    "LOAD <http://example.org/data.ttl>",
])
def test_actualizaciones_rechazadas(campana: Campana, client: TestClient, kernel: Kernel, consulta: str) -> None:
    antes = len(kernel.store.graph_triples(kernel.iris.canon("prueba")))
    r = _q(client, consulta)
    assert r.status_code == 400
    assert "solo se permiten" in r.json()["detalle"].lower()
    assert len(kernel.store.graph_triples(kernel.iris.canon("prueba"))) == antes


def test_actualizacion_rechazada_tambien_en_remoto(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    assert _q(client, "INSERT DATA { <urn:a> <urn:b> <urn:c> }", destino="wikidata").status_code == 400
    assert remoto.llamadas == []


def test_actualizacion_con_with_rechazada(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    """``WITH … DELETE`` no lo detecta la expresión regular, pero el motor solo admite consultas de lectura."""
    antes = len(kernel.store.graph_triples(kernel.iris.canon("prueba")))
    r = _q(client, f"WITH <{kernel.iris.canon('prueba')}> DELETE {{ ?s ?p ?o }} WHERE {{ ?s ?p ?o }}")
    assert r.status_code == 400
    assert len(kernel.store.graph_triples(kernel.iris.canon("prueba"))) == antes


def test_error_de_sintaxis_400(campana: Campana, client: TestClient) -> None:
    r = _q(client, "SELECT ?s WHERE { ?s ?p }")
    assert r.status_code == 400
    assert r.json()["detalle"].startswith("Consulta no válida")
    assert _q(client, "SELECT ?s WHERE { ?s a zz:Nada }").status_code == 400


def test_limite_y_truncado(campana: Campana, client: TestClient) -> None:
    res = _q(client, "SELECT ?e WHERE { ?e rdfs:label ?l }", limite=2).json()
    assert len(res["filas"]) == 2 and res["truncado"] is True
    res = _q(client, "SELECT ?e WHERE { ?e a rpg:Place }", limite=2).json()
    assert len(res["filas"]) == 2 and res["truncado"] is False
    assert _q(client, "SELECT * WHERE { ?s ?p ?o }", limite=0).status_code == 422


def test_limite_maximo_de_configuracion(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    kernel.settings.sparql_max_results = 3
    res = _q(client, "SELECT ?e WHERE { ?e rdfs:label ?l }", limite=500).json()
    assert len(res["filas"]) == 3 and res["truncado"] is True


def test_ask_y_construct(campana: Campana, client: TestClient) -> None:
    res = _q(client, "ASK { ?x rpg:locatedIn ?y }").json()
    assert res["tipo"] == "ask" and res["booleano"] is True
    res = _q(client, "CONSTRUCT { ?a rpg:locatedIn ?b } WHERE { ?a rpg:locatedIn ?b }").json()
    assert res["tipo"] == "construct"
    pares = {(t["sujeto"]["etiqueta"], t["predicado"]["clave"], t["objeto"]["etiqueta"]) for t in res["tripletas"]}
    assert pares == {("Lucía", "rpg:locatedIn", "Madrid"), ("Don Ernesto", "rpg:locatedIn", "Toledo")}
    res = _q(client, "CONSTRUCT { ?a ?p ?b } WHERE { ?a ?p ?b }", limite=3).json()
    assert len(res["tripletas"]) == 3 and res["truncado"] is True


def test_describe(campana: Campana, client: TestClient) -> None:
    iri = "https://loregraph.example.org/data/campaign/prueba/entity/toledo"
    res = _q(client, f"DESCRIBE <{iri}>").json()
    assert res["tipo"] == "construct"
    assert any(t["predicado"]["clave"] == "rdfs:label" for t in res["tripletas"])


def test_campana_desconocida_404(client: TestClient) -> None:
    assert client.post("/campanas/nada/sparql", json={"consulta": "ASK {}"}).status_code == 404


# -------------------------------------------------------- ejemplos y guardadas
def test_ejemplos_del_nucleo(campana: Campana, client: TestClient) -> None:
    ejemplos = client.get(f"{Q}/ejemplos").json()
    ids = [e["id"] for e in ejemplos]
    assert ids == ["core:01-personajes-faccion", "core:02-tramas-abiertas", "core:03-relaciones-en-sesion",
                   "core:04-federada-wikidata"]
    assert all(e["modulo"] == "core" and e["titulo"] and e["descripcion"] for e in ejemplos)
    assert ejemplos[0]["titulo"] == "Personajes y sus facciones"
    # los ejemplos locales se ejecutan sin errores (el federado necesitaría red)
    for e in ejemplos:
        if "SERVICE" in e["consulta"]:
            continue
        r = _q(client, e["consulta"])
        assert r.status_code == 200, (e["id"], r.json())


def test_consultas_guardadas(campana: Campana, client: TestClient) -> None:
    r = client.post(f"{Q}/guardadas", json={"titulo": "Mis PJ", "descripcion": "todos",
                                            "consulta": "SELECT ?p WHERE { ?p a rpg:PlayerCharacter }"})
    assert r.status_code == 201
    g = r.json()
    assert g["id"].startswith("guardada:") and g["guardada"] is True
    ejemplos = client.get(f"{Q}/ejemplos").json()
    assert ejemplos[-1]["id"] == g["id"] and ejemplos[-1]["titulo"] == "Mis PJ"
    assert client.delete(f"{Q}/guardadas/{g['id']}").status_code == 204
    assert client.delete(f"{Q}/guardadas/{g['id']}").status_code == 404
    assert all(not e["guardada"] for e in client.get(f"{Q}/ejemplos").json())
    assert client.post(f"{Q}/guardadas", json={"titulo": "", "consulta": "x"}).status_code == 422


def test_consultas_guardadas_por_campana(campana: Campana, client: TestClient) -> None:
    client.post("/campanas", json={"nombre": "Otra", "id": "otra"})
    g = client.post(f"{Q}/guardadas", json={"titulo": "t", "consulta": "ASK {}"}).json()
    assert not [e for e in client.get("/campanas/otra/sparql/ejemplos").json() if e["guardada"]]
    assert client.delete(f"/campanas/otra/sparql/guardadas/{g['id']}").status_code == 404


# ------------------------------------------------------------------- remotas
WD_ROWS = sparql_json(["item", "label"], [
    {"item": {"type": "uri", "value": "http://www.wikidata.org/entity/Q2807"},
     "label": {"type": "literal", "value": "Madrid", "xml:lang": "es"}},
    {"item": {"type": "uri", "value": "http://www.wikidata.org/entity/Q5836"},
     "label": {"type": "literal", "value": "Toledo", "xml:lang": "es"}},
])


def test_destino_wikidata_con_cache(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(lambda req, q: "query.wikidata.org" in str(req.url), WD_ROWS)
    consulta = "SELECT ?item ?label WHERE { ?item wdt:P31 wd:Q515 }"
    res = _q(client, consulta, destino="wikidata").json()
    assert res["tipo"] == "select"
    assert res["variables"] == ["item", "label"]
    assert res["filas"][0]["item"]["valor"] == "http://www.wikidata.org/entity/Q2807"
    assert res["filas"][0]["label"]["idioma"] == "es"
    assert res["cache"] is False
    assert len(remoto.llamadas) == 1
    url, enviada = remoto.llamadas[0]
    assert url == "https://query.wikidata.org/sparql" and enviada == consulta
    res2 = _q(client, consulta, destino="wikidata").json()
    assert res2["cache"] is True
    assert res2["filas"] == res["filas"]
    assert len(remoto.llamadas) == 1
    # otro límite = otra clave de caché; el truncado se calcula sobre los resultados remotos
    res3 = _q(client, consulta, destino="wikidata", limite=1).json()
    assert len(res3["filas"]) == 1 and res3["truncado"] is True and res3["cache"] is False


def test_destino_dbpedia_y_ask(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(lambda req, q: "dbpedia.org" in str(req.url), {"head": {}, "boolean": True})
    res = _q(client, "ASK { ?s ?p ?o }", destino="dbpedia").json()
    assert res["tipo"] == "ask" and res["booleano"] is True
    assert remoto.llamadas[0][0] == "https://dbpedia.org/sparql"


@pytest.mark.parametrize(("respuesta", "estado"), [
    (httpx.Response(500, text="boom"), 502),
    (httpx.Response(400, text="Parse error"), 400),
    (httpx.Response(200, text="<html>no json</html>"), 502),
    (httpx.ReadTimeout("lento"), 504),
    (httpx.ConnectError("sin conexión"), 502),
])
def test_errores_remotos(campana: Campana, client: TestClient, remoto: RemotoFalso, respuesta: object,
                         estado: int) -> None:
    remoto.cuando(lambda req, q: True, respuesta)
    r = _q(client, "SELECT * WHERE { ?s ?p ?o }", destino="wikidata")
    assert r.status_code == estado, r.json()
    assert r.json()["detalle"]


def test_federacion_desactivada(campana: Campana, client: TestClient, kernel: Kernel, remoto: RemotoFalso) -> None:
    kernel.settings.federation_enabled = False
    r = _q(client, "SELECT * WHERE { ?s ?p ?o }", destino="wikidata")
    assert r.status_code == 400
    r = _q(client, "SELECT * WHERE { SERVICE <https://query.wikidata.org/sparql> { ?s ?p ?o } }")
    assert r.status_code == 400
    assert remoto.llamadas == []
