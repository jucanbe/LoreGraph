"""Agente interno (PydanticAI) con modelos de prueba: sin llamadas a ningún LLM real."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    TextPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from loregraph.agents import assistant
from loregraph.agents.assistant import create_agent, run_agent
from loregraph.services.kernel import Kernel
from tests.conftest import Campana

INVALIDA = {"peticion": "Crea a la posadera", "entidades": [
    {"ref": "nuevo:1", "clases": ["rpg:NonPlayerCharacter"], "valores": {"rpg:locatedIn": ["madrid"]}}]}
VALIDA = {"peticion": "Crea a la posadera", "resumen": "Posadera de Madrid", "entidades": [
    {"ref": "nuevo:1", "clases": ["rpg:NonPlayerCharacter"],
     "valores": {"rdfs:label": ["Posadera"], "rpg:locatedIn": ["madrid"]}}]}


def _guion() -> tuple[FunctionModel, list[list[ModelMessage]]]:
    """Modelo guionizado: propuesta inválida → (reintento) → propuesta válida → respuesta final."""
    vistos: list[list[ModelMessage]] = []

    def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        vistos.append(list(messages))
        ultimo = messages[-1]
        partes = ultimo.parts if isinstance(ultimo, ModelRequest) else []
        if any(isinstance(p, RetryPromptPart) for p in partes):
            return ModelResponse(parts=[ToolCallPart("proponer_triples", VALIDA)])
        if any(isinstance(p, ToolReturnPart) for p in partes):
            return ModelResponse(parts=[TextPart("He propuesto a la posadera.")])
        return ModelResponse(parts=[ToolCallPart("proponer_triples", INVALIDA)])

    return FunctionModel(fn), vistos


def test_reintento_y_propuesta_creada(campana: Campana, kernel: Kernel) -> None:
    camp = kernel.campaign("prueba")
    modelo, vistos = _guion()
    agent, acc = create_agent(kernel, camp, model=modelo)
    result = agent.run_sync("Crea a la posadera de Madrid")
    assert result.output == "He propuesto a la posadera."
    assert acc.herramientas == ["proponer_triples", "proponer_triples"]
    assert len(acc.propuestas) == 1
    # el error de validación volvió al modelo como reintento, en español y legible
    reintento = next(p for m in vistos[1] if isinstance(m, ModelRequest) for p in m.parts
                     if isinstance(p, RetryPromptPart))
    texto = reintento.content if isinstance(reintento.content, str) else str(reintento.content)
    assert "La propuesta no es válida" in texto and "rdfs:label" in texto
    # la propuesta está pendiente y no toca el canon
    prop = kernel.proposals.detail(camp, acc.propuestas[0])
    assert prop.estado == "pendiente" and prop.tipoAgente == "agente"
    assert prop.agente == f"local:{kernel.settings.llm_model}"
    assert prop.resumen == "Posadera de Madrid"
    assert kernel.entities.list(camp, q="posadera").pagina.total == 0


def test_instrucciones_del_agente(campana: Campana, kernel: Kernel) -> None:
    camp = kernel.campaign("prueba")
    modelo, vistos = _guion()
    agent, _ = create_agent(kernel, camp, model=modelo, lang="en")
    agent.run_sync("hola")
    primera = vistos[0][0]
    assert isinstance(primera, ModelRequest)
    assert "«Prueba» (id: prueba)" in (primera.instructions or "")
    assert "English" in (primera.instructions or "")
    assert "rpg:PlayerCharacter (Player character)" in (primera.instructions or "")


def test_reintentos_agotados(campana: Campana, kernel: Kernel) -> None:
    from pydantic_ai.exceptions import UnexpectedModelBehavior

    def siempre_mal(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[ToolCallPart("proponer_triples", INVALIDA)])

    kernel.settings.llm_max_retries = 1
    agent, acc = create_agent(kernel, kernel.campaign("prueba"), model=FunctionModel(siempre_mal))
    with pytest.raises(UnexpectedModelBehavior):
        agent.run_sync("x")
    assert acc.propuestas == []
    assert kernel.proposals.list(kernel.campaign("prueba")) == []


def test_herramientas_de_lectura_con_test_model(campana: Campana, kernel: Kernel) -> None:
    """TestModel llama a todas las herramientas con argumentos sintéticos; ninguna debe romper el agente."""
    agent, acc = create_agent(kernel, kernel.campaign("prueba"),
                              model=TestModel(call_tools=["buscar_entidades", "describir_entidad", "esquema_clase"]))
    res = agent.run_sync("¿Quién es Lucía?")
    assert isinstance(res.output, str)
    assert acc.herramientas == ["buscar_entidades", "describir_entidad", "esquema_clase"]


def test_sparql_fallida_se_reintenta(campana: Campana, kernel: Kernel) -> None:
    llamadas: list[str] = []

    def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        partes = messages[-1].parts if isinstance(messages[-1], ModelRequest) else []
        if any(isinstance(p, ToolReturnPart) for p in partes):
            return ModelResponse(parts=[TextPart("hecho")])
        consulta = "SELECT" if not llamadas else "SELECT ?s WHERE { ?s a rpg:Place }"
        llamadas.append(consulta)
        return ModelResponse(parts=[ToolCallPart("consultar_sparql", {"consulta": consulta})])

    agent, acc = create_agent(kernel, kernel.campaign("prueba"), model=FunctionModel(fn))
    assert agent.run_sync("lugares").output == "hecho"
    assert acc.herramientas == ["consultar_sparql", "consultar_sparql"]


def test_run_agent(campana: Campana, kernel: Kernel) -> None:
    modelo, _ = _guion()
    res = run_agent(kernel, kernel.campaign("prueba"), "Crea a la posadera", model=modelo)
    assert res.respuesta == "He propuesto a la posadera."
    assert len(res.propuestas) == 1


def test_ruta_del_agente(campana: Campana, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    estado = client.get("/campanas/prueba/agente").json()
    assert estado["proveedor"] == "ollama" and estado["contexto"] == 8192
    modelo, _ = _guion()
    monkeypatch.setattr(assistant, "build_model", lambda settings, modelo_nombre=None: modelo)
    r = client.post("/campanas/prueba/agente", json={"peticion": "Crea a la posadera"})
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["respuesta"] == "He propuesto a la posadera."
    assert len(body["propuestas"]) == 1
    assert body["herramientas"] == ["proponer_triples", "proponer_triples"]
    assert client.get("/campanas/prueba/propuestas").json()[0]["id"] == body["propuestas"][0]


def test_ruta_del_agente_con_modelo_caido(campana: Campana, client: TestClient,
                                          monkeypatch: pytest.MonkeyPatch) -> None:
    def roto(settings: Any, modelo: str | None = None) -> FunctionModel:
        def fn(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
            raise ConnectionError("modelo no disponible")

        return FunctionModel(fn)

    monkeypatch.setattr(assistant, "build_model", roto)
    r = client.post("/campanas/prueba/agente", json={"peticion": "hola"})
    assert r.status_code == 502
    assert "modelo no disponible" in r.json()["detalle"]
    assert client.post("/campanas/prueba/agente", json={"peticion": ""}).status_code == 422


def test_build_model_sin_red() -> None:
    """Construir el modelo no hace llamadas de red (solo configura el cliente)."""
    from loregraph.config import Settings

    m = assistant.build_model(Settings(_env_file=None, llm_provider="openai", llm_base_url="http://localhost:1/v1"))  # type: ignore[call-arg]
    assert m.model_name == Settings(_env_file=None).llm_model  # type: ignore[call-arg]
