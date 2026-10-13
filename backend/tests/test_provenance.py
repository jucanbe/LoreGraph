"""Procedencia PROV-O: cada escritura genera un rpg:Change con agente, fecha y tripletas reificadas."""

from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta

import pyoxigraph as ox
import pytest
from fastapi.testclient import TestClient

from loregraph.namespaces import PROV, RDF, RDFS, RPG
from loregraph.services import provenance as prov_mod
from loregraph.services.kernel import Kernel
from tests.conftest import construir_campana, crear_entidad

E = "/campanas/prueba/entidades"


@pytest.fixture
def reloj(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fechas estrictamente crecientes (la procedencia guarda segundos y se ordena por fecha)."""
    base = datetime(2026, 1, 1, tzinfo=UTC)
    cont = itertools.count()

    def _now() -> ox.Literal:
        t = base + timedelta(seconds=next(cont))
        return ox.Literal(t.isoformat(timespec="seconds"), datatype=ox.NamedNode("http://www.w3.org/2001/XMLSchema#dateTime"))

    monkeypatch.setattr(prov_mod, "now_literal", _now)


def _cambios(kernel: Kernel) -> list[str]:
    rows = kernel.store.select(f"SELECT ?c WHERE {{ ?c a <{RPG.Change}> }}",
                               default_graph=[kernel.iris.provenance("prueba")])
    return [r["c"].value for r in rows]


def test_cada_escritura_crea_un_cambio(client: TestClient, kernel: Kernel, reloj: None) -> None:
    client.post("/campanas", json={"nombre": "Prueba"})
    assert _cambios(kernel) == []
    r = client.post(E, json={"clases": ["rpg:Place"], "valores": {"rdfs:label": ["Madrid"]}, "id": "madrid"})
    ch = r.json()["cambio"]
    assert _cambios(kernel) == [ch]
    g = kernel.iris.provenance("prueba")
    c = ox.NamedNode(ch)
    tipos = {o.value for _, _, o in kernel.store.triples(c, ox.NamedNode(str(RDF.type)), None, g)}
    assert {str(RPG.Change), str(PROV.Activity)} <= tipos
    agente = next(kernel.store.triples(c, ox.NamedNode(str(PROV.wasAssociatedWith)), None, g))[2]
    assert agente.value.endswith("/agent/human/dm")
    assert next(kernel.store.triples(c, ox.NamedNode(str(PROV.endedAtTime)), None, g))[2].value.startswith("2026-01-01")
    # tripletas añadidas reificadas
    rows = kernel.store.select(
        f"""SELECT ?s ?p ?o ?g WHERE {{ <{ch}> <{RPG.added}> ?st .
            ?st <{RDF.subject}> ?s ; <{RDF.predicate}> ?p ; <{RDF.object}> ?o ; <{RPG.targetGraph}> ?g }}""",
        default_graph=[g])
    assert {(r["p"].value, r["o"].value) for r in rows} == {
        (str(RDF.type), str(RPG.Place)), ("http://www.w3.org/2000/01/rdf-schema#label", "Madrid")}
    assert {r["g"].value for r in rows} == {kernel.iris.canon("prueba")}
    # el canon queda limpio de procedencia
    canon = kernel.store.graph_triples(kernel.iris.canon("prueba"))
    assert not any(t[1].value == str(PROV.wasAssociatedWith) for t in canon)


def test_escritura_sin_cambios_no_registra_nada(client: TestClient, kernel: Kernel) -> None:
    construir_campana(client)
    n = len(_cambios(kernel))
    r = client.put(f"{E}/toledo", json={"clases": ["rpg:Place"], "valores": {"rdfs:label": ["Toledo"]}})
    assert r.status_code == 200
    assert r.json()["cambio"] == ""
    assert len(_cambios(kernel)) == n


def test_historial_mas_reciente_primero_con_etiquetas(client: TestClient, kernel: Kernel, reloj: None) -> None:
    construir_campana(client)
    r = client.put(f"{E}/lucia", json={"clases": ["rpg:PlayerCharacter"], "valores": {
        "rdfs:label": ["Lucía"], "rpg:locatedIn": ["toledo"]}})
    assert r.status_code == 200
    hist = client.get(f"{E}/lucia/procedencia").json()
    assert len(hist) == 2
    assert hist[0]["fecha"] > hist[1]["fecha"]
    edicion, alta = hist
    assert edicion["agente"] == {"tipo": "humano", "nombre": "dm", "peticion": None}
    anadidas = {(t["predicado"]["clave"], t["objeto"]["etiqueta"]) for t in edicion["anadidas"]}
    assert ("rpg:locatedIn", "Toledo") in anadidas
    eliminadas = {(t["predicado"]["clave"], t["objeto"]["etiqueta"]) for t in edicion["eliminadas"]}
    assert ("rpg:locatedIn", "Madrid") in eliminadas
    # el alta incluye las tripletas de la relación anidada, con etiquetas legibles
    alta_pred = {(t["sujeto"]["etiqueta"], t["predicado"]["etiqueta"], t["objeto"]["etiqueta"])
                 for t in alta["anadidas"]}
    assert ("Lucía", "nombre", "Lucía") in alta_pred
    assert any(p == "tipo de relación" and o == "deuda" for _, p, o in alta_pred)
    assert any(p == "ubicado en" and o == "Madrid" for _, p, o in alta_pred)


def test_cabecera_x_usuario(client: TestClient, kernel: Kernel, reloj: None) -> None:
    construir_campana(client)
    crear_entidad(client, "prueba", ["rpg:Item"], {"rdfs:label": ["Daga"]}, eid="daga", **{"X-Usuario": "alice"})
    hist = client.get(f"{E}/daga/procedencia").json()
    assert hist[0]["agente"]["nombre"] == "alice"
    assert hist[0]["agente"]["tipo"] == "humano"
    client.delete(f"{E}/daga", headers={"X-Usuario": "  bob "})
    rows = kernel.store.select(f"SELECT ?l WHERE {{ ?a a <{RPG.HumanUser}> ; <{RDFS.label}> ?l }}",
                               default_graph=[kernel.iris.provenance("prueba")])
    assert {"dm", "alice", "bob"} <= {r["l"].value for r in rows}


def test_borrado_registra_eliminaciones_y_entidades_afectadas(client: TestClient, kernel: Kernel, reloj: None) -> None:
    construir_campana(client)
    ch = client.delete(f"{E}/madrid").json()["cambio"]
    rows = kernel.store.select(f"SELECT ?e WHERE {{ <{ch}> <{RPG.aboutEntity}> ?e }}",
                               default_graph=[kernel.iris.provenance("prueba")])
    afectadas = {r["e"].value.rsplit("/", 1)[-1] for r in rows}
    assert afectadas == {"madrid", "lucia"}
    # el historial de Lucía también refleja el borrado de la referencia
    hist = client.get(f"{E}/lucia/procedencia").json()
    assert hist[0]["eliminadas"][0]["predicado"]["clave"] == "rpg:locatedIn"
    assert hist[0]["anadidas"] == []


def test_historial_de_entidad_sin_cambios(client: TestClient) -> None:
    construir_campana(client)
    assert client.get(f"{E}/no-existe/procedencia").json() == []
