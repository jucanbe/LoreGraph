"""Contexto de la campaña y sus módulos para modelos de lenguaje.

Combina lo que declara cada módulo en `context.yaml` (lore, glosario, reglas,
tono) con las estadísticas derivadas de las formas SHACL (rangos, valores
permitidos, clases a las que se aplican), y lo recorta a un presupuesto de
caracteres por orden de prioridad para que quepa en modelos de contexto pequeño.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from loregraph.apimodel import ApiModel
from loregraph.forms.builder import FormBuilder
from loregraph.forms.schema import Campo
from loregraph.modules.context import pick
from loregraph.services.campaign_settings import LoreCampana
from loregraph.services.kernel import CampaignHandle

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

#: Tipos de campo que se describen como «estadísticas».
STAT_TYPES = {"entero", "decimal", "enum", "booleano"}
MAX_ENUM_VALUES = 12


class EstadisticaLLM(ApiModel):
    clave: str
    nombre: str
    tipo: str
    rango: str | None = None
    valores: list[str] = []
    aplicaA: list[str] = []
    explicacion: str | None = None
    escala: str | None = None
    explicada: bool = False  # el módulo la explica en context.yaml (más prioridad al recortar)


class TerminoLLM(ApiModel):
    termino: str
    definicion: str
    clave: str | None = None


class ModuloContextoLLM(ApiModel):
    id: str
    nombre: str
    resumen: str
    estadisticas: list[EstadisticaLLM]
    reglas: list[str]
    glosario: list[TerminoLLM]
    tono: str | None = None
    evitar: list[str] = []


class ContextoLLM(ApiModel):
    """Contexto estructurado y su versión en texto (lista para un prompt)."""

    campana: str
    descripcion: str
    lore: LoreCampana
    modulos: list[ModuloContextoLLM]
    texto: str
    recortado: bool = False


class LLMContextService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    # ------------------------------------------------------------ estadísticas
    def _stats(self, camp: CampaignHandle, module_id: str, lang: str) -> list[EstadisticaLLM]:
        ctx = camp.ctx
        builder = FormBuilder(ctx, lang)
        classes: list[str] = list(ctx.main_classes)
        for m in ctx.main_classes:
            for v in ctx.variants_for(m):
                if v not in classes:
                    classes.append(v)
        found: dict[str, tuple[Campo, list[str]]] = {}

        def visit(campos: list[Campo], cls_label: str) -> None:
            for c in campos:
                if c.oculto:
                    continue
                if c.subformulario is not None:
                    visit(c.subformulario.campos, c.subformulario.etiqueta or cls_label)
                if c.modulo != module_id or c.tipo not in STAT_TYPES:
                    continue
                prev = found.get(c.id)
                if prev is None:
                    found[c.id] = (c, [cls_label])
                elif cls_label not in prev[1]:
                    prev[1].append(cls_label)

        for cls in classes:
            # Solo clases de este módulo o del núcleo (las extensiones de un módulo
            # sobre clases del núcleo también cuentan).
            if ctx.module_of(cls) not in (module_id, "core"):
                continue
            form = builder.build([cls])
            visit(form.campos, ctx.label(cls, lang))

        mod = self.k.registry.get(module_id)
        notes = {n.clave: n for n in mod.context.estadisticas}
        out: list[EstadisticaLLM] = []
        for c, aplica in found.values():
            r = c.restricciones
            rango = None
            if r.minInclusive is not None or r.maxInclusive is not None:
                lo = _num(r.minInclusive)
                hi = _num(r.maxInclusive)
                rango = f"{lo if lo is not None else '…'}–{hi if hi is not None else '…'}"
            valores = [v.etiqueta for v in (c.valores or [])][:MAX_ENUM_VALUES]
            note = notes.get(c.id)
            out.append(EstadisticaLLM(
                clave=c.id, nombre=c.etiqueta, tipo=c.tipo, rango=rango, valores=valores, aplicaA=aplica,
                explicacion=pick(note.explicacion, lang) if note else (c.ayuda or None),
                escala=pick(note.escala, lang) if note and note.escala else None,
                explicada=note is not None,
            ))
        # Notas del YAML sobre propiedades que no salen como campo de formulario.
        for clave, note in notes.items():
            if clave not in found:
                out.append(EstadisticaLLM(clave=clave, nombre=ctx.label(ctx.expand(clave), lang) if ":" in clave else clave,
                                          tipo="nota", explicacion=pick(note.explicacion, lang),
                                          escala=pick(note.escala, lang) if note.escala else None, explicada=True))
        out.sort(key=lambda s: not s.explicada)
        return out

    # ----------------------------------------------------------------- montaje
    def build(self, camp: CampaignHandle, lang: str = "es", max_chars: int | None = None) -> ContextoLLM:
        modulos: list[ModuloContextoLLM] = []
        for mod in camp.ctx.modules:
            c = mod.context
            stats = self._stats(camp, mod.id, lang) if mod.id != "core" else []
            if not (pick(c.resumen, lang) or stats or c.reglas or c.glosario):
                continue
            modulos.append(ModuloContextoLLM(
                id=mod.id,
                nombre=pick(mod.manifest.nombre, lang),
                resumen=pick(c.resumen, lang).strip(),
                estadisticas=stats,
                reglas=[pick(r, lang).strip() for r in c.reglas],
                glosario=[TerminoLLM(termino=g.termino, definicion=pick(g.definicion, lang).strip(), clave=g.clave)
                          for g in c.glosario],
                tono=pick(c.tono, lang).strip() or None,
                evitar=[pick(e, lang).strip() for e in c.evitar],
            ))
        lore = self.k.campaign_settings.get(camp).lore
        texto, recortado = render(camp.nombre, camp.descripcion, modulos, lang, max_chars, lore)
        return ContextoLLM(campana=camp.nombre, descripcion=camp.descripcion, lore=lore, modulos=modulos,
                           texto=texto, recortado=recortado)


def _num(v: float | None) -> int | float | None:
    if v is None:
        return None
    return int(v) if float(v).is_integer() else v


# ------------------------------------------------------------------- texto
_T = {
    "es": {"campana": "Campaña", "sistema": "Sistema", "stats": "Estadísticas", "reglas": "Reglas clave",
           "glosario": "Glosario", "tono": "Tono", "evitar": "Evita", "aplica": "en", "valores": "valores",
           "lore": "Lore de la campaña", "casa": "Reglas de la casa", "notas": "Notas",
           "recorte": "(contexto recortado para ajustarse al modelo)"},
    "en": {"campana": "Campaign", "sistema": "System", "stats": "Statistics", "reglas": "Key rules",
           "glosario": "Glossary", "tono": "Tone", "evitar": "Avoid", "aplica": "on", "valores": "values",
           "lore": "Campaign lore", "casa": "House rules", "notas": "Notes",
           "recorte": "(context trimmed to fit the model)"},
}


def _stat_line(s: EstadisticaLLM, t: dict[str, str]) -> str:
    parts = [f"- {s.nombre} (`{s.clave}`"]
    if s.rango:
        parts.append(f", {s.rango}")
    if s.valores:
        parts.append(f", {t['valores']}: {', '.join(s.valores)}")
    parts.append(")")
    line = "".join(parts)
    if s.aplicaA:
        line += f" {t['aplica']} {', '.join(s.aplicaA[:3])}"
    if s.explicacion:
        line += f": {s.explicacion}"
    if s.escala:
        line += f" [{s.escala}]"
    return line


def render(nombre: str, descripcion: str, modulos: list[ModuloContextoLLM], lang: str,
           max_chars: int | None, lore: LoreCampana | None = None) -> tuple[str, bool]:
    """Texto en Markdown compacto. Si no cabe, se descartan secciones de menos a
    más importante (niveles 6 → 0):

    6. todo · 5. sin glosario · 4. sin estadísticas no explicadas por el módulo ·
    3. sin tono ni «evita» · 2. sin escalas · 1. sin reglas · 0. solo resúmenes.

    El lore propio de la campaña sigue la misma prioridad: su resumen se mantiene
    siempre; las reglas de la casa, al nivel de las reglas; tono y «evita», al del
    tono; y las notas, al de las estadísticas no explicadas."""
    t = _T.get(lang, _T["es"])
    lore = lore or LoreCampana()

    def head_text(level: int) -> str:
        out = [f"# {t['campana']}: {nombre}"]
        if descripcion.strip():
            out.append(descripcion.strip())
        partes = []
        if lore.resumen.strip():
            partes.append(lore.resumen.strip())
        reglas = [r.strip() for r in lore.reglasCasa if r.strip()]
        evitar = [e.strip() for e in lore.evitar if e.strip()]
        if level >= 2 and reglas:
            partes.append(f"\n### {t['casa']}\n" + "\n".join(f"- {r}" for r in reglas))
        if level >= 4 and lore.tono.strip():
            partes.append(f"\n### {t['tono']}\n{lore.tono.strip()}")
        if level >= 4 and evitar:
            partes.append(f"\n### {t['evitar']}\n" + "\n".join(f"- {e}" for e in evitar))
        if level >= 5 and lore.notas.strip():
            partes.append(f"\n### {t['notas']}\n{lore.notas.strip()}")
        if partes:
            out.append(f"\n## {t['lore']}\n" + "\n".join(partes))
        return "\n".join(out) + "\n"

    def module_text(m: ModuloContextoLLM, level: int) -> str:
        out = [f"\n## {t['sistema']}: {m.nombre}"]
        if m.resumen:
            out.append(m.resumen)
        stats = m.estadisticas if level >= 5 else [s for s in m.estadisticas if s.explicada]
        if level < 3:
            stats = [s.model_copy(update={"escala": None}) for s in stats]
        if level >= 1 and stats:
            out.append(f"\n### {t['stats']}")
            out.extend(_stat_line(s, t) for s in stats)
        if level >= 2 and m.reglas:
            out.append(f"\n### {t['reglas']}")
            out.extend(f"- {r}" for r in m.reglas)
        if level >= 4 and (m.tono or m.evitar):
            if m.tono:
                out.append(f"\n### {t['tono']}\n{m.tono}")
            if m.evitar:
                out.append(f"\n### {t['evitar']}")
                out.extend(f"- {e}" for e in m.evitar)
        if level >= 6 and m.glosario:
            out.append(f"\n### {t['glosario']}")
            out.extend(f"- **{g.termino}**: {g.definicion}" for g in m.glosario)
        return "\n".join(out)

    for level in (6, 5, 4, 3, 2, 1, 0):
        text = head_text(level) + "\n".join(module_text(m, level) for m in modulos)
        if max_chars is None or len(text) <= max_chars:
            return text.strip() + "\n", level < 6
    text = (head_text(0) + "\n".join(module_text(m, 0) for m in modulos))[: max(0, (max_chars or 0) - 60)]
    return text.rstrip() + f"\n{t['recorte']}\n", True

