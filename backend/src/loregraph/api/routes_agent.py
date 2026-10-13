"""Ruta del agente interno (PydanticAI con modelo local)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import Field

from loregraph.agents.generator import GeneracionEntrada, ResultadoGeneracion
from loregraph.api.deps import ERROR_RESPONSES, CampDep, KernelDep, LangDep
from loregraph.apimodel import ApiModel
from loregraph.errors import UpstreamError
from loregraph.services.llm_context import ContextoLLM

router = APIRouter(prefix="/campanas/{cid}", responses=ERROR_RESPONSES)


class PeticionAgente(ApiModel):
    peticion: str = Field(min_length=1, description="Lo que quieres que haga el asistente.")


class RespuestaAgente(ApiModel):
    respuesta: str
    propuestas: list[str] = Field(description="Ids de las propuestas creadas (pendientes de revisión).")
    herramientas: list[str] = Field(description="Herramientas usadas, en orden.")
    modelo: str


class EstadoAgente(ApiModel):
    proveedor: str
    modelo: str
    url: str
    contexto: int


@router.get("/contexto-llm", tags=["agente"], summary="Contexto del sistema de juego para modelos de lenguaje",
            description="Lore, estadísticas (derivadas de SHACL y explicadas por el módulo), reglas clave, tono y "
                        "glosario. `max_caracteres` recorta por prioridad para modelos de contexto pequeño.")
def contexto_llm(camp: CampDep, kernel: KernelDep, lang: LangDep,
                 max_caracteres: Annotated[int | None, Query(ge=500, le=200_000)] = None) -> ContextoLLM:
    return kernel.llm_context.build(camp, lang, max_caracteres)


@router.get("/agente", tags=["agente"], summary="Configuración del modelo del asistente")
def estado_agente(camp: CampDep, kernel: KernelDep) -> EstadoAgente:
    from loregraph.agents.assistant import llm_config

    s = kernel.settings
    cfg = llm_config(kernel, camp)  # ajustes generales + los propios de la campaña
    return EstadoAgente(proveedor=s.llm_provider, modelo=cfg.modelo, url=s.llm_base_url, contexto=cfg.contexto_tokens)


@router.post("/agente", tags=["agente"], summary="Pedir algo al asistente (modelo local)",
             description="El asistente consulta el grafo y, si procede, crea propuestas que quedan pendientes "
                         "de revisión. Nunca escribe en el canon.")
def pedir_al_agente(camp: CampDep, entrada: PeticionAgente, kernel: KernelDep, lang: LangDep) -> RespuestaAgente:
    from loregraph.agents.assistant import llm_config, run_agent

    try:
        res = run_agent(kernel, camp, entrada.peticion, lang)
    except Exception as exc:  # noqa: BLE001 - errores del proveedor del modelo
        raise UpstreamError(f"El modelo no está disponible o falló: {exc}") from exc
    return RespuestaAgente(respuesta=res.respuesta, propuestas=res.propuestas, herramientas=res.herramientas,
                           modelo=llm_config(kernel, camp).modelo)


@router.post("/generar", tags=["agente"], status_code=201,
             summary="Generar entidades con IA (fichas alineadas con el sistema de juego)",
             description="El esquema de salida se deriva del formulario SHACL de la clase (rangos, valores permitidos, "
                         "referencias a entidades existentes) y el resultado se valida antes de guardarse como "
                         "propuesta pendiente de revisión. Nunca escribe en el canon.")
def generar(camp: CampDep, entrada: GeneracionEntrada, kernel: KernelDep, lang: LangDep) -> ResultadoGeneracion:
    from loregraph.agents.generator import generate
    from loregraph.errors import DomainError

    try:
        return generate(kernel, camp, entrada, lang)
    except DomainError:
        raise
    except Exception as exc:  # noqa: BLE001 - errores del proveedor o salida imposible de corregir
        raise UpstreamError(f"El modelo no pudo generar una ficha válida: {exc}") from exc
