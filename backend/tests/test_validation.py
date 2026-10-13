"""Validación SHACL: regla de owl:sameAs (restricción SPARQL del núcleo) y mensajes legibles."""

from __future__ import annotations

import pyoxigraph as ox
from fastapi.testclient import TestClient

from loregraph.namespaces import OWL, RDF, RDFS, RPG
from loregraph.services.kernel import Kernel
from loregraph.services.validation import ShaclValidator
from tests.conftest import WD_MADRID, Campana

P = "/campanas/prueba/propuestas"


def _nn(x: str) -> ox.NamedNode:
    return ox.NamedNode(x)


def _validator(kernel: Kernel) -> ShaclValidator:
    camp = kernel.context([])
    return ShaclValidator(camp, kernel.iris)


def _pc(kernel: Kernel, eid: str, label: str = "Lucía") -> list[tuple]:
    s = _nn(kernel.iris.entity("prueba", eid))
    return [(s, _nn(str(RDF.type)), _nn(str(RPG.PlayerCharacter))), (s, _nn(str(RDFS.label)), ox.Literal(label))]


def test_same_as_externo_rechazado_por_shacl(kernel: Kernel) -> None:
    s = kernel.iris.entity("prueba", "lucia")
    triples = [*_pc(kernel, "lucia"), (_nn(s), _nn(str(OWL.sameAs)), _nn(WD_MADRID))]
    errs = _validator(kernel).validate(triples, focus=[s])
    assert len(errs) == 1
    assert errs[0].mensaje.startswith("No se permite owl:sameAs hacia recursos externos")
    assert errs[0].focoId == "lucia"
    errs_en = _validator(kernel).validate(triples, focus=[s], lang="en")
    assert errs_en[0].mensaje.startswith("owl:sameAs to external resources is not allowed")


def test_same_as_interno_permitido(kernel: Kernel) -> None:
    s = kernel.iris.entity("prueba", "lucia")
    otra = kernel.iris.entity("prueba", "lucia-joven")
    triples = [*_pc(kernel, "lucia"), *_pc(kernel, "lucia-joven", "Lucía joven"),
               (_nn(s), _nn(str(OWL.sameAs)), _nn(otra))]
    assert _validator(kernel).validate(triples, focus=[s]) == []


def test_same_as_externo_en_propuesta_turtle(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    antes = len(kernel.store.graph_triples(kernel.iris.canon("prueba")))
    r = client.post(P, json={"agente": "test", "peticion": "enlazar con Wikidata",
                             "turtle": f"<entity/madrid> owl:sameAs <{WD_MADRID}> ."})
    body = r.json()
    assert r.status_code == 200
    assert body["ok"] is False
    assert any(e["campo"] == "owl:sameAs" and "owl:sameAs" in e["mensaje"] for e in body["errores"])
    assert client.get(P).json() == []
    assert len(kernel.store.graph_triples(kernel.iris.canon("prueba"))) == antes


def test_same_as_interno_en_propuesta_turtle_se_acepta(campana: Campana, client: TestClient) -> None:
    r = client.post(P, json={"agente": "test", "peticion": "son la misma",
                             "turtle": "<entity/madrid> owl:sameAs <entity/toledo> ."})
    assert r.json()["ok"] is True, r.json()


def test_mensajes_legibles(kernel: Kernel) -> None:
    s = _nn(kernel.iris.entity("prueba", "s9"))
    triples = [(s, _nn(str(RDF.type)), _nn(str(RPG.Session))),
               (s, _nn(str(RDFS.label)), ox.Literal("S")),
               (s, _nn(str(RPG.sessionNumber)), ox.Literal("uno"))]
    errs = _validator(kernel).validate(triples, focus=[s.value])
    msgs = {(e.campo, e.mensaje) for e in errs}
    assert ("rpg:sessionNumber", "Tipo de dato incorrecto (se esperaba xsd:integer)") in msgs
    triples = triples[:2]
    errs = _validator(kernel).validate(triples, focus=[s.value], lang="en")
    assert [(e.campo, e.mensaje) for e in errs] == [("rpg:sessionNumber", "Required field")]




def test_mensaje_de_alternativas_sh_or(kernel: Kernel) -> None:
    r = _nn(kernel.iris.entity("prueba", "lucia/n/1"))
    lugar = _nn(kernel.iris.entity("prueba", "madrid"))
    triples = [*_pc(kernel, "lucia"),
               (lugar, _nn(str(RDF.type)), _nn(str(RPG.Place))),
               (r, _nn(str(RDF.type)), _nn(str(RPG.Relationship))),
               (r, _nn(str(RPG.source)), _nn(kernel.iris.entity("prueba", "lucia"))),
               (r, _nn(str(RPG.target)), lugar),
               (r, _nn(str(RPG.relationshipType)), _nn(str(RPG["rel-ally"])))]
    vocab = [(_nn(str(RPG["rel-ally"])), _nn(str(RDF.type)), _nn("http://www.w3.org/2004/02/skos/core#Concept"))]
    errs = _validator(kernel).validate([*triples, *vocab], focus=[r.value])
    assert [(e.campo, e.mensaje) for e in errs] == [("rpg:target", "Debe ser: Personaje o Facción")]


def test_relacion_con_un_lugar_rechazada(campana: Campana, client: TestClient) -> None:
    """El destino de una relación debe ser un personaje o una facción, nunca un lugar."""
    r = client.post("/campanas/prueba/entidades", json={"clases": ["rpg:PlayerCharacter"], "valores": {
        "rdfs:label": ["Y"], "rpg:hasRelationship": [{"valores": {
            "rpg:target": ["madrid"], "rpg:relationshipType": ["rpg:rel-ally"]}}]}})
    assert r.status_code == 422
    assert any(e["campo"] == "rpg:target" for e in r.json()["errores"])


def test_sh_or_si_se_valida_sin_focus(kernel: Kernel) -> None:
    """Control: sin ``focus_nodes`` pySHACL sí detecta la violación de sh:or (aísla la causa del fallo)."""
    from pyshacl import validate

    from loregraph.store.terms import triples_to_rdflib

    ctx = kernel.context([])
    r = _nn(kernel.iris.entity("prueba", "lucia/n/1"))
    lugar = _nn(kernel.iris.entity("prueba", "madrid"))
    triples = [*_pc(kernel, "lucia"), (lugar, _nn(str(RDF.type)), _nn(str(RPG.Place))),
               (lugar, _nn(str(RDFS.label)), ox.Literal("Madrid")),
               (r, _nn(str(RDF.type)), _nn(str(RPG.Relationship))),
               (r, _nn(str(RPG.source)), _nn(kernel.iris.entity("prueba", "lucia"))),
               (r, _nn(str(RPG.target)), lugar),
               (r, _nn(str(RPG.relationshipType)), _nn(str(RPG["rel-ally"]))),
               (_nn(str(RPG["rel-ally"])), _nn(str(RDF.type)), _nn("http://www.w3.org/2004/02/skos/core#Concept"))]
    conforms, _, _ = validate(triples_to_rdflib(triples), shacl_graph=ctx.shapes, inference="none", advanced=True)
    assert conforms is False
