"""Ficha de una entidad: grupos, valores, relaciones (directas y cualificadas) y anclas reales."""

from __future__ import annotations

import pyoxigraph as ox
from fastapi.testclient import TestClient

from loregraph.namespaces import RPG
from loregraph.services.kernel import Kernel
from tests.conftest import WD_MADRID, Campana

E = "/campanas/prueba/entidades"


def test_grupos_siguen_los_grupos_del_formulario(campana: Campana, client: TestClient) -> None:
    ent = client.get(f"{E}/lucia").json()
    form = client.get("/campanas/prueba/formularios/rpg:PlayerCharacter").json()
    orden_form = [g["id"] for g in form["grupos"]]
    ids = [g["id"] for g in ent["grupos"]]
    assert ids == [g for g in orden_form if g in ids]
    assert ids == ["rpgsh:IdentityGroup", "rpgsh:WorldGroup", "rpgsh:RelationsGroup"]
    ident = ent["grupos"][0]
    assert ident["etiqueta"] == "Identidad"
    assert ident["campos"][0]["id"] == "rdfs:label"
    assert ident["campos"][0]["valores"][0]["valor"] == "Lucía"


def test_valor_anidado_de_relacion(campana: Campana, client: TestClient) -> None:
    ent = client.get(f"{E}/lucia").json()
    rel = ent["valores"]["rpg:hasRelationship"][0]
    assert rel["tipo"] == "objeto"
    assert rel["etiqueta"].startswith("Don Ernesto")
    campos = {c["id"]: c for c in rel["campos"]}
    # el enlace inverso (rpg:source) está oculto en la ficha
    assert "rpg:source" not in campos
    assert campos["rpg:target"]["valores"][0]["id"] == "ernesto"
    assert campos["rpg:relationshipType"]["valores"][0]["clave"] == "rpg:rel-debt"
    assert campos["rpg:relationshipType"]["valores"][0]["etiqueta"] == "deuda"
    assert campos["rpg:strength"]["valores"][0]["valor"] == -2
    assert campos["rpg:validFrom"]["valores"][0]["id"] == "s1"


def test_relaciones_salientes_y_cualificadas(campana: Campana, client: TestClient) -> None:
    ent = client.get(f"{E}/lucia").json()
    rels = ent["relaciones"]
    loc = [r for r in rels if r["propiedad"]["clave"] == "rpg:locatedIn"]
    assert len(loc) == 1
    assert loc[0]["direccion"] == "saliente" and loc[0]["otra"]["id"] == "madrid"
    assert loc[0]["propiedad"]["etiqueta"] == "ubicado en"
    q = [r for r in rels if r["cualificada"]]
    assert len(q) == 1
    q0 = q[0]
    assert q0["direccion"] == "saliente"
    assert q0["otra"]["id"] == "ernesto"
    assert q0["tipoRelacion"]["clave"] == "rpg:rel-debt"
    assert q0["tipoRelacion"]["etiqueta"] == "deuda"
    assert q0["intensidad"] == -2
    assert q0["desde"]["id"] == "s1"
    assert q0["hasta"] is None
    assert "/n/" in q0["nodo"]
    # las propiedades internas no aparecen como relaciones
    directas = {r["propiedad"]["clave"] for r in rels if not r["cualificada"]}
    assert "rpg:hasRelationship" not in directas and "rpg:relatedTo" not in directas
    assert q0["propiedad"]["clave"] == "rpg:relatedTo"


def test_relaciones_entrantes(campana: Campana, client: TestClient) -> None:
    ernesto = client.get(f"{E}/ernesto").json()
    entrantes = [r for r in ernesto["relaciones"] if r["direccion"] == "entrante"]
    assert any(r["cualificada"] and r["otra"]["id"] == "lucia" and r["intensidad"] == -2 for r in entrantes)
    salientes = {(r["propiedad"]["clave"], r["otra"]["id"]) for r in ernesto["relaciones"]
                 if r["direccion"] == "saliente" and not r["cualificada"]}
    assert salientes == {("rpg:locatedIn", "toledo"), ("rpg:memberOf", "primogenitura")}
    madrid = client.get(f"{E}/madrid").json()
    assert [(r["direccion"], r["otra"]["id"]) for r in madrid["relaciones"]] == [("entrante", "lucia")]
    # el nodo de relación no se presenta como entidad entrante
    assert all("/n/" not in r["otra"]["iri"] for r in ernesto["relaciones"])


