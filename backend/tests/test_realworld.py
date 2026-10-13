"""Mundo real: datos de Wikidata/DBpedia para las anclas de una entidad (respuestas simuladas)."""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import WD_MADRID, Campana, RemotoFalso, sparql_json

URL = "/campanas/prueba/entidades/madrid/mundo-real"


def es_wd_principal(req: httpx.Request, q: str) -> bool:
    return "query.wikidata.org" in str(req.url) and "?labelAlt" in q


def es_wd_hechos(req: httpx.Request, q: str) -> bool:
    return "query.wikidata.org" in str(req.url) and "?vLabel" in q


def es_dbpedia_resumen(req: httpx.Request, q: str) -> bool:
    return "dbpedia.org" in str(req.url) and "dbo:abstract ?abs" in q and "owl:sameAs" in q


def es_dbpedia_recurso(req: httpx.Request, q: str) -> bool:
    return "dbpedia.org" in str(req.url) and "geo:lat" in q


PRINCIPAL = sparql_json(["label", "labelAlt", "desc", "descAlt", "image", "coord", "article"], [{
    "label": {"type": "literal", "value": "Madrid", "xml:lang": "es"},
    "labelAlt": {"type": "literal", "value": "Madrid (en)", "xml:lang": "en"},
    "desc": {"type": "literal", "value": "capital de España", "xml:lang": "es"},
    "image": {"type": "uri", "value": "http://commons.wikimedia.org/wiki/Special:FilePath/Madrid.jpg"},
    "coord": {"type": "literal", "value": "Point(-3.7 40.4)",
              "datatype": "http://www.opengis.net/ont/geosparql#wktLiteral"},
    "article": {"type": "uri", "value": "https://es.wikipedia.org/wiki/Madrid"},
}])

HECHOS = sparql_json(["p", "v", "vLabel"], [
    {"p": {"type": "uri", "value": "http://www.wikidata.org/prop/direct/P17"},
     "v": {"type": "uri", "value": "http://www.wikidata.org/entity/Q29"},
     "vLabel": {"type": "literal", "value": "España", "xml:lang": "es"}},
    {"p": {"type": "uri", "value": "http://www.wikidata.org/prop/direct/P1082"},
     "v": {"type": "literal", "value": "3300000", "datatype": "http://www.w3.org/2001/XMLSchema#decimal"},
     "vLabel": {"type": "literal", "value": "3300000"}},
    {"p": {"type": "uri", "value": "http://www.wikidata.org/prop/direct/P571"},
     "v": {"type": "literal", "value": "0852-01-01T00:00:00Z", "datatype": "http://www.w3.org/2001/XMLSchema#dateTime"},
     "vLabel": {"type": "literal", "value": "0852-01-01T00:00:00Z"}},
    {"p": {"type": "uri", "value": "http://www.wikidata.org/prop/direct/P17"},
     "v": {"type": "uri", "value": "http://www.wikidata.org/entity/Q29"},
     "vLabel": {"type": "literal", "value": "España", "xml:lang": "es"}},
])

RESUMEN = sparql_json(["abs"], [
    {"abs": {"type": "literal", "value": "Madrid es la capital de España.", "xml:lang": "es"}}])


@pytest.fixture
def wikidata(remoto: RemotoFalso) -> RemotoFalso:
    remoto.cuando(es_wd_principal, PRINCIPAL)
    remoto.cuando(es_wd_hechos, HECHOS)
    remoto.cuando(es_dbpedia_resumen, RESUMEN)
    return remoto


def test_datos_de_wikidata_y_dbpedia(campana: Campana, client: TestClient, wikidata: RemotoFalso) -> None:
    r = client.get(URL)
    assert r.status_code == 200, r.json()
    res = r.json()
    assert res["entidad"]["id"] == "madrid"
    assert len(res["anclas"]) == 1
    a = res["anclas"][0]
    assert a["iri"] == WD_MADRID
    assert a["fuente"] == "wikidata"
    assert a["relacion"] == "rpg:correspondsTo"
    assert a["etiqueta"] == "Madrid"
    assert a["descripcion"] == "capital de España"
    assert a["imagen"].endswith("Madrid.jpg")
    assert a["latitud"] == pytest.approx(40.4) and a["longitud"] == pytest.approx(-3.7)
    assert a["resumen"] == "Madrid es la capital de España."
    assert a["enlace"] == "https://es.wikipedia.org/wiki/Madrid"
    assert a["error"] is None
    hechos = {h["propiedad"]: h for h in a["hechos"]}
    assert hechos["wdt:P17"] == {"propiedad": "wdt:P17", "etiqueta": "país", "valores": ["España"]}
    assert hechos["wdt:P1082"]["valores"] == ["3300000"]
    assert hechos["wdt:P571"]["valores"] == ["0852-01-01"]
    # el orden de los hechos sigue FACT_PROPS
    assert [h["propiedad"] for h in a["hechos"]] == ["wdt:P17", "wdt:P571", "wdt:P1082"]
    # tres consultas: principal y hechos en Wikidata, resumen en DBpedia; la del resumen usa el QID
    assert len(wikidata.llamadas) == 3
    resumen_q = next(q for u, q in wikidata.llamadas if "dbpedia" in u)
    assert WD_MADRID in resumen_q and 'lang(?abs) = "es"' in resumen_q


