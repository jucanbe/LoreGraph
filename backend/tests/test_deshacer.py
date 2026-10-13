"""Deshacer cambios desde el historial."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import Campana

E = "/campanas/prueba/entidades"
C = "/campanas/prueba/cambios"


def _renombrar(client: TestClient, eid: str, nombre: str, clase: str) -> None:
    ficha = client.get(f"{E}/{eid}").json()
    valores = {"rdfs:label": [nombre]}
    if "rpg:locatedIn" in ficha["valores"]:
        valores["rpg:locatedIn"] = [ficha["valores"]["rpg:locatedIn"][0]["id"]]
    assert client.put(f"{E}/{eid}", json={"clases": [clase], "valores": valores}).status_code == 200


def test_deshacer_ultimo_cambio(campana: Campana, client: TestClient) -> None:
    _renombrar(client, campana.madrid, "Villa y Corte", "rpg:Place")
    ultimo = client.get(C, params={"limite": 1}).json()[0]
    assert any(t["objeto"]["valor"] == "Villa y Corte" for t in ultimo["anadidas"])
    r = client.post(f"{C}/{ultimo['id']}/deshacer")
    assert r.status_code == 200, r.json()
    assert client.get(f"{E}/{campana.madrid}").json()["etiqueta"] == "Madrid"
    hist = client.get(C, params={"limite": 2}).json()
    assert hist[0]["deshace"] == ultimo["id"] and hist[1]["deshechoPor"] == hist[0]["id"]
    # no se puede deshacer dos veces
    assert client.post(f"{C}/{ultimo['id']}/deshacer").status_code == 409


def test_conflicto_con_cambio_posterior(campana: Campana, client: TestClient) -> None:
    _renombrar(client, campana.madrid, "Uno", "rpg:Place")
    primero = client.get(C, params={"limite": 1}).json()[0]["id"]
    _renombrar(client, campana.madrid, "Dos", "rpg:Place")
    assert client.post(f"{C}/{primero}/deshacer").status_code == 409
    segundo = client.get(C, params={"limite": 1}).json()[0]["id"]
    assert client.post(f"{C}/{segundo}/deshacer").status_code == 200
    assert client.post(f"{C}/{primero}/deshacer").status_code == 200
    assert client.get(f"{E}/{campana.madrid}").json()["etiqueta"] == "Madrid"


def test_deshacer_un_borrado(campana: Campana, client: TestClient) -> None:
    assert client.delete(f"{E}/{campana.lucia}").status_code == 200
    borrado = client.get(C, params={"limite": 1}).json()[0]["id"]
    assert client.post(f"{C}/{borrado}/deshacer").status_code == 200
    ficha = client.get(f"{E}/{campana.lucia}").json()
    assert ficha["etiqueta"] == "Lucía" and any(r["cualificada"] for r in ficha["relaciones"])


def test_cambio_inexistente(campana: Campana, client: TestClient) -> None:
    assert client.post(f"{C}/nope/deshacer").status_code == 404
