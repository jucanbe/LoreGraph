"""Robustez: las entradas mal formadas deben dar 4xx, nunca un 500."""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.conftest import construir_campana


@pytest.fixture
def cli(app: FastAPI) -> Iterator[TestClient]:

    with TestClient(app, raise_server_exceptions=False) as c:
        construir_campana(c)

        yield c


@pytest.mark.parametrize(
    ("metodo", "url", "kw"),
    [
        ("get", "/campanas/prueba/entidades/zz:x", {}),
        ("get", "/campanas/prueba/entidades/zz:x/procedencia", {}),
        (
            "put",
            "/campanas/prueba/entidades/zz:x",
            {"json": {"clases": ["rpg:Place"], "valores": {"rdfs:label": ["x"]}}},
        ),
        ("get", "/campanas/prueba/formularios/zz:X", {}),
        ("get", "/campanas/prueba/grafo", {"params": {"tipo": "zz:X"}}),
        ("get", "/campanas/prueba/entidades", {"params": {"filtro": "zz:p=lucia"}}),
        ("post", "/campanas/prueba/sparql", {"json": {"consulta": "SELECT * WHERE { ?s zz:p ?o }"}}),
        ("post", "/campanas/prueba/conocimiento/lucia", {"json": [{"s": "zz:x", "p": "rdfs:label", "o": "x"}]}),
    ],
)
def test_prefijo_desconocido_controlado(cli: TestClient, metodo: str, url: str, kw: dict[str, Any]) -> None:

    r = getattr(cli, metodo)(url, **kw)

    assert 400 <= r.status_code < 500, (r.status_code, r.text)


@pytest.mark.parametrize(
    ("metodo", "url", "kw"),
    [
        pytest.param("get", "/campanas/prueba/grafo", {"params": {"centro": "zz:x"}}, id="grafo-centro"),
        pytest.param("get", "/campanas/prueba/grafo", {"params": {"faccion": "zz:x"}}, id="grafo-faccion"),
        pytest.param("get", "/campanas/prueba/grafo", {"params": {"vista": "zz:x"}}, id="grafo-vista"),
        pytest.param("get", "/campanas/prueba/conocimiento/zz:x", {}, id="conocimiento-get"),
        pytest.param("post", "/campanas/prueba/conocimiento/zz:x", {"json": []}, id="conocimiento-post"),
        pytest.param(
            "get", "/campanas/prueba/entidades", {"params": {"filtro": "rpg:memberOf=zz:x"}}, id="filtro-valor"
        ),
        pytest.param("get", "/campanas/prueba/entidades", {"params": {"clase": "zz:X"}}, id="listado-clase"),
        pytest.param("get", "/campanas/prueba/entidades/zz:x/vecindario", {}, id="vecindario"),
        pytest.param(
            "post",
            "/campanas/prueba/propuestas",
            {
                "json": {
                    "agente": "a",
                    "peticion": "p",
                    "destino": "conocimiento/zz:x",
                    "anadir": [{"s": "lucia", "p": "rdfs:label", "o": "x", "literal": True}],
                }
            },
            id="propuesta-destino",
        ),
    ],
)
def test_prefijo_desconocido_da_400(cli: TestClient, metodo: str, url: str, kw: dict[str, Any]) -> None:

    r = getattr(cli, metodo)(url, **kw)

    assert 400 <= r.status_code < 500, (r.status_code, r.text)


def test_cuerpo_no_json_422(cli: TestClient) -> None:

    r = cli.post("/campanas/prueba/entidades", content=b"no es json", headers={"Content-Type": "application/json"})

    assert r.status_code == 422

    assert r.json()["detalle"] == "Petición no válida"


def test_valores_no_lista_422(cli: TestClient) -> None:

    r = cli.post("/campanas/prueba/entidades", json={"clases": ["rpg:Place"], "valores": {"rdfs:label": "Plano"}})

    assert r.status_code == 422

    assert r.json()["errores"][0]["campo"] == "valores.rdfs:label"


def test_x_usuario_en_blanco_usa_el_usuario_por_defecto(cli: TestClient) -> None:

    r = cli.post(
        "/campanas/prueba/entidades",
        headers={"X-Usuario": "   "},
        json={"clases": ["rpg:Item"], "valores": {"rdfs:label": ["Anillo"]}, "id": "anillo"},
    )

    assert r.status_code == 201

    assert cli.get("/campanas/prueba/entidades/anillo/procedencia").json()[0]["agente"]["nombre"] == "dm"
