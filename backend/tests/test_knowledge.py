"""Conocimiento epistémico: creencias de cada personaje comparadas con el canon."""

from __future__ import annotations

from fastapi.testclient import TestClient

from loregraph.services.kernel import Kernel
from tests.conftest import Campana

K = "/campanas/prueba/conocimiento"

CREENCIAS = [
    {"s": "ernesto", "p": "rpg:locatedIn", "o": "madrid"},          # falsa: el canon dice Toledo (funcional)
    {"s": "ernesto", "p": "rpg:memberOf", "o": "primogenitura"},    # confirmada
    {"s": "ernesto", "p": "rpg:knows", "o": "lucia"},               # no verificada
    {"s": "ernesto", "p": "schema:description", "o": "Un usurero sin escrúpulos", "literal": True},  # descriptiva
]


def _estados(client: TestClient, pj: str = "lucia", **kw) -> dict[tuple[str, str], dict]:  # type: ignore[no-untyped-def]
    data = client.get(f"{K}/{pj}", **kw).json()
    return {(c["tripleta"]["predicado"]["clave"], c["tripleta"]["objeto"]["etiqueta"]): c for c in data["creencias"]}


def test_anadir_y_clasificar_creencias(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    canon_antes = len(kernel.store.graph_triples(kernel.iris.canon("prueba")))
    r = client.post(f"{K}/lucia", json=CREENCIAS)
    assert r.status_code == 200, r.json()
    assert "/change/" in r.json()["cambio"]
    est = _estados(client)
    falsa = est[("rpg:locatedIn", "Madrid")]
    assert falsa["estado"] == "falso"
    assert [c["etiqueta"] for c in falsa["canon"]] == ["Toledo"]
    assert est[("rpg:memberOf", "Primogenitura")]["estado"] == "confirmado"
    assert est[("rpg:knows", "Lucía")]["estado"] == "no_verificado"
    assert est[("schema:description", "Un usurero sin escrúpulos")]["estado"] == "no_verificado"
    assert all(c["tripleta"]["sujeto"]["etiqueta"] == "Don Ernesto" for c in est.values())
    # escribir creencias no toca el canon
    assert len(kernel.store.graph_triples(kernel.iris.canon("prueba"))) == canon_antes
    assert len(kernel.store.graph_triples(kernel.iris.knowledge("prueba", "lucia"))) == 4


def test_confirmado_por_el_grafo_derivado(campana: Campana, client: TestClient) -> None:
    client.post(f"{K}/lucia", json=[{"s": "lucia", "p": "rpg:relatedTo", "o": "ernesto"}])
    assert _estados(client)[("rpg:relatedTo", "Don Ernesto")]["estado"] == "confirmado"


def test_listado_de_personajes_con_conocimiento(campana: Campana, client: TestClient) -> None:
    assert client.get(K).json() == []
    client.post(f"{K}/lucia", json=CREENCIAS[:1])
    client.post(f"{K}/ernesto", json=[{"s": "lucia", "p": "rpg:locatedIn", "o": "madrid"}])
    personajes = client.get(K).json()
    assert [p["id"] for p in personajes] == ["ernesto", "lucia"]  # por etiqueta: «Don Ernesto», «Lucía»
    assert _estados(client, "ernesto")[("rpg:locatedIn", "Madrid")]["estado"] == "confirmado"


def test_eliminar_creencias(campana: Campana, client: TestClient) -> None:
    client.post(f"{K}/lucia", json=CREENCIAS)
    r = client.post(f"{K}/lucia/eliminar", json=CREENCIAS[:2])
    assert r.status_code == 200
    assert len(client.get(f"{K}/lucia").json()["creencias"]) == 2


def test_no_personaje_400_e_inexistente_404(campana: Campana, client: TestClient) -> None:
    r = client.post(f"{K}/madrid", json=CREENCIAS[:1])
    assert r.status_code == 400
    assert "personajes" in r.json()["detalle"]
    assert client.get(f"{K}/madrid").status_code == 400
    assert client.get(f"{K}/nadie").status_code == 404
    assert client.get("/campanas/prueba/grafo", params={"vista": "madrid"}).status_code == 400


def test_creencia_mal_formada_422(campana: Campana, client: TestClient) -> None:
    r = client.post(f"{K}/lucia", json=[{"s": "ernesto", "p": "zz:nada", "o": "madrid"}])
    assert r.status_code == 422
    assert "Predicado no válido" in r.json()["errores"][0]["mensaje"]


def test_vista_epistemica_en_el_grafo(campana: Campana, client: TestClient) -> None:
    client.post(f"{K}/lucia", json=[
        *CREENCIAS[:3],
        {"s": "ernesto", "p": "rpg:knows", "o": "https://loregraph.example.org/data/campaign/prueba/entity/fantasma"},
    ])
    g = client.get("/campanas/prueba/grafo", params={"vista": "lucia"}).json()
    aristas = {(a["origen"], a["propiedad"], a["destino"]): a for a in g["aristas"]}
    assert aristas[("ernesto", "rpg:locatedIn", "madrid")]["estadoEpistemico"] == "falso"
    assert aristas[("ernesto", "rpg:memberOf", "primogenitura")]["estadoEpistemico"] == "confirmado"
    assert aristas[("ernesto", "rpg:knows", "lucia")]["estadoEpistemico"] == "no_verificado"
    nodos = {n["id"]: n for n in g["nodos"]}
    assert nodos["ernesto"]["estadoEpistemico"] == "falso"  # «falso» prevalece
    assert nodos["primogenitura"]["estadoEpistemico"] == "confirmado"
    # solo se dibuja lo que el personaje cree (Toledo no aparece)
    assert "toledo" not in nodos
    # las aristas cualificadas del canon no se mezclan con la vista
    assert not any(a["cualificada"] for a in g["aristas"])