def test_atajo_derivado_no_aparece_en_valores(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    lucia = ox.NamedNode(kernel.iris.entity("prueba", "lucia"))
    derivadas = list(kernel.store.triples(lucia, ox.NamedNode(str(RPG.relatedTo)), None, kernel.iris.derived("prueba")))
    assert len(derivadas) == 1  # la regla sí lo genera …
    ent = client.get(f"{E}/lucia").json()
    assert "rpg:relatedTo" not in ent["valores"]  # … pero la ficha no lo muestra
    assert "rdf:type" not in ent["valores"]


def test_anclas_reales_e_imagenes(campana: Campana, client: TestClient) -> None:
    madrid = client.get(f"{E}/madrid").json()
    assert madrid["anclasReales"] == [{
        "tipo": "iri", "valor": WD_MADRID, "etiqueta": WD_MADRID, "id": None, "clave": "rpg:correspondsTo",
        "clase": None, "datatype": None, "idioma": None, "campos": None}]
    grupos = [g["id"] for g in madrid["grupos"]]
    assert grupos[-1] == "rpgsh:RealWorldGroup"
    client.put(f"{E}/madrid", json={"clases": ["rpg:Place"], "valores": {
        "rdfs:label": ["Madrid"], "foaf:depiction": ["https://example.org/madrid.png"],
        "rpg:inspiredBy": ["http://dbpedia.org/resource/Madrid"]}})
    madrid = client.get(f"{E}/madrid").json()
    assert madrid["imagenes"] == ["https://example.org/madrid.png"]
    assert [a["clave"] for a in madrid["anclasReales"]] == ["rpg:inspiredBy"]


def test_ficha_metadatos(campana: Campana, client: TestClient) -> None:
    ent = client.get(f"{E}/ernesto").json()
    assert ent["campana"] == "prueba"
    assert ent["descripcion"] == "Prestamista de la corte"
    assert ent["editable"] is True and ent["origen"] == "campana"
    assert ent["creada"] is not None and ent["modificada"] is not None
    assert [c["clave"] for c in ent["clases"]] == ["rpg:NonPlayerCharacter"]


def test_ficha_en_ingles(campana: Campana, client: TestClient) -> None:
    ent = client.get(f"{E}/lucia", params={"idioma": "en"}).json()
    assert ent["grupos"][0]["etiqueta"] == "Identity"
    assert ent["tipo"]["etiqueta"] == "Player character"
    q = next(r for r in ent["relaciones"] if r["cualificada"])
    assert q["tipoRelacion"]["etiqueta"] == "debt"


def test_valores_fuera_del_formulario_van_a_otros_datos(campana: Campana, client: TestClient, kernel: Kernel) -> None:
    iri = ox.NamedNode(kernel.iris.entity("prueba", "toledo"))
    kernel.store.add_triples(kernel.iris.canon("prueba"), [(iri, ox.NamedNode(str(RPG.moduleId)), ox.Literal("x"))])
    ent = client.get(f"{E}/toledo").json()
    assert ent["grupos"][-1]["id"] == "otros"
    assert ent["grupos"][-1]["campos"][0]["id"] == "rpg:moduleId"
    assert ent["valores"]["rpg:moduleId"][0]["valor"] == "x"


def test_vecindario(campana: Campana, client: TestClient) -> None:
    g = client.get(f"{E}/lucia/vecindario").json()
    ids = {n["id"] for n in g["nodos"]}
    assert ids == {"lucia", "madrid", "ernesto"}
    g2 = client.get(f"{E}/lucia/vecindario", params={"profundidad": 2}).json()
    assert {n["id"] for n in g2["nodos"]} == {"lucia", "madrid", "ernesto", "toledo", "primogenitura"}
