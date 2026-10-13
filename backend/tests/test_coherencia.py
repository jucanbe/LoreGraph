"""Detector de incoherencias (checks/*.rq del núcleo y de los módulos)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import Campana

E = "/campanas/prueba/entidades"
INC = "/campanas/prueba/incoherencias"


def test_sin_incoherencias_al_principio(campana: Campana, client: TestClient) -> None:
    r = client.get(INC).json()
    assert r["errores"] == 0 and r["reglas"] >= 9


def test_objeto_con_dos_duenos_y_ciclo(campana: Campana, client: TestClient) -> None:
    daga = client.post(E, json={"clases": ["rpg:Item"], "valores": {"rdfs:label": ["Daga"]}}).json()["id"]
    for quien, clase in ((campana.lucia, "rpg:PlayerCharacter"), (campana.ernesto, "rpg:NonPlayerCharacter")):
        f = client.get(f"{E}/{quien}").json()
        r = client.put(f"{E}/{quien}", json={"clases": [clase], "valores": {
            "rdfs:label": [f["etiqueta"]], "rpg:possesses": [daga]}})
        assert r.status_code == 200, r.json()
    # Toledo dentro de Madrid y Madrid dentro de Toledo
    for a, b in ((campana.toledo, campana.madrid), (campana.madrid, campana.toledo)):
        f = client.get(f"{E}/{a}").json()
        assert client.put(f"{E}/{a}", json={"clases": ["rpg:Place"], "valores": {
            "rdfs:label": [f["etiqueta"]], "rpg:locatedIn": [b]}}).status_code == 200
    inf = client.get(INC).json()
    reglas = {i["regla"] for i in inf["incoherencias"]}
    assert {"core:02-objeto-con-dos-duenos", "core:05-ciclos"} <= reglas
    dos = next(i for i in inf["incoherencias"] if i["regla"] == "core:02-objeto-con-dos-duenos")
    assert dos["entidad"]["id"] == daga and len(dos["relacionadas"]) == 2 and "Lucía" in dos["mensajes"][0]
    # filtro por entidad y panel
    assert all(i["entidad"]["id"] == daga or daga in [r["id"] for r in i["relacionadas"]]
               for i in client.get(INC, params={"entidad": daga}).json()["incoherencias"])
    assert client.get("/campanas/prueba/panel").json()["incoherencias"] == inf["errores"] + inf["avisos"]
    # ignorar
    assert client.put(f"{INC}/{dos['id']}", json={"ignorada": True}).status_code == 204
    inf2 = client.get(INC).json()
    assert dos["id"] not in {i["id"] for i in inf2["incoherencias"]} and inf2["ignoradas"] == 1
    assert dos["id"] in {i["id"] for i in client.get(INC, params={"incluir_ignoradas": True}).json()["incoherencias"]}


def test_muerto_que_reaparece(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    # Ernesto muere en la sesión 2 y aparece en la 3.
    assert client.put("/campanas/prueba/ajustes", json={"sesionActual": campana.s2}).status_code == 200
    f = client.get(f"{E}/{campana.ernesto}").json()
    r = client.put(f"{E}/{campana.ernesto}", json={"clases": ["rpg:NonPlayerCharacter"], "valores": {
        "rdfs:label": [f["etiqueta"]], "rpg:vitalStatus": ["rpg:vital-dead"], "rpg:appearsInSession": [campana.s3]}})
    assert r.status_code == 200, r.json()
    inf = client.get(INC).json()
    muerto = [i for i in inf["incoherencias"] if i["regla"] == "core:01-muerto-que-reaparece"]
    assert muerto and muerto[0]["severidad"] == "error" and muerto[0]["relacionadas"][0]["id"] == campana.s3


def test_herramienta_de_agentes(campana: Campana, kernel: Kernel) -> None:
    from loregraph.tools.core import KGTools

    res = KGTools(kernel).revisar_coherencia("prueba")
    assert res["errores"] == 0 and "resultados" in res
