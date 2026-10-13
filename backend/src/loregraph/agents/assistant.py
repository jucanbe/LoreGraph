"""Agente interno con PydanticAI, pensado para modelos locales (Ollama, LM Studio…).

Usa las mismas herramientas que el servidor MCP (:class:`KGTools`). Cuando una
propuesta no supera la validación, el error vuelve al modelo como ``ModelRetry``
para que lo corrija (hasta ``LLM_MAX_RETRIES`` veces).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from pydantic_ai import Agent, ModelRetry, UsageLimits
from pydantic_ai.models import Model

from loregraph.config import Settings
from loregraph.services.kernel import CampaignHandle, Kernel
from loregraph.tools.core import KGTools

BASE_INSTRUCTIONS = """\
Eres un asistente para dirigir partidas de rol. Trabajas sobre el grafo de conocimiento de la campaña «{nombre}» (id: {cid}).
Reglas:
- Responde en {idioma_nombre}, de forma breve.
- Consulta antes de inventar: usa buscar_entidades y describir_entidad para no duplicar entidades.
- Para guardar algo usa proponer_triples. Tus cambios NO se aplican: un humano los revisa.
- Para entidades nuevas usa refs temporales ("nuevo:1") y las claves de esquema_clase.
- Nunca uses owl:sameAs con recursos reales; usa rpg:inspiredBy.
- Las entidades se citan como «Nombre (id)»; usa el id en las herramientas.
Tipos disponibles: {tipos}

{contexto_juego}

