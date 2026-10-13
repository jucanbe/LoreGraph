"""Generador de entidades con IA (PydanticAI, salida estructurada).

El esquema de salida se construye en tiempo de ejecución a partir del
formulario SHACL de la clase: tipos, rangos (p. ej. puntos 1–5), valores
permitidos (``Literal``), cardinalidad y referencias a entidades existentes.
Así el modelo —aunque sea pequeño y local— solo puede devolver fichas que
encajan con el sistema de juego. Después, cada resultado pasa la misma
validación SHACL que una propuesta; si falla, el error vuelve al modelo como
``ModelRetry`` para que lo corrija. El resultado se guarda como propuesta:
nunca se escribe en el canon sin revisión humana.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, create_model
from pydantic_ai import Agent, ModelRetry, NativeOutput, PromptedOutput, RunContext, ToolOutput, UsageLimits
from pydantic_ai.models import Model

from loregraph.agents.assistant import CHARS_PER_TOKEN, SHARE_GAME_CONTEXT, build_model, llm_config
from loregraph.apimodel import ApiModel
from loregraph.errors import BadRequest
from loregraph.forms.schema import Campo, Formulario
from loregraph.models import EntidadPropuesta, PropuestaEntrada, PropuestaResumen
from loregraph.services.kernel import CampaignHandle, Kernel

#: Campos que el generador nunca rellena (imágenes, historial, mapas…). Las IRIs externas tampoco.
SKIP_FIELDS = {"rpg:hasDepiction", "rpg:hasHistory", "rpg:hasMarker", "rpg:mapImage", "rpg:inspiredBy",
               "rpg:correspondsTo", "rpg:variantOf"}
MAX_DEPTH = 2
BACKSTORY = "rpg:backstory"
LABEL = "rdfs:label"
#: Si hay más candidatos que esto, la referencia es texto libre (validado después) en vez de un enum.
MAX_ENUM_REFS = 120
MAX_CANDIDATES_PER_FIELD = 40
_DATE = r"^-?\d{4}-\d{2}-\d{2}$"


class GeneracionEntrada(ApiModel):
    clase: str = Field(description="Clase de las entidades a generar (p. ej. 'rpg:NonPlayerCharacter').")
    variantes: list[str] = Field(default_factory=list, description="Clases variante (p. ej. un clan, una raza).")
    peticion: str = Field(default="", max_length=4000, description="Qué quieres: concepto, tono, relaciones…")
    cantidad: int = Field(default=1, ge=1, le=5)
    historia: bool = Field(default=True, description="Escribir una historia propia (rpg:backstory).")


class EntidadGenerada(ApiModel):
    nombre: str
    valores: dict[str, list[Any]]


class ResultadoGeneracion(ApiModel):
    propuesta: PropuestaResumen
    entidades: list[EntidadGenerada]
    modelo: str
    reintentos: int = Field(description="Veces que hubo que corregir la salida del modelo.")


@dataclass
class _Slot:
    """Correspondencia entre un campo del esquema de salida y el campo del formulario."""

    campo: Campo
    alias: str
    enum_map: dict[str, Any] = field(default_factory=dict)
    sub: list[_Slot] | None = None  # campos de un objeto anidado (relación cualificada, disciplina…)


@dataclass
class OutputSpec:
    model: type[BaseModel]
    slots: list[_Slot]
    candidatos: dict[str, list[tuple[str, str]]]  # lista → [(id, nombre)]


def _alias(campo: Campo, used: set[str]) -> str:
    base = re.sub(r"\W+", "_", campo.id.split(":")[-1]).strip("_") or "campo"
    name = base if base not in used else re.sub(r"\W+", "_", campo.id).strip("_")
    i = 2
    while name in used:
        name = f"{base}_{i}"
        i += 1
    used.add(name)
    return name


def _describe(campo: Campo) -> str:
    parts = [campo.etiqueta]
    if campo.ayuda:
        parts.append(campo.ayuda)
    r = campo.restricciones
    lo = r.minInclusive if r.minInclusive is not None else r.minExclusive
    hi = r.maxInclusive if r.maxInclusive is not None else r.maxExclusive
    if lo is not None or hi is not None:
        parts.append(f"rango {lo if lo is not None else '…'}–{hi if hi is not None else '…'}")
    return ". ".join(parts)


class _SpecBuilder:
    """Traduce campos del formulario SHACL a campos Pydantic (recursivo para objetos anidados)."""

    def __init__(self, kernel: Kernel, camp: CampaignHandle, lang: str, historia: bool) -> None:
        self.k, self.camp, self.lang, self.historia = kernel, camp, lang, historia
        self.candidatos: dict[str, list[tuple[str, str]]] = {}
        self._n = 0

    def model(self, name: str, campos: list[Campo], doc: str | None, skip: str | None = None,
              depth: int = 0) -> tuple[type[BaseModel] | None, list[_Slot]]:
        used: set[str] = set()
        slots: list[_Slot] = []
        fields: dict[str, Any] = {}
        for i, campo in enumerate(campos):
            if campo.oculto or campo.tipo == "iri" or campo.id in SKIP_FIELDS or campo.id == skip:
                continue
            if campo.id == BACKSTORY and (not self.historia or depth):
                continue
            built = self._field(campo, used, depth)
            if built is None:
                continue
            fields[f"c{i}"], slot = built
            slots.append(slot)
        if not fields:
            return None, []
        self._n += 1
        m = create_model(f"{name}{self._n if depth else ''}", __config__=ConfigDict(populate_by_name=True, extra="ignore"),
                         **fields)  # type: ignore[call-overload]
        m.__doc__ = doc
        return m, slots

    def _field(self, campo: Campo, used: set[str], depth: int) -> tuple[tuple[Any, Any], _Slot] | None:
        alias = _alias(campo, used)
        desc = _describe(campo)
        enum_map: dict[str, Any] = {}
        sub: list[_Slot] | None = None
        constraints: dict[str, Any] = {}
        r = campo.restricciones
        t = campo.tipo
        py: Any
        if t in ("texto", "textoLargo", "textoMultilingue"):
            py = str
            if r.maxLength:
                constraints["max_length"] = r.maxLength
            if campo.id == BACKSTORY:
                constraints["min_length"] = 150
                desc += ". Historia propia de 2 a 4 párrafos" if self.lang == "es" else ". Own backstory, 2-4 paragraphs"
        elif t in ("entero", "decimal"):
            py = int if t == "entero" else float
            for src, dst in (("minInclusive", "ge"), ("maxInclusive", "le"), ("minExclusive", "gt"), ("maxExclusive", "lt")):
                v = getattr(r, src)
                if v is not None:
                    constraints[dst] = int(v) if t == "entero" and float(v).is_integer() else v
        elif t == "booleano":
            py = bool
        elif t in ("fecha", "fechaHora"):
            py = str
            if t == "fecha":
                constraints["pattern"] = _DATE
        elif t == "enum":
            opts = campo.valores or []
            labels = [o.etiqueta for o in opts]
            use_labels = len(set(labels)) == len(labels)
            for o in opts:
                key = o.etiqueta if use_labels else str(o.clave if o.clave is not None else o.valor)
                enum_map[key] = o.clave if o.clave is not None else o.valor
            if not enum_map:
                return None
            py = Literal[tuple(enum_map)]  # type: ignore[valid-type]
        elif t == "referencia":
            cands: dict[str, str] = {}
            for clave in [c.clave for c in campo.clases] if campo.clases else [None]:
                lst = self.k.entities.list(self.camp, clave, None, "nombre", MAX_CANDIDATES_PER_FIELD, 0, self.lang)
                cands.update({e.id: e.etiqueta for e in lst.elementos})
            if not cands:
                return None  # nada a lo que apuntar: el campo se omite
            key = alias if alias not in self.candidatos else f"{alias}_{len(self.candidatos)}"
            self.candidatos[key] = list(cands.items())
            py = Literal[tuple(cands)] if len(cands) <= MAX_ENUM_REFS else str  # type: ignore[valid-type]
            desc += (f". Id de una entidad existente (lista [{key}])" if self.lang == "es"
                     else f". Id of an existing entity (list [{key}])")
        elif t == "objeto" and campo.subformulario is not None and depth < MAX_DEPTH:
            py, sub = self.model(alias[:1].upper() + alias[1:], campo.subformulario.campos, desc,
                                 campo.enlaceInverso, depth + 1)
            if py is None:
                return None
        else:
            return None
        multiple = campo.cardinalidad.max != 1
        required = campo.cardinalidad.min > 0 or campo.id == LABEL or campo.id == BACKSTORY
        if multiple:
            item: Any = Annotated[py, Field(**constraints)] if constraints else py
            f = Field(default_factory=list, alias=alias, description=desc,
                      min_length=campo.cardinalidad.min or (1 if required else None), max_length=campo.cardinalidad.max)
            ann: Any = list[item]  # type: ignore[valid-type]
        elif required:
            ann = py
            f = Field(alias=alias, description=desc, **constraints)
        else:
            ann = py | None
            f = Field(default=None, alias=alias, description=desc, **constraints)
        return (ann, f), _Slot(campo=campo, alias=alias, enum_map=enum_map, sub=sub)


def build_output_spec(kernel: Kernel, camp: CampaignHandle, form: Formulario, lang: str, cantidad: int,
                      historia: bool) -> OutputSpec:
    """Modelo Pydantic dinámico con las restricciones del formulario SHACL."""
    b = _SpecBuilder(kernel, camp, lang, historia)
    item, slots = b.model("Ficha", form.campos, form.descripcion or form.etiqueta)
    if item is None or not any(s.campo.id == LABEL for s in slots):
        raise BadRequest("La clase no tiene campo de nombre (rdfs:label): no se puede generar")
    model = create_model(
        "Fichas", __config__=ConfigDict(extra="ignore"),
        fichas=(list[item], Field(min_length=cantidad, max_length=cantidad,  # type: ignore[valid-type]
                                  description=f"Exactamente {cantidad} ficha(s) nueva(s)")),
    )
    return OutputSpec(model=model, slots=slots, candidatos=b.candidatos)


def _values(slots: list[_Slot], data: dict[str, Any]) -> dict[str, list[Any]]:
    out: dict[str, list[Any]] = {}
    for s in slots:
        v = data.get(s.alias)
        vals = v if isinstance(v, list) else ([] if v is None or v == "" else [v])
        if s.sub is not None:
            vals = [{"valores": nested} for x in vals if isinstance(x, dict) and (nested := _values(s.sub, x))]
        if s.enum_map:
            vals = [s.enum_map.get(x, x) for x in vals]
        vals = [x.strip() if isinstance(x, str) else x for x in vals]
        vals = [x for x in vals if x != ""]
        if vals:
            out[s.campo.id] = vals
    return out


def to_values(spec: OutputSpec, ficha: BaseModel) -> dict[str, list[Any]]:
    return _values(spec.slots, ficha.model_dump(by_alias=True))


INSTRUCTIONS = """\
Eres el generador de contenido de la campaña de rol «{nombre}». Crea {cantidad} {clase} nuevo(s) según la petición.
Reglas:
- Responde SIEMPRE con la estructura pedida. Escribe los textos en {idioma}.
- Respeta el sistema de juego: solo valores permitidos y dentro de los rangos del esquema. Las estadísticas deben \
encajar con el concepto (un erudito tendrá Inteligencia alta; un matón, Fuerza), sin valores máximos por defecto.
- En los campos de referencia usa SOLO ids de la lista de entidades existentes. Deja vacío lo que no encaje.
- Nombres nuevos y distintos de los existentes. No uses personajes reales ni obras con derechos de autor.
{regla_historia}
Clase: {clase} — {descripcion_clase}

