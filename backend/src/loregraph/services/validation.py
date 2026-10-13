"""Validación SHACL (pySHACL) con mensajes legibles en español e inglés."""

from __future__ import annotations

from collections.abc import Iterable

from pyshacl import validate
from rdflib import Graph, Literal, URIRef
from rdflib.namespace import SH
from rdflib.term import Node

from loregraph.models import ErrorValidacion
from loregraph.ontology.context import OntologyContext, pick_lang
from loregraph.store.iris import Iris
from loregraph.store.terms import OxTerm, triples_to_rdflib

_MESSAGES: dict[str, dict[str, str]] = {
    "MinCount": {"es": "Campo obligatorio", "en": "Required field"},
    "MinCountN": {"es": "Se necesitan al menos {n} valores", "en": "At least {n} values are required"},
    "MaxCount": {"es": "Admite como máximo {n} valor(es)", "en": "Accepts at most {n} value(s)"},
    "Datatype": {"es": "Tipo de dato incorrecto (se esperaba {dt})", "en": "Wrong datatype (expected {dt})"},
    "Class": {"es": "Debe ser: {cls}", "en": "Must be: {cls}"},
    "NodeKind": {"es": "Debe ser una IRI", "en": "Must be an IRI"},
    "MinInclusive": {"es": "Debe ser mayor o igual que {v}", "en": "Must be greater than or equal to {v}"},
    "MaxInclusive": {"es": "Debe ser menor o igual que {v}", "en": "Must be less than or equal to {v}"},
    "MinExclusive": {"es": "Debe ser mayor que {v}", "en": "Must be greater than {v}"},
    "MaxExclusive": {"es": "Debe ser menor que {v}", "en": "Must be less than {v}"},
    "MinLength": {"es": "Debe tener al menos {v} caracteres", "en": "Must have at least {v} characters"},
    "MaxLength": {"es": "Debe tener como máximo {v} caracteres", "en": "Must have at most {v} characters"},
    "Pattern": {"es": "Formato no válido", "en": "Invalid format"},
    "In": {"es": "Valor no permitido", "en": "Value not allowed"},
    "Node": {"es": "El valor anidado no es válido", "en": "The nested value is invalid"},
    "Generic": {"es": "Valor no válido", "en": "Invalid value"},
}


def _msg(key: str, lang: str, **kw: object) -> str:
    texts = _MESSAGES[key]
    return texts.get(lang, texts["en"]).format(**kw)