{instrucciones_modulos}"""

#: Reparto del contexto del modelo (en caracteres ≈ tokens × 3,5) para las instrucciones.
CHARS_PER_TOKEN = 3.5
SHARE_GAME_CONTEXT = 0.30
SHARE_CONVENTIONS = 0.12


@dataclass
class AgentRunResult:
    respuesta: str
    propuestas: list[str] = field(default_factory=list)
    herramientas: list[str] = field(default_factory=list)


@dataclass
class LLMConfig:
    """Configuración efectiva del modelo para una campaña (ajustes generales + de la campaña)."""

    modelo: str
    contexto_tokens: int


def llm_config(kernel: Kernel, camp: CampaignHandle) -> LLMConfig:
    s = kernel.settings
    over = kernel.campaign_settings.get(camp).asistente
    return LLMConfig(modelo=over.modelo or s.llm_model, contexto_tokens=over.contextoTokens or s.llm_context_tokens)


def build_model(settings: Settings, modelo: str | None = None) -> Model:
    """Modelo según la configuración ``LLM_*`` (por defecto Ollama local, API compatible con OpenAI).
    ``modelo`` sustituye al nombre configurado (p. ej. el modelo propio de una campaña)."""
    from pydantic_ai.models.openai import OpenAIChatModel

    provider_name = settings.llm_provider.lower()
    if provider_name == "ollama":
        from pydantic_ai.providers.ollama import OllamaProvider

        provider: Any = OllamaProvider(base_url=settings.llm_base_url, api_key=settings.llm_api_key)
    else:
        # 'openai' o cualquier servidor compatible (LM Studio, llama.cpp, vLLM…)
        from pydantic_ai.providers.openai import OpenAIProvider

        provider = OpenAIProvider(base_url=settings.llm_base_url, api_key=settings.llm_api_key or "sin-clave")
    return OpenAIChatModel(modelo or settings.llm_model, provider=provider)


def _instructions(kernel: Kernel, camp: CampaignHandle, lang: str, context_tokens: int) -> str:
    """Instrucciones del agente: reglas fijas, contexto del sistema de juego (lore,
    estadísticas, reglas, glosario; recortado por prioridad) y convenciones de los módulos."""
    total_chars = int(context_tokens * CHARS_PER_TOKEN)
    info = kernel.campaigns.info(camp, lang)
    tipos = ", ".join(f"{t.clase.clave} ({t.clase.etiqueta})" for t in info.tipos)
    juego = kernel.llm_context.build(camp, lang, max(800, int(total_chars * SHARE_GAME_CONTEXT)))
    prompts = []
    for m in camp.ctx.modules:
        for name, text in m.prompts.items():
            if name.startswith("agente") or name in ("sistema", "convenciones"):
                prompts.append(text.strip())
    extra = "\n\n".join(prompts)
    max_conv = max(600, int(total_chars * SHARE_CONVENTIONS))
    if len(extra) > max_conv:
        extra = extra[:max_conv] + "…"
    return BASE_INSTRUCTIONS.format(
        nombre=camp.nombre, cid=camp.id, idioma_nombre="español" if lang == "es" else "English",
        tipos=tipos, contexto_juego=juego.texto.strip(), instrucciones_modulos=extra,
    )


def create_agent(kernel: Kernel, camp: CampaignHandle, model: Model | None = None, lang: str = "es",
                 agent_name: str | None = None) -> tuple[Agent[None, str], AgentRunResult]:
    """Crea un agente para una campaña. Devuelve el agente y un acumulador de resultados."""
    settings = kernel.settings
    cfg = llm_config(kernel, camp)
    name = agent_name or f"local:{cfg.modelo}"
    tools = KGTools(kernel, agent_name=name, lang=lang,
                    max_chars=int(cfg.contexto_tokens * CHARS_PER_TOKEN * 0.4))
    acc = AgentRunResult(respuesta="")
    cid = camp.id

    def _log(tool: str) -> None:
        acc.herramientas.append(tool)

    def buscar_entidades(texto: str, clase: str | None = None, limite: int = 8) -> dict[str, Any]:
        """Busca entidades por texto. Devuelve «Nombre (id)», tipo y descripción breve."""
        _log("buscar_entidades")
        return tools.buscar_entidades(cid, texto, clase, limite)

    def describir_entidad(entidad: str) -> dict[str, Any]:
        """Ficha compacta de una entidad por su id: propiedades y relaciones."""
        _log("describir_entidad")
        return tools.describir_entidad(cid, entidad)

    def contexto_sistema() -> dict[str, Any]:
        """Lore, estadísticas, reglas clave y glosario completos del sistema de juego (si las instrucciones
        dicen que el contexto está recortado y necesitas más detalle)."""
        _log("contexto_sistema")
        return tools.contexto_sistema(cid, int(cfg.contexto_tokens * CHARS_PER_TOKEN * 0.5))

    def esquema_clase(clase: str, variantes: list[str] | None = None) -> dict[str, Any]:
        """Campos válidos de una clase (p. ej. 'rpg:NonPlayerCharacter'), para proponer entidades."""
        _log("esquema_clase")
        return tools.esquema_clase(cid, clase, variantes)

    def consultar_sparql(consulta: str, limite: int = 30) -> dict[str, Any]:
        """Consulta SPARQL de solo lectura. Prefijos ya declarados (rpg:, rdfs:, skos:…)."""
        _log("consultar_sparql")
        res = tools.consultar_sparql(cid, consulta, limite)
        if "error" in res:
            raise ModelRetry(f"La consulta falló: {res['error']}. Corrígela o usa buscar_entidades.")
        return res

    def consultar_mundo_real(recurso: str) -> dict[str, Any]:
        """Datos reales de Wikidata/DBpedia sobre un recurso (IRI). Solo como inspiración."""
        _log("consultar_mundo_real")
        return tools.consultar_mundo_real(recurso=recurso)

    def proponer_triples(
        peticion: str,
        entidades: list[dict[str, Any]] | None = None,
        anadir: list[dict[str, Any]] | None = None,
        eliminar: list[dict[str, Any]] | None = None,
        resumen: str | None = None,
        destino: str = "canon",
    ) -> dict[str, Any]:
        """Propone cambios (quedan pendientes de revisión humana).
        entidades: [{"ref": "nuevo:1", "clases": ["rpg:NonPlayerCharacter"], "valores": {"rdfs:label": ["Nombre"]}}]
        anadir/eliminar: [{"s": "id", "p": "rpg:memberOf", "o": "id"}]"""
        _log("proponer_triples")
        res = tools.proponer_triples(cid, peticion, entidades, anadir, eliminar, None, resumen, destino)
        if not res.get("ok"):
            raise ModelRetry(
                "La propuesta no es válida. Errores: "
                + json.dumps(res.get("errores") or res.get("error"), ensure_ascii=False)
                + ". Corrige y vuelve a llamar a proponer_triples."
            )
        acc.propuestas.append(res["propuesta"])
        return res

    agent: Agent[None, str] = Agent(
        model or build_model(settings, cfg.modelo),
        instructions=_instructions(kernel, camp, lang, cfg.contexto_tokens),
        tools=[buscar_entidades, describir_entidad, contexto_sistema, esquema_clase, consultar_sparql, consultar_mundo_real,
               proponer_triples],
        retries=settings.llm_max_retries,
        model_settings={"timeout": settings.llm_timeout_s},
        name="asistente-loregraph",
    )
    return agent, acc


def run_agent(kernel: Kernel, camp: CampaignHandle, peticion: str, lang: str = "es",
              model: Model | None = None) -> AgentRunResult:
    agent, acc = create_agent(kernel, camp, model, lang)
    result = agent.run_sync(peticion, usage_limits=UsageLimits(request_limit=20))
    acc.respuesta = str(result.output)
    return acc
