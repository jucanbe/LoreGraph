"""Campañas de ejemplo de los módulos (``examples/<id>/``) y validación completa del canon."""

from __future__ import annotations

import json
from pathlib import Path

import pyoxigraph as ox
import pytest
from fastapi.testclient import TestClient

from loregraph.namespaces import RPG
from loregraph.seed import example_dirs, seed_examples, validate_campaign
from loregraph.services.kernel import Kernel
from tests.conftest import Campana, escribir_modulo, make_settings

CANON = """@prefix : <__CAMPAIGN__/entity/> .
@prefix rpg: <https://loregraph.example.org/ont/core#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix alfa: <https://rpg-modules.example.net/alfa/ont#> .

:sevilla a rpg:Place ; rdfs:label "Sevilla" .
:s1 a rpg:Session ; rdfs:label "Sesión 1" ; rpg:sessionNumber 1 .
:carmen a rpg:NonPlayerCharacter , alfa:Monster ; rdfs:label "Carmen" ;
    rpg:locatedIn :sevilla ; alfa:ferocity 3 .
:jose a rpg:PlayerCharacter ; rdfs:label "José" ;
    rpg:hasRelationship <__CAMPAIGN__/entity/jose/n/r1> .
<__CAMPAIGN__/entity/jose/n/r1> a rpg:Relationship ; rpg:source :jose ; rpg:target :carmen ;
    rpg:relationshipType rpg:rel-lover ; rpg:strength 3 ; rpg:validFrom :s1 .
"""
N_CANON = 19


@pytest.fixture
def kernel_con_ejemplo(tmp_path: Path) -> Kernel:
    mods = tmp_path / "mods"
    d = escribir_modulo(mods, "alfa")
    ej = d / "examples" / "demo"
    (ej / "knowledge").mkdir(parents=True)
    (ej / "proposals").mkdir()
    (ej / "campaign.yaml").write_text("id: demo\nnombre: Demo\ndescripcion: Ejemplo\nmodulos: [alfa]\n",
                                      encoding="utf-8")
    (ej / "canon.ttl").write_text(CANON, encoding="utf-8")
    (ej / "knowledge" / "jose.ttl").write_text(
        "@prefix : <__CAMPAIGN__/entity/> .\n@prefix rpg: <https://loregraph.example.org/ont/core#> .\n"
        ":carmen rpg:locatedIn :triana .\n", encoding="utf-8")
    (ej / "proposals" / "p1.json").write_text(json.dumps({
        "agente": "ejemplo", "peticion": "describe Sevilla",
        "anadir": [{"s": "sevilla", "p": "schema:description", "o": "Ciudad del Guadalquivir", "literal": True}],
    }), encoding="utf-8")
    (ej / "proposals" / "p2-mala.json").write_text(json.dumps({
        "agente": "ejemplo", "peticion": "mala", "anadir": [{"s": "sevilla", "p": "zz:x", "o": "y"}],
    }), encoding="utf-8")
    # carpeta sin campaign.yaml: se ignora
    (d / "examples" / "borrador").mkdir()
    return Kernel(make_settings(tmp_path, modules_dir=mods), in_memory=True)


def test_validar_campana_valida(campana: Campana, kernel: Kernel) -> None:
    assert validate_campaign(kernel, kernel.campaign("prueba")) == []


def test_validar_campana_con_incidencias(campana: Campana, kernel: Kernel) -> None:
    lucia = ox.NamedNode(kernel.iris.entity("prueba", "lucia"))
    ernesto = ox.NamedNode(kernel.iris.entity("prueba", "ernesto"))
    kernel.store.add_triples(kernel.iris.canon("prueba"), [(lucia, ox.NamedNode(str(RPG.playedBy)), ernesto)])
    errs = validate_campaign(kernel, kernel.campaign("prueba"))
    assert [(e.focoId, e.campo) for e in errs] == [("lucia", "rpg:playedBy")]
    assert errs[0].mensaje == "Debe ser: Jugador"


def test_sembrar_ejemplo(kernel_con_ejemplo: Kernel, caplog: pytest.LogCaptureFixture) -> None:
    k = kernel_con_ejemplo
    assert [p.name for p in example_dirs(k)] == ["demo"]
    hechos = seed_examples(k)
    assert hechos == [("demo", N_CANON + 1)]  # canon + 1 creencia
    camp = k.campaign("demo")
    assert camp.nombre == "Demo" and camp.declared_modules == ["alfa"]
    carmen = k.entities.get(camp, "carmen")
    assert [c.clave for c in carmen.clases] == ["rpg:NonPlayerCharacter", "alfa:Monster"]
    assert carmen.valores["rpg:locatedIn"][0].id == "sevilla"
    jose = k.entities.get(camp, "jose")
    rel = next(r for r in jose.relaciones if r.cualificada)
    assert rel.intensidad == 3 and rel.otra.id == "carmen" and rel.desde.id == "s1"  # type: ignore[union-attr]
    assert validate_campaign(k, camp) == []
    # índice de búsqueda, conocimiento y propuestas de ejemplo
    assert [h.entidad.id for h in k.search.search("jose", camp)] == ["jose"]
    creencias = k.knowledge.beliefs(camp, "jose").creencias
    assert len(creencias) == 1 and creencias[0].estado == "falso"
    props = k.proposals.list(camp)
    assert [p.peticion for p in props] == ["describe Sevilla"]
    assert "p2-mala.json" in caplog.text
    # procedencia del agente «semilla»
    hist = k.provenance.history(camp, k.iris.entity("demo", "carmen"))
    assert hist[0].agente.nombre == "semilla"


def test_resembrar(kernel_con_ejemplo: Kernel) -> None:
    k = kernel_con_ejemplo
    seed_examples(k)
    assert seed_examples(k, replace=False) == [("demo", 0)]
    assert seed_examples(k, only="otra") == []
    n = seed_examples(k, only="demo")[0][1]
    assert n == N_CANON + 1
    # al reemplazar no se duplican las propuestas
    assert len(k.proposals.list(k.campaign("demo"))) == 1


def test_ejemplo_por_api(kernel_con_ejemplo: Kernel) -> None:
    from loregraph.main import create_app

    seed_examples(kernel_con_ejemplo)
    with TestClient(create_app(kernel_con_ejemplo.settings, kernel_con_ejemplo, with_mcp=False)) as c:
        g = c.get("/campanas/demo/grafo").json()
        assert {(a["origen"], a["propiedad"], a["destino"]) for a in g["aristas"] if a["cualificada"]} == {
            ("jose", "rpg:rel-lover", "carmen")}
        nodo = next(n for n in g["nodos"] if n["id"] == "carmen")
        # estilo de la clase principal (PNJ) o de la variante (alfa:Monster), ambas a la misma distancia
        assert nodo["color"] in ("#7c3aed", "#123456")
