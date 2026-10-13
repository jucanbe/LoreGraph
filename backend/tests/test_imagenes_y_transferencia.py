"""Retratos, mapas propios y exportación/importación de campañas."""

from __future__ import annotations

import base64

from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import Campana

E = "/campanas/prueba/entidades"
# PNG de 1×1 píxel.
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def test_subir_y_quitar_retrato(campana: Campana, client: TestClient) -> None:
    r = client.post(f"{E}/{campana.lucia}/retratos", files={"archivo": ("cara.png", PNG, "image/png")})
    assert r.status_code == 201, r.json()
    img = r.json()
    assert img["url"].startswith("/media/prueba/") and img["origen"] == "subida"
    assert client.get(img["url"]).content == PNG
    ficha = client.get(f"{E}/{campana.lucia}").json()
    assert ficha["imagenes"] == [img["url"]]
    assert "rpg:hasDepiction" not in ficha["valores"]  # no aparece como dato suelto
    # editar la ficha no borra el retrato
    assert client.put(f"{E}/{campana.lucia}", json={"clases": ["rpg:PlayerCharacter"], "valores": {
        "rdfs:label": ["Lucía"], "rpg:locatedIn": [campana.madrid]}}).status_code == 200
    assert client.get(f"{E}/{campana.lucia}").json()["imagenes"] == [img["url"]]
    # procedencia del retrato
    assert any(any("contentUrl" in (t["predicado"]["clave"] or "") for t in c["anadidas"])
               for c in client.get(f"{E}/{campana.lucia}/procedencia").json())
    assert client.request("DELETE", f"{E}/{campana.lucia}/retratos", params={"nodo": img["nodo"]}).status_code == 204
    assert client.get(f"{E}/{campana.lucia}").json()["imagenes"] == []
    # también por URL
    url = client.post(f"{E}/{campana.lucia}/retratos", files={"archivo": ("c.png", PNG, "image/png")}).json()["url"]
    assert client.request("DELETE", f"{E}/{campana.lucia}/retratos", params={"nodo": url}).status_code == 204
    assert client.request("DELETE", f"{E}/{campana.lucia}/retratos", params={"nodo": url}).status_code == 404


def test_formato_no_admitido(campana: Campana, client: TestClient) -> None:
    r = client.post(f"{E}/{campana.lucia}/retratos", files={"archivo": ("x.svg", b"<svg/>", "image/svg+xml")})
    assert r.status_code == 400
    assert client.get("/media/prueba/../../.env").status_code == 404


def test_mapa_con_marcadores(campana: Campana, client: TestClient) -> None:
    r = client.post("/campanas/prueba/mapas", files={"archivo": ("plano.png", PNG, "image/png")},
                    data={"nombre": "Plano de la ciudad"})
    assert r.status_code == 201, r.json()
    mapa = r.json()
    mid = mapa["entidad"]["id"]
    assert mapa["imagen"]["url"].startswith("/media/") and mapa["marcadores"] == []
    r = client.put(f"/campanas/prueba/mapas/{mid}/marcadores",
                   json=[{"entidad": campana.madrid, "x": 0.25, "y": 0.5}, {"entidad": campana.lucia, "x": 1, "y": 0}])
    assert r.status_code == 200, r.json()
    assert {(m["entidad"]["id"], m["x"]) for m in r.json()["marcadores"]} == {(campana.madrid, 0.25), (campana.lucia, 1.0)}
    assert client.put(f"/campanas/prueba/mapas/{mid}/marcadores", json=[{"entidad": campana.madrid, "x": 2, "y": 0}]
                      ).status_code == 400
    assert [m["entidad"]["id"] for m in client.get(f"{E}/{campana.madrid}/mapas").json()] == [mid]
    assert [m["entidad"]["id"] for m in client.get("/campanas/prueba/mapas").json()] == [mid]
    # el mapa es una entidad normal (aparece en el explorador y se puede borrar)
    assert client.delete(f"{E}/{mid}").status_code == 200
    assert client.get("/campanas/prueba/mapas").json() == []


def test_exportar_e_importar(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    client.post(f"{E}/{campana.lucia}/retratos", files={"archivo": ("cara.png", PNG, "image/png")})
    client.put("/campanas/prueba/ajustes", json={"lore": {"resumen": "Madrid nocturno."}})
    client.post("/campanas/prueba/sparql/guardadas", json={"titulo": "Todo", "consulta": "SELECT * WHERE { ?s ?p ?o }"})
    r = client.get("/campanas/prueba/exportar")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    zipdata = r.content
    # importar con otro id
    r = client.post("/campanas/importar", files={"archivo": ("c.zip", zipdata, "application/zip")},
                    data={"id": "copia", "nombre": "Copia"})
    assert r.status_code == 201, r.json()
    assert r.json()["id"] == "copia" and r.json()["imagenes"] == 1
    lucia = client.get(f"/campanas/copia/entidades/{campana.lucia}").json()
    assert lucia["etiqueta"] == "Lucía" and lucia["iri"].endswith("/campaign/copia/entity/lucia")
    assert lucia["imagenes"][0].startswith("/media/copia/") and client.get(lucia["imagenes"][0]).status_code == 200
    assert any(x["cualificada"] for x in lucia["relaciones"])
    assert client.get("/campanas/copia/ajustes").json()["lore"]["resumen"] == "Madrid nocturno."
    assert any(e["titulo"] == "Todo" for e in client.get("/campanas/copia/sparql/ejemplos").json())
    assert client.get("/busqueda", params={"q": "lucia", "campana": "copia"}).json()
    assert len(client.get(f"/campanas/copia/entidades/{campana.lucia}/procedencia").json()) >= 1
    # la original sigue intacta y el id repetido da conflicto
    assert client.get(f"{E}/{campana.lucia}").status_code == 200
    r = client.post("/campanas/importar", files={"archivo": ("c.zip", zipdata, "application/zip")})
    assert r.status_code == 409
    assert client.post("/campanas/importar", files={"archivo": ("x.zip", b"no", "application/zip")}).status_code == 400
