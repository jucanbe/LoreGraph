"""Búsqueda por texto (FTS5): global y por campaña, insensible a acentos, con reindexado."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import Campana, construir_campana, crear_entidad

B = "/busqueda"


def _ids(client: TestClient, q: str, **params: str) -> list[tuple[str, str]]:
    r = client.get(B, params={"q": q, **params})
    assert r.status_code == 200, r.json()
    return [(x["campana"], x["entidad"]["id"]) for x in r.json()]


def test_busqueda_insensible_a_acentos(campana: Campana, client: TestClient) -> None:
    assert _ids(client, "lucia") == [("prueba", "lucia")]
    assert _ids(client, "LUCÍA") == [("prueba", "lucia")]
    assert _ids(client, "sesion 2") == [("prueba", "s2")]


def test_busqueda_por_prefijo_y_descripcion(campana: Campana, client: TestClient) -> None:
    assert ("prueba", "lucia") in _ids(client, "luc")
    assert _ids(client, "prestamista") == [("prueba", "ernesto")]
    res = client.get(B, params={"q": "ernesto"}).json()[0]
    assert res["entidad"]["etiqueta"] == "Don Ernesto"
    assert res["entidad"]["tipo"]["clave"] == "rpg:NonPlayerCharacter"
    assert res["entidad"]["descripcion"] == "Prestamista de la corte"
    assert res["puntuacion"] > 0


def test_busqueda_por_alias(campana: Campana, client: TestClient) -> None:
    crear_entidad(client, "prueba", ["rpg:NonPlayerCharacter"], {"rdfs:label": ["Inés"], "skos:altLabel": ["La Monja"]},
                  eid="ines")
    assert _ids(client, "monja") == [("prueba", "ines")]


def test_busqueda_global_y_por_campana(campana: Campana, client: TestClient) -> None:
    client.post("/campanas", json={"nombre": "Otra", "id": "otra"})
    crear_entidad(client, "otra", ["rpg:PlayerCharacter"], {"rdfs:label": ["Lucía la Otra"]}, eid="lucia2")
    assert set(_ids(client, "lucia")) == {("prueba", "lucia"), ("otra", "lucia2")}
    assert _ids(client, "lucia", campana="otra") == [("otra", "lucia2")]
    assert _ids(client, "lucia", campana="prueba") == [("prueba", "lucia")]
    assert client.get(B, params={"q": "lucia", "campana": "nada"}).status_code == 404


def test_reindexado_tras_editar_y_borrar(campana: Campana, client: TestClient) -> None:
    client.put("/campanas/prueba/entidades/toledo", json={"clases": ["rpg:Place"],
                                                          "valores": {"rdfs:label": ["Ciudad Imperial"]}})
    assert _ids(client, "toledo") == []
    assert _ids(client, "imperial") == [("prueba", "toledo")]
    client.delete("/campanas/prueba/entidades/toledo")
    assert _ids(client, "imperial") == []


def test_reindexado_tras_aprobar_propuesta(campana: Campana, client: TestClient) -> None:
    r = client.post("/campanas/prueba/propuestas", json={"agente": "a", "peticion": "p", "entidades": [
        {"ref": "nuevo:1", "clases": ["rpg:Item"], "valores": {"rdfs:label": ["Espada Tizona"]}}]}).json()
    assert _ids(client, "tizona") == []  # pendiente: no se indexa
    client.post(f"/campanas/prueba/propuestas/{r['propuesta']['id']}/aprobar", json={})
    assert len(_ids(client, "tizona")) == 1


def test_borrar_campana_limpia_el_indice(campana: Campana, client: TestClient) -> None:
    assert client.delete("/campanas/prueba").status_code == 204
    assert _ids(client, "lucia") == []


def test_indice_se_reconstruye_al_arrancar(tmp_path, remoto) -> None:  # type: ignore[no-untyped-def]
    """El índice es derivable: con almacén persistente en disco se reconstruye en el arranque (lifespan)."""
    import httpx

    from loregraph.main import create_app
    from loregraph.services.kernel import Kernel
    from tests.conftest import make_settings

    s = make_settings(tmp_path)
    k = Kernel(s)  # en disco, dentro de tmp_path
    k.http_transport = httpx.MockTransport(remoto)  # type: ignore[attr-defined]
    with TestClient(create_app(s, k, with_mcp=False)) as c:
        construir_campana(c)
    del k, c  # libera el cerrojo de RocksDB
    import gc

    gc.collect()
    k2 = Kernel(s)
    with TestClient(create_app(s, k2, with_mcp=False)) as c:
        assert _ids(c, "lucia") == [("prueba", "lucia")]
        # los metadatos de fechas se reconstruyen desde la procedencia
        assert c.get("/campanas/prueba/entidades", params={"orden": "reciente"}).json()["elementos"][0]["modificada"]


def test_consulta_sin_palabras(campana: Campana, client: TestClient) -> None:
    assert _ids(client, "¡¿!?") == []
    assert client.get(B).status_code == 422
    assert client.get(B, params={"q": ""}).status_code == 422
    assert client.get(B, params={"q": "a", "limite": 0}).status_code == 422


def test_limite(campana: Campana, client: TestClient) -> None:
    assert len(_ids(client, "sesion", limite="2")) == 2
