"""Campañas: alta, edición, borrado, información de presentación, panel, sesiones y reglas."""

from __future__ import annotations

from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import Campana, crear_entidad

C = "/campanas"


def test_crear_y_listar(client: TestClient) -> None:
    r = client.post(C, json={"nombre": "La Mascarada de Madrid", "descripcion": "Crónica"})
    assert r.status_code == 201
    c = r.json()
    assert c["id"] == "la-mascarada-de-madrid"
    assert c["iri"] == "https://loregraph.example.org/data/campaign/la-mascarada-de-madrid"
    assert c["sistema"] == "Genérico" and c["modulos"] == [] and c["numEntidades"] == 0
    assert c["creada"]
    # mismo nombre sin id: se añade un sufijo
    assert client.post(C, json={"nombre": "La Mascarada de Madrid"}).json()["id"] == "la-mascarada-de-madrid-2"
    assert client.post(C, json={"nombre": "La Mascarada de Madrid"}).json()["id"] == "la-mascarada-de-madrid-3"
    assert [x["id"] for x in client.get(C).json()] == [
        "la-mascarada-de-madrid", "la-mascarada-de-madrid-2", "la-mascarada-de-madrid-3"]
    assert client.get("/salud").json() == {"ok": True, "modulos": ["core"], "campanas": 3}


def test_id_duplicado_e_invalido(client: TestClient) -> None:
    assert client.post(C, json={"nombre": "A", "id": "a"}).status_code == 201
    r = client.post(C, json={"nombre": "B", "id": "a"})
    assert r.status_code == 409
    assert client.post(C, json={"nombre": "B", "id": "Con Mayúsculas"}).status_code == 422
    assert client.post(C, json={"nombre": ""}).status_code == 422


def test_info_de_presentacion(campana: Campana, client: TestClient) -> None:
    info = client.get(f"{C}/prueba").json()
    assert info["campana"]["numEntidades"] == 9
    tipos = {t["clase"]["clave"]: t for t in info["tipos"]}
    assert list(tipos)[:3] == ["rpg:PlayerCharacter", "rpg:NonPlayerCharacter", "rpg:Place"]
    assert tipos["rpg:Place"]["recuento"] == 2
    assert tipos["rpg:Session"]["recuento"] == 3
    assert tipos["rpg:Faction"]["recuento"] == 2
    assert tipos["rpg:Plot"]["recuento"] == 0
    assert tipos["rpg:Place"]["estilo"] == {"color": "#059669", "forma": "round-rectangle", "icono": "map-pin"}
    assert tipos["rpg:Place"]["modulo"] == "core"
    assert tipos["rpg:Place"]["clase"]["etiqueta"] == "Lugar"
    rel = {r["clave"]: r for r in info["relaciones"]}
    assert rel["rpg:rel-debt"]["etiqueta"] == "deuda"
    assert rel["rpg:locatedIn"]["estilo"]["linea"] == "dashed"
    assert info["prefijos"]["rpg"] == "https://loregraph.example.org/ont/core#"
    assert info["tema"]["modulo"] == "core"
    info_en = client.get(f"{C}/prueba", params={"idioma": "en"}).json()
    assert info_en["tipos"][2]["clase"]["etiqueta"] == "Place"