{contexto_juego}

Entidades existentes que puedes referenciar (id: nombre):
{candidatos}

Ya existen (no repitas estos nombres): {existentes}"""


def _instructions(kernel: Kernel, camp: CampaignHandle, form: Formulario, spec: OutputSpec, entrada: GeneracionEntrada,
                  lang: str, context_tokens: int) -> str:
    total = int(context_tokens * CHARS_PER_TOKEN)
    juego = kernel.llm_context.build(camp, lang, max(800, int(total * SHARE_GAME_CONTEXT))).texto.strip()
    cand_lines = []
    for alias, items in spec.candidatos.items():
        cand_lines.append(f"[{alias}] " + "; ".join(f"{i}: {n}" for i, n in items[:MAX_CANDIDATES_PER_FIELD]))
    existing = kernel.entities.list(camp, form.clase, None, "reciente", 40, 0, lang).elementos
    historia = (("- Escribe una historia propia en «backstory»: coherente con el lore de la campaña, su ubicación, "
                 "facción y estadísticas; cita entidades existentes por su nombre.")
                if entrada.historia else "")
    return INSTRUCTIONS.format(
        nombre=camp.nombre, cantidad=entrada.cantidad, clase=form.etiqueta,
        idioma="español" if lang == "es" else "English", regla_historia=historia,
        descripcion_clase=form.descripcion or "", contexto_juego=juego,
        candidatos="\n".join(cand_lines) or "(ninguna)",
        existentes=", ".join(e.etiqueta for e in existing) or "(ninguna)",
    )


def generate(kernel: Kernel, camp: CampaignHandle, entrada: GeneracionEntrada, lang: str = "es",
             model: Model | None = None) -> ResultadoGeneracion:
    settings = kernel.settings
    cfg = llm_config(kernel, camp)
    form = kernel.entities.form(camp, [entrada.clase, *entrada.variantes], lang)
    spec = build_output_spec(kernel, camp, form, lang, entrada.cantidad, entrada.historia)
    agent_name = f"generador:{cfg.modelo}"
    clases = [c.clave for c in form.clases]
    peticion = entrada.peticion.strip() or (
        f"Genera {entrada.cantidad} {form.etiqueta}" if lang == "es" else f"Generate {entrada.cantidad} {form.etiqueta}")
    existing_names = {e.etiqueta.casefold() for e in
                      kernel.entities.list(camp, form.clase, None, "nombre", 500, 0, lang).elementos}
    state: dict[str, Any] = {"retries": 0}

    def proposal(out: BaseModel) -> PropuestaEntrada:
        ents = [EntidadPropuesta(ref=f"nuevo:{i}", clases=clases, valores=to_values(spec, f))
                for i, f in enumerate(out.fichas, 1)]  # type: ignore[attr-defined]
        return PropuestaEntrada(agente=agent_name, peticion=peticion, entidades=ents,
                                resumen=", ".join(str(e.valores.get(LABEL, ["?"])[0]) for e in ents))

    mode = settings.llm_output_mode
    output_type: Any = (NativeOutput(spec.model) if mode == "native" else
                        PromptedOutput(spec.model) if mode == "prompted" else ToolOutput(spec.model, name="entregar_fichas"))
    agent: Agent[None, Any] = Agent(
        model or build_model(settings, cfg.modelo),
        output_type=output_type,
        instructions=_instructions(kernel, camp, form, spec, entrada, lang, cfg.contexto_tokens),
        retries=settings.llm_max_retries,
        model_settings={"timeout": settings.llm_timeout_s},
        name="generador-loregraph",
    )

    @agent.output_validator
    def validar(ctx: RunContext[None], out: Any) -> Any:  # noqa: ARG001
        problems: list[str] = []
        names = [str(to_values(spec, f).get(LABEL, [""])[0]).casefold() for f in out.fichas]
        dup = sorted({n for n in names if n in existing_names or names.count(n) > 1})
        if dup:
            problems.append(f"Nombres repetidos o ya existentes: {', '.join(dup)}. Usa nombres nuevos.")
        if not problems:
            errores = kernel.proposals.check(camp, proposal(out), lang)
            problems = [f"{e.campo or ''}: {e.mensaje}" + (f" (valor: {e.valor})" if e.valor else "") for e in errores]
        if problems:
            state["retries"] += 1
            raise ModelRetry("La ficha no es válida para el sistema de juego. Corrige: "
                             + json.dumps(problems, ensure_ascii=False))
        return out

    result = agent.run_sync(peticion, usage_limits=UsageLimits(request_limit=4 + settings.llm_max_retries * 2))
    entrada_prop = proposal(result.output)
    res = kernel.proposals.create(camp, entrada_prop, "agente", lang)
    if not res.ok or res.propuesta is None:  # no debería pasar: ya se comprobó
        raise BadRequest("La propuesta generada no es válida: " + "; ".join(e.mensaje for e in res.errores))
    return ResultadoGeneracion(
        propuesta=res.propuesta,
        entidades=[EntidadGenerada(nombre=str(e.valores.get(LABEL, ["?"])[0]), valores=e.valores)
                   for e in entrada_prop.entidades],
        modelo=cfg.modelo, reintentos=state["retries"],
    )