class ShaclValidator:
    """Valida un subgrafo contra las formas del contexto ontológico."""

    def __init__(self, ctx: OntologyContext, iris: Iris) -> None:
        self.ctx = ctx
        self.iris = iris

    def validate(
        self,
        triples: Iterable[tuple[OxTerm, OxTerm, OxTerm]],
        focus: list[str] | None = None,
        lang: str = "es",
        graph: Graph | None = None,
    ) -> list[ErrorValidacion]:
        data = triples_to_rdflib(list(triples), graph)
        # Sin focus_nodes: con ellos pySHACL no evalúa sh:or/sh:node contra los valores
        # y algunas restricciones pasaban en falso. El grafo ya es un subgrafo pequeño;
        # después se filtran los resultados a los nodos foco y sus nodos anidados.
        conforms, results, _ = validate(
            data,
            shacl_graph=self.ctx.shapes,
            ont_graph=self.ctx.ont,
            inference="none",
            advanced=True,
            allow_warnings=True,
        )
        if conforms:
            return []
        return self._errors(results, lang, set(focus) if focus else None)

    # ------------------------------------------------------------------ errores
    def _errors(self, results: Graph, lang: str, focus_set: set[str] | None = None) -> list[ErrorValidacion]:
        out: list[ErrorValidacion] = []
        seen: set[tuple] = set()
        for r in results.subjects(predicate=SH.resultSeverity):
            focus = _one(results, r, SH.focusNode)
            if focus_set is not None:
                f = str(focus)
                if f not in focus_set and not any(f.startswith(x + "/n/") for x in focus_set):
                    continue
            path = _one(results, r, SH.resultPath)
            value = _one(results, r, SH.value)
            comp = _one(results, r, SH.sourceConstraintComponent)
            source = _one(results, r, SH.sourceShape)
            sev = _one(results, r, SH.resultSeverity)
            mensaje = self._message(results, r, comp, source, lang)
            focus_iri = str(focus) if isinstance(focus, URIRef) else None
            key = (focus_iri, str(path), mensaje, str(value))
            if key in seen:
                continue
            seen.add(key)
            out.append(
                ErrorValidacion(
                    foco=focus_iri,
                    focoId=self.iris.entity_id(focus_iri) if focus_iri else None,
                    campo=self.ctx.compact(str(path)) if isinstance(path, URIRef) else None,
                    mensaje=mensaje,
                    severidad="aviso" if sev == SH.Warning else "info" if sev == SH.Info else "violacion",
                    valor=str(value) if value is not None else None,
                )
            )
        return out

    def _message(self, results: Graph, r: Node, comp: Node | None, source: Node | None, lang: str) -> str:
        shapes = self.ctx.shapes
        # Mensaje declarado en la forma (sh:message), en el idioma pedido.
        if source is not None:
            custom = pick_lang(shapes.objects(source, SH.message), lang)
            if custom:
                return custom
        name = str(comp).rsplit("#", 1)[-1].replace("ConstraintComponent", "") if comp else "Generic"
        if name == "SPARQL":
            # Mensajes de restricciones SPARQL: del propio resultado o de la restricción.
            msgs = list(results.objects(r, SH.resultMessage))
            failed = _one(results, r, SH.sourceConstraint)
            if failed is not None:
                txt = pick_lang(shapes.objects(failed, SH.message), lang)
                if txt:
                    return txt
            return pick_lang(msgs, lang) or _msg("Generic", lang)

        def param(p: URIRef) -> Node | None:
            return _one(shapes, source, p) if source is not None else None

        if name == "MinCount":
            n = param(SH.minCount)
            if isinstance(n, Literal) and int(n.toPython()) > 1:
                return _msg("MinCountN", lang, n=n)
            return _msg("MinCount", lang)
        if name == "MaxCount":
            return _msg("MaxCount", lang, n=param(SH.maxCount))
        if name == "Datatype":
            dt = param(SH.datatype)
            return _msg("Datatype", lang, dt=self.ctx.compact(str(dt)) if dt is not None else "?")
        if name == "Class":
            cls = param(SH["class"])
            return _msg("Class", lang, cls=self.ctx.label(str(cls), lang) if cls is not None else "?")
        if name == "Or" and source is not None:
            alts = _one(shapes, source, SH["or"])
            if alts is not None:
                classes = [
                    self.ctx.label(str(c), lang)
                    for alt in self.ctx.list_items(alts)
                    for c in shapes.objects(alt, SH["class"])
                ]
                if classes:
                    sep = " o " if lang == "es" else " or "
                    return _msg("Class", lang, cls=sep.join(classes))
        mapping = {
            "MinInclusive": SH.minInclusive, "MaxInclusive": SH.maxInclusive,
            "MinExclusive": SH.minExclusive, "MaxExclusive": SH.maxExclusive,
            "MinLength": SH.minLength, "MaxLength": SH.maxLength,
        }
        if name in mapping:
            return _msg(name, lang, v=param(mapping[name]))
        if name in _MESSAGES:
            return _msg(name, lang)
        msgs = list(results.objects(r, SH.resultMessage))
        return pick_lang(msgs, lang) or _msg("Generic", lang)


def _one(g: Graph, s: Node | None, p: URIRef) -> Node | None:
    if s is None:
        return None
    return next(iter(g.objects(s, p)), None)