def test_editar_y_borrar(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    r = client.put(f"{C}/prueba", json={"nombre": "Renombrada", "descripcion": "nueva"})
    assert r.status_code == 200
    assert r.json()["nombre"] == "Renombrada" and r.json()["descripcion"] == "nueva"
    assert r.json()["creada"]  # la fecha de creación se conserva
    client.post(f"{C}/prueba/sparql/guardadas", json={"titulo": "t", "consulta": "ASK {}"})
    assert client.delete(f"{C}/prueba").status_code == 204
    assert client.get(f"{C}/prueba").status_code == 404
    assert client.get(C).json() == []
    prefijo = kernel.iris.campaign("prueba") + "/"
    assert not [g for g in kernel.store.named_graphs() if g.startswith(prefijo)]
    assert kernel.aux.list_queries("prueba") == []
    assert client.delete(f"{C}/prueba").status_code == 404
    # se puede volver a crear con el mismo id, vacía
    assert client.post(C, json={"nombre": "Prueba", "id": "prueba"}).status_code == 201
    assert client.get(f"{C}/prueba/entidades").json()["pagina"]["total"] == 0


def test_panel(campana: Campana, client: TestClient) -> None:
    crear_entidad(client, "prueba", ["rpg:Plot"], {
        "rdfs:label": ["La deuda de Lucía"], "rpg:plotStatus": ["rpg:plot-open"],
        "rpg:involves": ["lucia", "ernesto"], "schema:description": ["Ernesto quiere cobrar"]}, eid="trama")
    crear_entidad(client, "prueba", ["rpg:Plot"], {
        "rdfs:label": ["Cerrada"], "rpg:plotStatus": ["rpg:plot-resolved"]}, eid="cerrada")
    panel = client.get(f"{C}/prueba/panel").json()
    assert panel["campana"]["id"] == "prueba"
    assert panel["recuentos"]["rpg:Plot"] == 2
    assert panel["recuentos"]["rpg:PlayerCharacter"] == 1
    assert [t["entidad"]["id"] for t in panel["tramasAbiertas"]] == ["trama"]
    assert {e["id"] for e in panel["tramasAbiertas"][0]["implicados"]} == {"lucia", "ernesto"}
    assert panel["tramasAbiertas"][0]["entidad"]["descripcion"] == "Ernesto quiere cobrar"
    assert panel["recientes"][0]["id"] == "cerrada"
    assert len(panel["recientes"]) == 8
    assert panel["propuestasPendientes"] == 0
    assert panel["ultimaSesion"]["numero"] == 3
    # las entidades borradas desaparecen de «recientes»
    client.delete(f"{C}/prueba/entidades/cerrada")
    assert "cerrada" not in [e["id"] for e in client.get(f"{C}/prueba/panel").json()["recientes"]]


def test_linea_temporal_de_sesiones(campana: Campana, client: TestClient) -> None:
    crear_entidad(client, "prueba", ["rpg:Session"], {
        "rdfs:label": ["Sesión 0"], "rpg:sessionNumber": [0], "rpg:sessionDate": ["2026-01-02"],
        "rpg:inWorldDateLabel": ["Noche de difuntos"], "rpg:sessionNotes": ["Prólogo"]}, eid="s0")
    client.put(f"{C}/prueba/entidades/ernesto", json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": ["Don Ernesto"], "rpg:appearsInSession": ["s0", "s2"]}})
    client.put(f"{C}/prueba/entidades/madrid", json={"clases": ["rpg:Place"], "valores": {
        "rdfs:label": ["Madrid"], "rpg:appearsInSession": ["s2"]}})
    lineas = client.get(f"{C}/prueba/sesiones").json()
    assert [x["sesion"]["numero"] for x in lineas] == [0, 1, 2, 3]
    s0 = lineas[0]["sesion"]
    assert s0["fecha"] == "2026-01-02" and s0["fechaMundo"] == "Noche de difuntos" and s0["notas"] == "Prólogo"
    assert [e["id"] for e in lineas[0]["entidades"]] == ["ernesto"]
    # entidades ordenadas por tipo y nombre
    assert [e["id"] for e in lineas[2]["entidades"]] == ["ernesto", "madrid"]
    assert lineas[1]["entidades"] == []


def test_reglas_derivadas(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    client.put(f"{C}/prueba/entidades/ernesto", json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": ["Don Ernesto"], "rpg:knows": ["lucia"]}})
    derivado = {(s.value.rsplit("/", 1)[-1], p.value.rsplit("#", 1)[-1], o.value.rsplit("/", 1)[-1])
                for s, p, o in kernel.store.graph_triples(kernel.iris.derived("prueba"))}
    assert derivado == {("lucia", "relatedTo", "ernesto"), ("lucia", "knows", "ernesto")}
    assert kernel.rules.recompute(kernel.campaign("prueba")) == 2


def test_campana_inexistente_404(client: TestClient) -> None:
    for url in ("/campanas/nada", "/campanas/nada/panel", "/campanas/nada/sesiones", "/campanas/nada/entidades",
                "/campanas/nada/grafo", "/campanas/nada/propuestas", "/campanas/nada/conocimiento"):
        r = client.get(url)
        assert r.status_code == 404, url
        assert r.json() == {"detalle": "No existe la campaña 'nada'", "errores": []}