def test_cache_de_mundo_real(campana: Campana, client: TestClient, wikidata: RemotoFalso) -> None:
    client.get(URL)
    n = len(wikidata.llamadas)
    a2 = client.get(URL).json()["anclas"][0]
    assert len(wikidata.llamadas) == n
    assert a2["etiqueta"] == "Madrid"


def test_mundo_real_en_ingles(campana: Campana, client: TestClient, wikidata: RemotoFalso) -> None:
    a = client.get(URL, params={"idioma": "en"}).json()["anclas"][0]
    principal = next(q for u, q in wikidata.llamadas if "?labelAlt" in q)
    assert 'lang(?label) = "en"' in principal and 'lang(?labelAlt) = "es"' in principal
    assert {h["propiedad"]: h["etiqueta"] for h in a["hechos"]}["wdt:P17"] == "country"


def test_sin_resultados_usa_enlace_a_wikidata(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    a = client.get(URL).json()["anclas"][0]
    assert a["etiqueta"] is None and a["latitud"] is None and a["hechos"] == []
    assert a["enlace"] == "https://www.wikidata.org/wiki/Q2807"
    assert a["error"] is None


@pytest.mark.parametrize("fallo", [httpx.ConnectTimeout("lento"), httpx.Response(503), httpx.ConnectError("x")])
def test_errores_remotos_no_dan_500(campana: Campana, client: TestClient, remoto: RemotoFalso, fallo: object) -> None:
    remoto.cuando(lambda req, q: True, fallo)
    r = client.get(URL)
    assert r.status_code == 200
    a = r.json()["anclas"][0]
    assert a["error"]
    assert a["iri"] == WD_MADRID and a["relacion"] == "rpg:correspondsTo"


def test_errores_no_se_guardan_en_cache(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(lambda req, q: True, httpx.ReadTimeout("lento"))
    assert client.get(URL).json()["anclas"][0]["error"]
    remoto.reglas.clear()
    remoto.cuando(es_wd_principal, PRINCIPAL)
    assert client.get(URL).json()["anclas"][0]["etiqueta"] == "Madrid"


def test_hechos_y_resumen_son_opcionales(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(es_wd_principal, PRINCIPAL)
    remoto.cuando(es_wd_hechos, httpx.Response(500))
    remoto.cuando(es_dbpedia_resumen, httpx.ReadTimeout("lento"))
    a = client.get(URL).json()["anclas"][0]
    assert a["error"] is None
    assert a["etiqueta"] == "Madrid"
    assert a["hechos"] == [] and a["resumen"] is None


def test_fecha_con_signo(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    remoto.cuando(es_wd_principal, PRINCIPAL)
    remoto.cuando(es_wd_hechos, sparql_json(["p", "v"], [
        {"p": {"type": "uri", "value": "http://www.wikidata.org/prop/direct/P571"},
         "v": {"type": "literal", "value": "-0753-04-21T00:00:00Z",
               "datatype": "http://www.w3.org/2001/XMLSchema#dateTime"}}]))
    a = client.get(URL).json()["anclas"][0]
    assert a["hechos"][0]["valores"] == ["-0753-04-21"]


def test_ancla_dbpedia(campana: Campana, client: TestClient, remoto: RemotoFalso) -> None:
    client.put("/campanas/prueba/entidades/toledo", json={"clases": ["rpg:Place"], "valores": {
        "rdfs:label": ["Toledo"], "rpg:inspiredBy": ["http://es.dbpedia.org/resource/Toledo"]}})
    remoto.cuando(es_dbpedia_recurso, sparql_json(["label", "abs", "thumb", "lat", "long", "page"], [{
        "label": {"type": "literal", "value": "Toledo", "xml:lang": "es"},
        "abs": {"type": "literal", "value": "Ciudad de España.", "xml:lang": "es"},
        "thumb": {"type": "uri", "value": "http://example.org/toledo.jpg"},
        "lat": {"type": "literal", "value": "39.86"},
        "long": {"type": "literal", "value": "no-numérico"},
        "page": {"type": "uri", "value": "https://es.wikipedia.org/wiki/Toledo"},
    }]))
    a = client.get("/campanas/prueba/entidades/toledo/mundo-real").json()["anclas"][0]
    assert a["fuente"] == "dbpedia" and a["relacion"] == "rpg:inspiredBy"
    assert a["etiqueta"] == "Toledo" and a["resumen"] == "Ciudad de España."
    assert a["latitud"] == pytest.approx(39.86) and a["longitud"] is None
    assert a["enlace"] == "https://es.wikipedia.org/wiki/Toledo"
    q = next(q for u, q in remoto.llamadas if "geo:lat" in q)
    assert "<http://dbpedia.org/resource/Toledo>" in q


def test_federacion_desactivada(campana: Campana, client: TestClient, kernel: Kernel, remoto: RemotoFalso) -> None:
    kernel.settings.federation_enabled = False
    a = client.get(URL).json()["anclas"][0]
    assert a["error"] == "La consulta al mundo real está desactivada"
    assert remoto.llamadas == []


def test_entidad_sin_anclas_y_recursos_no_admitidos(campana: Campana, client: TestClient, kernel: Kernel,
                                                    remoto: RemotoFalso) -> None:
    res = client.get("/campanas/prueba/entidades/lucia/mundo-real").json()
    assert res["anclas"] == []
    assert client.get("/campanas/prueba/entidades/nada/mundo-real").status_code == 404
    m = kernel.realworld.describe("https://example.org/algo", "rpg:inspiredBy")
    assert m.error == "Solo se admiten recursos de Wikidata o DBpedia"
    assert remoto.llamadas == []
