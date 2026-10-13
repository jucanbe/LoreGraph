"""Consultas federadas (``SERVICE``): se resuelven con httpx simulado, nunca con HTTP de pyoxigraph."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import WD_MADRID, Campana, RemotoFalso, sparql_json

Q = "/campanas/prueba/sparql"
WD = "https://query.wikidata.org/sparql"

RESPUESTA = sparql_json(["real", "nombreReal", "coordenadas"], [{
    "real": {"type": "uri", "value": WD_MADRID},
    "nombreReal": {"type": "literal", "value": "Madrid", "xml:lang": "es"},
    "coordenadas": {"type": "literal", "value": "Point(-3.7 40.4)",
                    "datatype": "http://www.opengis.net/ont/geosparql#wktLiteral"},
}])


def _ejemplo_federado(client: TestClient) -> str:
    return next(e["consulta"] for e in client.get(f"{Q}/ejemplos").json() if e["id"] == "core:04-federada-wikidata")


def test_ejemplo_federado_con_wikidata_simulado(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(lambda req, q: str(req.url) == WD, RESPUESTA)
    r = client.post(Q, json={"consulta": _ejemplo_federado(client)})
    assert r.status_code == 200, r.json()
    res = r.json()
    assert res["tipo"] == "select"
    assert len(res["filas"]) == 1
    fila = res["filas"][0]
    assert fila["lugar"]["id"] == "madrid"
    assert fila["nombreReal"]["valor"] == "Madrid" and fila["nombreReal"]["idioma"] == "es"
    assert fila["coordenadas"]["valor"] == "Point(-3.7 40.4)"
    # el endpoint recibe la variable de unión con los valores locales (bind join)
    assert len(remoto.llamadas) == 1
    url, enviada = remoto.llamadas[0]
    assert url == WD
    assert "VALUES (" in enviada and "?real" in enviada and f"<{WD_MADRID}>" in enviada, enviada
    assert "SERVICE" not in enviada.upper().replace("SERVICEPARAM", "")


def test_cache_de_consultas_federadas(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(lambda req, q: True, RESPUESTA)
    consulta = _ejemplo_federado(client)
    assert client.post(Q, json={"consulta": consulta}).json()["cache"] is False
    segunda = client.post(Q, json={"consulta": consulta}).json()
    assert segunda["cache"] is True
    assert len(remoto.llamadas) == 1


def test_sin_valores_locales_no_se_llama_al_endpoint(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    consulta = """SELECT ?x ?n WHERE { ?x a rpg:Item ; rpg:correspondsTo ?real .
                  SERVICE <https://query.wikidata.org/sparql> { ?real rdfs:label ?n } }"""
    res = client.post(Q, json={"consulta": consulta}).json()
    assert res["filas"] == []
    assert remoto.llamadas == []


@pytest.mark.parametrize(("consulta", "texto"), [
    ("SELECT * WHERE { SERVICE <https://evil.example.org/sparql> { ?s ?p ?o } }", "no permitido"),
    ("SELECT * WHERE { SERVICE ?ep { ?s ?p ?o } }", "SERVICE"),
    ("SELECT * WHERE { SERVICE <https://query.wikidata.org/sparql> { SERVICE <https://dbpedia.org/sparql> "
     "{ ?s ?p ?o } } }", "anidados"),
])
def test_service_no_admitido(campana: Campana, client: TestClient, remoto: RemotoFalso, consulta: str,
                             texto: str) -> None:
    r = client.post(Q, json={"consulta": consulta})
    assert r.status_code == 400, r.json()
    assert texto.lower() in r.json()["detalle"].lower()
    assert remoto.llamadas == []


def test_service_silent_tolera_fallos(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(lambda req, q: True, httpx.Response(500))
    consulta = """SELECT ?lugar ?n WHERE { ?lugar rpg:correspondsTo ?real .
                  OPTIONAL { SERVICE SILENT <https://query.wikidata.org/sparql> { ?real rdfs:label ?n } } }"""
    r = client.post(Q, json={"consulta": consulta})
    assert r.status_code == 200, r.json()
    assert [f["lugar"]["id"] for f in r.json()["filas"]] == ["madrid"]
    r = client.post(Q, json={"consulta": consulta.replace("SILENT ", "")})
    assert r.status_code == 502


def test_service_dentro_de_cadena_no_es_federada(campana: Campana, client: TestClient, kernel: Kernel,
                                                 remoto: RemotoFalso) -> None:
    kernel.settings.federation_enabled = False  # si se considerase federada, daría 400
    r = client.post(Q, json={"consulta": 'SELECT ?e WHERE { ?e rdfs:label ?l FILTER(?l != "SERVICE <x> { }") }'})
    assert r.status_code == 200
    assert remoto.llamadas == []
