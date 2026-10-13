"""Formularios generados desde SHACL (``/campanas/{cid}/formularios/{clase}``)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from loregraph.forms.builder import _merge
from loregraph.forms.schema import Campo, Cardinalidad, OpcionValor, Restricciones

URL = "/campanas/prueba/formularios"


@pytest.fixture
def cli(client: TestClient) -> TestClient:
    r = client.post("/campanas", json={"nombre": "Prueba", "modulos": []})
    assert r.status_code == 201
    return client


def _campo(form: dict, cid: str) -> dict:
    return next(c for c in form["campos"] if c["id"] == cid)


def test_formulario_pnj_grupos_ordenados_por_sh_order(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter").json()
    assert form["clase"] == "rpg:NonPlayerCharacter"
    ordenes = [g["orden"] for g in form["grupos"]]
    assert ordenes == sorted(ordenes)
    ids = [g["id"] for g in form["grupos"]]
    assert ids[:3] == ["rpgsh:IdentityGroup", "rpgsh:WorldGroup", "rpgsh:RelationsGroup"]
    assert "rpgsh:RealWorldGroup" in ids
    # los campos siguen el orden de los grupos y, dentro de cada grupo, sh:order
    pos = {g["id"]: i for i, g in enumerate(form["grupos"])}
    claves = [(pos.get(c["grupo"], 10**6), c["orden"]) for c in form["campos"]]
    assert claves == sorted(claves)
    assert form["campos"][0]["id"] == "rdfs:label"


def test_campo_nombre_obligatorio_y_unico(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter").json()
    label = _campo(form, "rdfs:label")
    assert label["tipo"] == "texto"
    assert label["cardinalidad"] == {"min": 1, "max": 1}
    assert label["restricciones"]["minLength"] == 1
    assert label["etiqueta"] == "nombre"
    assert label["grupo"] == "rpgsh:IdentityGroup"


def test_enum_estado_vital_desde_esquema_skos(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter").json()
    vital = _campo(form, "rpg:vitalStatus")
    assert vital["tipo"] == "enum"
    claves = {v["clave"] for v in vital["valores"]}
    assert claves == {"rpg:vital-alive", "rpg:vital-dead", "rpg:vital-missing", "rpg:vital-unknown"}
    etiquetas = {v["clave"]: v["etiqueta"] for v in vital["valores"]}
    assert etiquetas["rpg:vital-alive"] == "vivo"
    assert vital["cardinalidad"]["max"] == 1


def test_campos_referencia_con_clases(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter").json()
    loc = _campo(form, "rpg:locatedIn")
    assert loc["tipo"] == "referencia"
    assert [c["clave"] for c in loc["clases"]] == ["rpg:Place"]
    knows = _campo(form, "rpg:knows")
    assert [c["clave"] for c in knows["clases"]] == ["rpg:Character"]


def test_campo_objeto_relacion_cualificada(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter").json()
    rel = _campo(form, "rpg:hasRelationship")
    assert rel["tipo"] == "objeto"
    assert rel["enlaceInverso"] == "rpg:source"
    sub = rel["subformulario"]
    assert sub is not None
    sub_campos = {c["id"]: c for c in sub["campos"]}
    assert sub_campos["rpg:source"]["oculto"] is True
    assert sub_campos["rpg:target"]["oculto"] is False
    assert sub_campos["rpg:target"]["tipo"] == "referencia"
    assert {c["clave"] for c in sub_campos["rpg:target"]["clases"]} == {"rpg:Character", "rpg:Faction"}
    assert sub_campos["rpg:relationshipType"]["tipo"] == "enum"
    assert "rpg:rel-debt" in {v["clave"] for v in sub_campos["rpg:relationshipType"]["valores"]}
    fuerza = sub_campos["rpg:strength"]
    assert fuerza["tipo"] == "entero"
    assert fuerza["restricciones"]["minInclusive"] == -3
    assert fuerza["restricciones"]["maxInclusive"] == 3
    # orden por sh:order dentro del subformulario
    assert [c["id"] for c in sub["campos"]][:3] == ["rpg:source", "rpg:target", "rpg:relationshipType"]


def test_tipos_de_campo_por_datatype_y_widget(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:Session").json()
    assert _campo(form, "rpg:sessionNumber")["tipo"] == "entero"
    assert _campo(form, "rpg:sessionDate")["tipo"] == "fecha"
    assert _campo(form, "rpg:sessionNotes")["tipo"] == "textoLargo"
    assert _campo(form, "schema:description")["tipo"] == "textoLargo"
    assert _campo(form, "foaf:depiction")["tipo"] == "iri"
    assert _campo(form, "foaf:depiction")["widget"] == "uri"
    place = cli.get(f"{URL}/rpg:Place").json()
    assert _campo(place, "schema:latitude")["tipo"] == "decimal"
    corr = _campo(place, "rpg:correspondsTo")
    assert corr["tipo"] == "iri"
    assert corr["restricciones"]["pattern"].startswith("^https?://")


def test_formulario_hereda_formas_de_superclases(cli: TestClient) -> None:
    pc = cli.get(f"{URL}/rpg:PlayerCharacter").json()
    ids = {c["id"] for c in pc["campos"]}
    # Entity + Character + PlayerCharacter
    assert {"rdfs:label", "rpg:locatedIn", "rpg:hasRelationship", "rpg:playedBy"} <= ids
    npc = cli.get(f"{URL}/rpg:NonPlayerCharacter").json()
    assert "rpg:playedBy" not in {c["id"] for c in npc["campos"]}


def test_etiquetas_en_espanol_por_defecto(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter").json()
    assert form["etiqueta"] == "PNJ"
    grupos = {g["id"]: g["etiqueta"] for g in form["grupos"]}
    assert grupos["rpgsh:IdentityGroup"] == "Identidad"
    assert _campo(form, "rpg:locatedIn")["etiqueta"] == "ubicado en"


@pytest.mark.parametrize("kwargs", [{"params": {"idioma": "en"}}, {"headers": {"Accept-Language": "en-GB,en;q=0.9"}}])
def test_etiquetas_en_ingles(cli: TestClient, kwargs: dict) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter", **kwargs).json()
    grupos = {g["id"]: g["etiqueta"] for g in form["grupos"]}
    assert grupos["rpgsh:IdentityGroup"] == "Identity"
    assert _campo(form, "rdfs:label")["etiqueta"] == "name"
    assert _campo(form, "rpg:locatedIn")["etiqueta"] == "located in"
    vital = _campo(form, "rpg:vitalStatus")
    assert {v["etiqueta"] for v in vital["valores"]} == {"alive", "dead", "missing", "unknown"}


def test_idioma_no_soportado_cae_al_espanol(cli: TestClient) -> None:
    form = cli.get(f"{URL}/rpg:NonPlayerCharacter", params={"idioma": "fr"},
                   headers={"Accept-Language": "fr-FR"}).json()
    assert _campo(form, "rdfs:label")["etiqueta"] == "nombre"


def test_clase_desconocida_404(cli: TestClient) -> None:
    r = cli.get(f"{URL}/rpg:NoExiste")
    assert r.status_code == 404
    assert "detalle" in r.json()


def test_prefijo_desconocido_400(cli: TestClient) -> None:
    assert cli.get(f"{URL}/zzz:Algo").status_code == 400


def test_campana_desconocida_404(cli: TestClient) -> None:
    assert cli.get("/campanas/nada/formularios/rpg:Place").status_code == 404


def test_formulario_variante_desconocida_404(cli: TestClient) -> None:
    r = cli.get(f"{URL}/rpg:NonPlayerCharacter", params={"variante": "rpg:Inventada"})
    assert r.status_code == 404


# ------------------------------------------------------------------ _merge
def _c(**kw: object) -> Campo:
    base: dict = {"id": "rpg:x", "ruta": "https://loregraph.example.org/ont/core#x", "etiqueta": "x", "tipo": "entero"}
    base.update(kw)
    return Campo(**base)


def test_merge_aplica_restricciones_mas_estrictas() -> None:
    a = _c(etiqueta="específica", cardinalidad=Cardinalidad(min=0, max=3),
           restricciones=Restricciones(minInclusive=0, maxInclusive=10, maxLength=20))
    b = _c(etiqueta="general", ayuda="ayuda de b", cardinalidad=Cardinalidad(min=1, max=None),
           restricciones=Restricciones(minInclusive=2, maxInclusive=5, minLength=1, maxLength=50, pattern="^a"))
    m = _merge(a, b)
    assert m.etiqueta == "específica"
    assert m.cardinalidad.min == 1 and m.cardinalidad.max == 3
    assert m.restricciones.minInclusive == 2
    assert m.restricciones.maxInclusive == 5
    assert m.restricciones.minLength == 1
    assert m.restricciones.maxLength == 20
    assert m.restricciones.pattern == "^a"
    assert m.ayuda == "ayuda de b"
    # no modifica los originales
    assert a.cardinalidad.min == 0 and a.restricciones.minInclusive == 0


def test_merge_conserva_valores_y_clases_si_faltan() -> None:
    a = _c(tipo="enum")
    b = _c(tipo="enum", valores=[OpcionValor(valor=1, etiqueta="uno")])
    m = _merge(a, b)
    assert m.valores is not None and m.valores[0].etiqueta == "uno"
    a2 = _c(tipo="enum", valores=[OpcionValor(valor=2, etiqueta="dos")])
    assert _merge(a2, b).valores[0].etiqueta == "dos"  # type: ignore[index]


def test_merge_sin_maximos_queda_sin_limite() -> None:
    m = _merge(_c(), _c())
    assert m.cardinalidad.max is None
    assert m.restricciones.minInclusive is None
    assert m.restricciones.minExclusive is None
