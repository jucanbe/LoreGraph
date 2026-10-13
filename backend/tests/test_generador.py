"""Generador de entidades con IA: esquema de salida derivado de SHACL, reintentos y propuesta."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, RetryPromptPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from loregraph.agents import generator
from loregraph.agents.generator import GeneracionEntrada, build_output_spec, generate
from loregraph.services.kernel import Kernel
from tests.conftest import Campana

HISTORIA = ("Nació en una familia de prestamistas de Toledo y llegó a Madrid huyendo de deudas ajenas. "
            "Desde entonces regenta una posada junto a la Plaza Mayor donde escucha más de lo que habla.")


def _ficha(nombre: str, **extra: object) -> dict[str, object]:
    return {"label": nombre, "backstory": HISTORIA, "locatedIn": "madrid", **extra}


def _guion(*salidas: dict[str, object]) -> tuple[FunctionModel, list[str]]:
    """Devuelve las salidas en orden (una por llamada) y guarda los textos de reintento."""
    reintentos: list[str] = []
    cola = list(salidas)

    def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        ultimo = messages[-1]
        for p in ultimo.parts if isinstance(ultimo, ModelRequest) else []:
            if isinstance(p, RetryPromptPart):
                reintentos.append(p.content if isinstance(p.content, str) else str(p.content))
        tool = info.output_tools[0].name
        return ModelResponse(parts=[ToolCallPart(tool, cola.pop(0) if len(cola) > 1 else cola[0])])

    return FunctionModel(fn), reintentos


def test_esquema_de_salida_desde_shacl(campana: Campana, kernel: Kernel) -> None:
    camp = kernel.campaign("prueba")
    form = kernel.entities.form(camp, ["rpg:NonPlayerCharacter"], "es")
    spec = build_output_spec(kernel, camp, form, "es", 2, True)
    schema = spec.model.model_json_schema()
    ficha = schema["$defs"]["Ficha"]
    props = ficha["properties"]
    assert "backstory" in ficha["required"] and "label" in ficha["required"]
    # las referencias solo admiten entidades existentes del tipo adecuado
    assert set(props["locatedIn"]["anyOf"][0]["enum"]) == {"madrid", "toledo"}
    assert ("madrid", "Madrid") in spec.candidatos["locatedIn"]
    # sin campos internos ni IRIs externas
    assert not {"hasDepiction", "hasHistory", "inspiredBy", "correspondsTo"} & set(props)
    # relación cualificada anidada: con su destino, pero sin el enlace inverso
    rel = next(s for s in spec.slots if s.campo.id == "rpg:hasRelationship")
    assert rel.sub and "rpg:target" in {s.campo.id for s in rel.sub}
    # exactamente las fichas pedidas
    assert schema["properties"]["fichas"]["minItems"] == 2 == schema["properties"]["fichas"]["maxItems"]
    with pytest.raises(ValidationError):
        spec.model.model_validate({"fichas": [_ficha("A"), _ficha("B", locatedIn="no-existe")]})
    sin_historia = build_output_spec(kernel, camp, form, "es", 1, False).model.model_json_schema()
    assert "backstory" not in sin_historia["$defs"]["Ficha"]["properties"]


def test_generar_con_reintento(campana: Campana, kernel: Kernel) -> None:
    camp = kernel.campaign("prueba")
    rel = {"target": "ernesto", "relationshipType": "deuda", "strength": -1}
    modelo, reintentos = _guion(
        {"fichas": [_ficha("Don Ernesto")]},  # nombre ya existente → corrección
        {"fichas": [_ficha("Rosario la Posadera", memberOf=["camarilla"], hasRelationship=[rel])]},
    )
    entrada = GeneracionEntrada(clase="rpg:NonPlayerCharacter", peticion="Una posadera", cantidad=1)
    res = generate(kernel, camp, entrada, "es", model=modelo)
    assert res.reintentos == 1 and "Don Ernesto" in reintentos[0].replace("don ernesto", "Don Ernesto")
    assert res.entidades[0].nombre == "Rosario la Posadera"
    assert res.entidades[0].valores["rpg:backstory"] == [HISTORIA]
    prop = kernel.proposals.detail(camp, res.propuesta.id)
    assert prop.estado == "pendiente" and prop.agente.startswith("generador:")
    # el canon no cambia hasta aprobar
    assert kernel.entities.list(camp, q="Rosario").pagina.total == 0
    assert any(t.predicado.clave == "rpg:backstory" for t in prop.anadidas)
    assert any(t.predicado.clave == "rpg:target" for t in prop.anadidas)


def test_valor_fuera_del_esquema_se_corrige(campana: Campana, kernel: Kernel) -> None:
    camp = kernel.campaign("prueba")
    modelo, reintentos = _guion(
        {"fichas": [_ficha("Rosario", locatedIn="atlantida")]},
        {"fichas": [_ficha("Rosario")]},
    )
    res = generate(kernel, camp, GeneracionEntrada(clase="rpg:NonPlayerCharacter"), "es", model=modelo)
    assert reintentos and "atlantida" in reintentos[0]
    assert res.entidades[0].valores["rpg:locatedIn"] == ["madrid"]


def test_ruta_generar(campana: Campana, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    modelo, _ = _guion({"fichas": [_ficha("Rosario"), _ficha("Ramiro")]})
    monkeypatch.setattr(generator, "build_model", lambda settings, nombre=None: modelo)
    r = client.post("/campanas/prueba/generar", json={"clase": "rpg:NonPlayerCharacter", "cantidad": 2})
    assert r.status_code == 201, r.json()
    assert [e["nombre"] for e in r.json()["entidades"]] == ["Rosario", "Ramiro"]
    assert r.json()["propuesta"]["estado"] == "pendiente"
    # cantidad incorrecta del modelo sin corregir → error del proveedor (502), sin propuesta
    modelo_malo, _ = _guion({"fichas": [_ficha("Solo uno")]})
    monkeypatch.setattr(generator, "build_model", lambda settings, nombre=None: modelo_malo)
    r = client.post("/campanas/prueba/generar", json={"clase": "rpg:NonPlayerCharacter", "cantidad": 2})
    assert r.status_code == 502
    assert client.post("/campanas/prueba/generar", json={"clase": "rpg:Nada"}).status_code in (400, 404)
