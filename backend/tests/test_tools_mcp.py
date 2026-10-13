"""Herramientas compartidas para agentes (``KGTools``) y su exposición por MCP."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from loregraph.mcp.server import create_mcp
from loregraph.models import CampanaEntrada
from loregraph.services.kernel import Kernel
from loregraph.tools.core import TOOL_NAMES, KGTools
from tests.conftest import Campana, RemotoFalso, sparql_json


@pytest.fixture
def tools(campana: Campana, kernel: Kernel) -> KGTools:
    return KGTools(kernel, agent_name="pruebas")


def test_listar_campanas(tools: KGTools) -> None:
    assert tools.listar_campanas() == [
        {"id": "prueba", "nombre": "Prueba", "sistema": "Genérico", "modulos": [], "entidades": 9}]


def test_listar_tipos(tools: KGTools) -> None:
    res = tools.listar_tipos("prueba")
    tipos = {t["clase"]: t for t in res["tipos"]}
    assert tipos["rpg:Place"] == {"clase": "rpg:Place", "nombre": "Lugar", "entidades": 2, "variantes": []}
    assert "rpg" in res["prefijos"]
    assert "error" in tools.listar_tipos("nada")


def test_describir_entidad(tools: KGTools) -> None:
    d = tools.describir_entidad("prueba", "lucia")
    assert d["id"] == "lucia" and d["nombre"] == "Lucía" and d["tipo"] == "rpg:PlayerCharacter"
    assert d["propiedades"]["rpg:locatedIn"] == ["Madrid (madrid)"]
    assert "rdfs:label" not in d["propiedades"]
    rel = d["propiedades"]["rpg:hasRelationship"][0]
    assert rel.startswith("{") and "Don Ernesto (ernesto)" in rel and "-2" in rel
    assert "→ deuda: Don Ernesto (ernesto) [-2, desde Sesión 1]" in d["relaciones"]
    assert "→ ubicado en: Madrid (madrid)" in d["relaciones"]
    e = tools.describir_entidad("prueba", "ernesto")
    assert "← deuda: Lucía (lucia) [-2, desde Sesión 1]" in e["relaciones"]
    assert tools.describir_entidad("prueba", "nada") == {"error": "No existe la entidad 'nada'"}


def test_buscar_entidades(tools: KGTools) -> None:
    res = tools.buscar_entidades("prueba", "lucia")
    assert res == {"total": 1, "resultados": [{"entidad": "Lucía (lucia)", "tipo": "Personaje jugador",
                                               "descripcion": ""}]}
    res = tools.buscar_entidades("prueba", "sesion", clase="rpg:Session", limite=2)
    assert res["total"] == 3 and len(res["resultados"]) == 2
    assert "error" in tools.buscar_entidades("nada", "x")


def test_esquema_clase(tools: KGTools) -> None:
    res = tools.esquema_clase("prueba", "rpg:NonPlayerCharacter")
    campos = {c["clave"]: c for c in res["campos"]}
    assert campos["rdfs:label"] == {"clave": "rdfs:label", "nombre": "nombre", "tipo": "texto",
                                    "obligatorio": True, "unico": True}
    assert campos["rpg:locatedIn"]["clases"] == ["rpg:Place"]
    assert "rpg:vital-dead" in campos["rpg:vitalStatus"]["valores"]
    sub = {c["clave"]: c for c in campos["rpg:hasRelationship"]["campos"]}
    assert "rpg:source" not in sub  # campo oculto
    assert sub["rpg:strength"]["minInclusive"] == -3 and sub["rpg:strength"]["maxInclusive"] == 3
    assert res["variantes"] == []
    assert "error" in tools.esquema_clase("prueba", "rpg:Nada")


def test_consultar_sparql(tools: KGTools) -> None:
    res = tools.consultar_sparql("prueba", "SELECT ?p ?n WHERE { ?p a rpg:PlayerCharacter ; rdfs:label ?n }")
    assert res == {"variables": ["p", "n"], "filas": [{"p": "Lucía (lucia)", "n": "Lucía"}], "truncado": False}
    assert tools.consultar_sparql("prueba", "ASK { ?a rpg:knows ?b }") == {"resultado": False}
    res = tools.consultar_sparql("prueba", "CONSTRUCT { ?a rpg:locatedIn ?b } WHERE { ?a rpg:locatedIn ?b }")
    assert "Lucía (lucia) rpg:locatedIn Madrid (madrid)" in res["filas"]
    assert "error" in tools.consultar_sparql("prueba", "INSERT DATA { <urn:a> <urn:b> <urn:c> }")
    assert "error" in tools.consultar_sparql("prueba", "SELECT")
    res = tools.consultar_sparql("prueba", "SELECT ?s WHERE { ?s ?p ?o }", limite=1)
    assert len(res["filas"]) == 1 and res["truncado"] is True


def test_proponer_triples(tools: KGTools, kernel: Kernel) -> None:
    mal = tools.proponer_triples("prueba", "crea un PNJ", entidades=[
        {"ref": "nuevo:1", "clases": ["rpg:NonPlayerCharacter"], "valores": {"rpg:locatedIn": ["madrid"]}}])
    assert mal["ok"] is False
    assert any(e["campo"] == "rdfs:label" for e in mal["errores"])
    assert "consejo" in mal
    bien = tools.proponer_triples("prueba", "crea un PNJ", resumen="Guardia", entidades=[
        {"ref": "nuevo:1", "clases": ["rpg:NonPlayerCharacter"], "valores": {"rdfs:label": ["Guardia"]}}])
    assert bien["ok"] is True and bien["estado"] == "pendiente" and bien["anadidas"] == 2
    assert bien["nota"] == "Pendiente de revisión humana."
    prop = kernel.proposals.list(kernel.campaign("prueba"))[0]
    assert prop.agente == "pruebas" and prop.tipoAgente == "agente" and prop.peticion == "crea un PNJ"
    # el canon no cambia
    assert tools.buscar_entidades("prueba", "guardia")["total"] == 0
    formato = tools.proponer_triples("prueba", "x", entidades=[{"clases": ["rpg:Place"]}])
    assert formato["error"].startswith("Formato no válido")
    assert "error" in tools.proponer_triples("prueba", "x", destino="otro",
                                             anadir=[{"s": "toledo", "p": "rdfs:label", "o": "x", "literal": True}])
    assert "error" in tools.proponer_triples("nada", "x")


def test_listar_propuestas(tools: KGTools) -> None:
    assert tools.listar_propuestas("prueba") == {"propuestas": []}
    tools.proponer_triples("prueba", "describe Toledo",
                           anadir=[{"s": "toledo", "p": "schema:description", "o": "Vieja", "literal": True}])
    res = tools.listar_propuestas("prueba")
    assert len(res["propuestas"]) == 1
    p = res["propuestas"][0]
    assert p["estado"] == "pendiente" and p["agente"] == "pruebas" and p["anadidas"] == 1
    assert tools.listar_propuestas("prueba", estado="aprobada") == {"propuestas": []}
    assert len(tools.listar_propuestas("prueba", estado="cualquiera")["propuestas"]) == 1


def test_consultar_mundo_real(tools: KGTools, remoto: RemotoFalso) -> None:
    remoto.cuando(lambda req, q: "?labelAlt" in q, sparql_json(["label"], [{"label": "Madrid"}]))
    res = tools.consultar_mundo_real(recurso="http://www.wikidata.org/entity/Q2807")
    assert res["etiqueta"] == "Madrid" and res["fuente"] == "wikidata"
    res = tools.consultar_mundo_real(campana="prueba", entidad="madrid")
    assert res["anclas"][0]["relacion"] == "rpg:correspondsTo"
    remoto.cuando(lambda req, q: "wd:Q515" in q, sparql_json(["x"], [{"x": "1"}, {"x": "2"}]))
    res = tools.consultar_mundo_real(consulta="SELECT ?x WHERE { ?x wdt:P31 wd:Q515 }")
    assert res == {"variables": ["x"], "filas": [{"x": "1"}, {"x": "2"}]}
    assert tools.consultar_mundo_real() == {"error": "Indica 'recurso', 'consulta' o 'campana'+'entidad'"}
    assert "error" in tools.consultar_mundo_real(campana="prueba", entidad="nada")


def test_leer_instrucciones_sin_prompts(tools: KGTools) -> None:
    assert tools.leer_instrucciones("prueba") == {}
    assert "error" in tools.leer_instrucciones("nada")


# ---------------------------------------------------------- presupuesto (_fit)
def test_fit_recorta_listas_al_presupuesto(kernel: Kernel) -> None:
    t = KGTools(kernel, max_chars=200)
    data = {"total": 50, "resultados": [{"entidad": f"Entidad número {i}"} for i in range(50)]}
    out = t._fit(data)
    assert out["truncado"] is True
    assert 0 < len(out["resultados"]) < 50
    assert out["resultados"][0] == {"entidad": "Entidad número 0"}  # se conservan los primeros


def test_fit_respeta_el_presupuesto_incluida_la_marca(kernel: Kernel) -> None:
    t = KGTools(kernel, max_chars=200)
    out = t._fit({"total": 50, "resultados": [{"entidad": f"Entidad número {i}"} for i in range(50)]})
    assert len(json.dumps(out, ensure_ascii=False)) <= 200


def test_fit_no_toca_lo_que_cabe(kernel: Kernel) -> None:
    t = KGTools(kernel, max_chars=10_000)
    data = {"filas": [1, 2, 3]}
    assert t._fit(data) == {"filas": [1, 2, 3]}
    lista = [{"x": "y" * 50} for _ in range(10)]
    assert len(KGTools(kernel, max_chars=200)._fit(lista)) == 3


def test_fit_presupuesto_por_defecto_segun_contexto(kernel: Kernel) -> None:
    kernel.settings.llm_context_tokens = 1000
    assert KGTools(kernel).max_chars == int(1000 * 3.5 * 0.4)


def test_salidas_reales_respetan_el_presupuesto(tools: KGTools, kernel: Kernel) -> None:
    t = KGTools(kernel, max_chars=300)
    res = t.consultar_sparql("prueba", "SELECT ?s ?p ?o WHERE { ?s ?p ?o }", limite=200)
    assert res["truncado"] is True
    assert len(json.dumps(res, ensure_ascii=False)) <= 300


# ------------------------------------------------------------------------ MCP
async def test_mcp_lista_herramientas(kernel: Kernel) -> None:
    mcp = create_mcp(kernel)
    nombres = {t.name for t in await mcp.list_tools()}
    assert {"listar_campanas", "describir_entidad", "buscar_entidades", "consultar_sparql", "consultar_mundo_real",
            "proponer_triples", "listar_propuestas"} <= nombres
    assert nombres == set(TOOL_NAMES)
    herramientas = {t.name: t for t in await mcp.list_tools()}
    assert herramientas["consultar_sparql"].annotations.read_only_hint is True
    assert herramientas["proponer_triples"].annotations.read_only_hint is False


async def test_mcp_llamadas(client: TestClient, campana: Campana, kernel: Kernel) -> None:
    mcp = create_mcp(kernel)
    r = await mcp.call_tool("listar_campanas", {})
    assert r.is_error is False
    assert r.structured_content == {"result": [
        {"id": "prueba", "nombre": "Prueba", "sistema": "Genérico", "modulos": [], "entidades": 9}]}
    assert json.loads(r.content[0].text)["id"] == "prueba"
    r = await mcp.call_tool("describir_entidad", {"campana": "prueba", "entidad": "lucia"})
    assert r.structured_content["nombre"] == "Lucía"


async def test_mcp_proponer_triples_solo_crea_propuestas(client: TestClient, campana: Campana, kernel: Kernel) -> None:
    mcp = create_mcp(kernel)
    antes = len(kernel.store.graph_triples(kernel.iris.canon("prueba")))
    r = await mcp.call_tool("proponer_triples", {
        "campana": "prueba", "peticion": "Toledo es antigua",
        "anadir": [{"s": "toledo", "p": "schema:description", "o": "Antigua", "literal": True}]})
    assert r.structured_content["ok"] is True
    assert len(kernel.store.graph_triples(kernel.iris.canon("prueba"))) == antes
    props = client.get("/campanas/prueba/propuestas").json()
    assert props[0]["agente"] == "mcp:agente" and props[0]["tipoAgente"] == "agente"
    r = await mcp.call_tool("listar_propuestas", {"campana": "prueba"})
    assert len(r.structured_content["propuestas"]) == 1


async def test_mcp_publica_prompts_de_modulos(tmp_path, remoto) -> None:  # type: ignore[no-untyped-def]
    from tests.conftest import escribir_modulo, make_settings

    d = escribir_modulo(tmp_path / "mods", "alfa")
    (d / "prompts").mkdir()
    (d / "prompts" / "convenciones.md").write_text("# Convenciones de alfa\nUsa alfa:Monster.", encoding="utf-8")
    k = Kernel(make_settings(tmp_path, modules_dir=tmp_path / "mods"), in_memory=True)
    mcp = create_mcp(k)
    prompts = {p.name: p for p in await mcp.list_prompts()}
    assert prompts["alfa-convenciones"].description == "Convenciones de alfa"
    k.campaigns.create(CampanaEntrada(nombre="A", id="a", modulos=["alfa"]))
    assert KGTools(k).leer_instrucciones("a") == {"alfa": {"convenciones": "# Convenciones de alfa\nUsa alfa:Monster."}}
