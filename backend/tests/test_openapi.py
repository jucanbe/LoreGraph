"""Esquema OpenAPI (del que se generan los tipos TypeScript del frontend)."""

from __future__ import annotations

from collections import Counter

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _operaciones(spec: dict) -> list[str]:
    return [op["operationId"] for path in spec["paths"].values() for op in path.values() if "operationId" in op]


def test_openapi_se_construye_con_las_rutas_principales(app: FastAPI) -> None:
    spec = app.openapi()
    assert spec["info"]["title"].startswith("LoreGraph")
    for ruta in ("/campanas/{cid}/formularios/{clase}", "/campanas/{cid}/grafo", "/campanas/{cid}/sparql",
                 "/campanas/{cid}/propuestas/{pid}/aprobar", "/busqueda", "/modulos",
                 "/campanas/{cid}/entidades/{eid}", "/campanas/{cid}/conocimiento/{eid}",
                 "/campanas/{cid}/entidades/{eid}/mundo-real", "/modulos/{mid}/assets/{ruta}"):
        assert ruta in spec["paths"], ruta


def test_operation_ids_unicos(app: FastAPI) -> None:
    ids = _operaciones(app.openapi())
    repetidos = [k for k, v in Counter(ids).items() if v > 1]
    assert repetidos == []
    assert "formulario" in ids and "aprobar" in ids and "busqueda" in ids


def test_esquemas_de_modelos(app: FastAPI) -> None:
    schemas = app.openapi()["components"]["schemas"]
    for nombre in ("Formulario", "Campo", "Entidad", "Grafo", "PropuestaDetalle", "ResultadoSparql",
                   "ErrorRespuesta", "MundoReal", "ConocimientoPersonaje"):
        assert nombre in schemas, nombre
    tipos = schemas["Campo"]["properties"]["tipo"]
    assert "objeto" in str(tipos) and "referencia" in str(tipos)
    aprobar = app.openapi()["paths"]["/campanas/{cid}/propuestas/{pid}/aprobar"]["post"]
    assert {"404", "409", "422"} <= set(aprobar["responses"])


def test_openapi_por_http(client: TestClient) -> None:
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "/campanas/{cid}/sparql" in r.json()["paths"]


def test_app_con_mcp_montado(settings, kernel) -> None:  # type: ignore[no-untyped-def]
    """Con MCP la aplicación se construye y el esquema sigue siendo válido (sin arrancar el servidor)."""
    from loregraph.main import create_app

    app = create_app(settings, kernel, with_mcp=True)
    spec = app.openapi()
    assert "/busqueda" in spec["paths"]
    assert len(set(_operaciones(spec))) == len(_operaciones(spec))
