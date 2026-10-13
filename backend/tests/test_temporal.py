"""Temporalidad completa: historia automática de las propiedades temporales."""

from __future__ import annotations

from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import Campana

E = "/campanas/prueba/entidades"


def _mover(client: TestClient, eid: str, lugar: str, clase: str = "rpg:NonPlayerCharacter") -> None:
    ficha = client.get(f"{E}/{eid}").json()
    r = client.put(f"{E}/{eid}", json={"clases": [clase], "valores": {
        "rdfs:label": [ficha["etiqueta"]], "rpg:locatedIn": [lugar]}})
    assert r.status_code == 200, r.json()


def test_cambio_de_ubicacion_cierra_y_abre_hechos(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    camp = kernel.campaign("prueba")
    # Don Ernesto empieza en Toledo; en la sesión 2 se muda a Madrid.
    assert client.put("/campanas/prueba/ajustes", json={"sesionActual": campana.s2}).status_code == 200
    _mover(client, campana.ernesto, campana.madrid)
    hist = kernel.temporal.history(camp, kernel.iris.entity("prueba", campana.ernesto))
    loc = [h for h in hist if h.propiedad.endswith("#locatedIn")]
    assert len(loc) == 2
    antes = next(h for h in loc if h.valor.value.endswith(campana.toledo))  # type: ignore[union-attr]
    ahora = next(h for h in loc if h.valor.value.endswith(campana.madrid))  # type: ignore[union-attr]
    assert antes.hasta_n == 2 and antes.desde_n is None
    assert ahora.desde_n == 2 and ahora.hasta_n is None

    def ubic(n: int) -> set[str]:
        g = client.get("/campanas/prueba/grafo", params={"sesion": n}).json()
        return {a["destino"] for a in g["aristas"]
                if a["origen"] == campana.ernesto and a["propiedad"] == "rpg:locatedIn"}

    # El grafo en la sesión 1 muestra la ubicación antigua; en la 2, la nueva.
    assert ubic(1) == {campana.toledo}
    assert ubic(2) == {campana.madrid}
    h = client.get(f"{E}/{campana.ernesto}/historia-temporal").json()
    assert {x["valor"]["id"] for x in h if x["propiedad"]["clave"] == "rpg:locatedIn"} == {
        campana.madrid, campana.toledo}
    assert [x["vigente"] for x in h if x["valor"]["id"] == campana.madrid] == [True]


def test_sin_cambio_no_hay_historia(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    ficha = client.get(f"{E}/{campana.lucia}").json()
    r = client.put(f"{E}/{campana.lucia}", json={"clases": ["rpg:PlayerCharacter"], "valores": {
        "rdfs:label": [ficha["etiqueta"]], "rpg:locatedIn": [campana.madrid]}})
    assert r.status_code == 200
    hist = kernel.temporal.history(kernel.campaign("prueba"), kernel.iris.entity("prueba", campana.lucia))
    assert [h for h in hist if h.propiedad.endswith("#locatedIn")] == []


def test_crear_no_abre_historia(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    r = client.post(E, json={"clases": ["rpg:NonPlayerCharacter"],
                             "valores": {"rdfs:label": ["Nueva"], "rpg:locatedIn": [campana.madrid]}})
    assert r.status_code == 201
    assert kernel.temporal.history(kernel.campaign("prueba"), r.json()["iri"]) == []


def test_borrar_no_deja_historia(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    _mover(client, campana.ernesto, campana.madrid)
    assert client.delete(f"{E}/{campana.ernesto}").status_code == 200
    canon = kernel.store.graph_triples(kernel.iris.canon("prueba"))
    assert not [t for t in canon if f"/entity/{campana.ernesto}" in str(t[0])]
