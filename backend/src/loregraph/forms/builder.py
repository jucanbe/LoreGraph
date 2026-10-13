"""Traducción de formas SHACL a esquemas de formulario."""

from __future__ import annotations

from rdflib import Literal, URIRef
from rdflib.namespace import RDF, SH, XSD
from rdflib.term import Node

from loregraph.forms.schema import (
    Campo,
    Cardinalidad,
    ClaseRef,
    Formulario,
    Grupo,
    OpcionValor,
    Restricciones,
    TipoCampo,
)
from loregraph.namespaces import DASH, RPG
from loregraph.ontology.context import OntologyContext, local_name, pick_lang

DATATYPE_TIPOS: dict[str, TipoCampo] = {
    str(XSD.string): "texto",
    str(RDF.langString): "textoMultilingue",
    str(XSD.integer): "entero",
    str(XSD.int): "entero",
    str(XSD.long): "entero",
    str(XSD.nonNegativeInteger): "entero",
    str(XSD.positiveInteger): "entero",
    str(XSD.decimal): "decimal",
    str(XSD.double): "decimal",
    str(XSD.float): "decimal",
    str(XSD.boolean): "booleano",
    str(XSD.date): "fecha",
    str(XSD.dateTime): "fechaHora",
    str(XSD.anyURI): "iri",
}

WIDGETS = {
    str(DASH.TextAreaEditor): "textoLargo",
    str(DASH.URIEditor): "uri",
    str(DASH.DetailsEditor): "detalles",
    str(RPG.DotsEditor): "puntos",
}


class FormBuilder:
    """Construye :class:`Formulario` a partir de las formas de un :class:`OntologyContext`."""

    def __init__(self, ctx: OntologyContext, lang: str = "es") -> None:
        self.ctx = ctx
        self.g = ctx.shapes
        self.lang = lang

    # ------------------------------------------------------------------ API
    def build(self, classes: list[str]) -> Formulario:
        """Formulario para una clase principal y, opcionalmente, variantes adicionales."""
        if not classes:
            raise ValueError("Se necesita al menos una clase")
        main = classes[0]
        node_shapes = self._node_shapes_for(classes)
        campos: dict[str, Campo] = {}
        for shape in node_shapes:
            module = self._shape_module(shape)
            for ps in self.g.objects(shape, SH.property):
                campo = self._property(ps, module)
                if campo is None:
                    continue
                if campo.ruta in campos:
                    campos[campo.ruta] = _merge(campos[campo.ruta], campo)
                else:
                    campos[campo.ruta] = campo
        grupos = self._groups(campos.values())
        group_order = {g.id: g.orden for g in grupos}
        ordered = sorted(
            campos.values(), key=lambda c: (group_order.get(c.grupo or "", 1e9), c.orden, c.etiqueta)
        )
        return Formulario(
            clase=self.ctx.compact(main),
            clases=[self._class_ref(c) for c in classes],
            etiqueta=" · ".join(self.ctx.label(c, self.lang) for c in classes),
            descripcion=self.ctx.comment(main, self.lang),
            grupos=grupos,
            campos=ordered,
            variantes=[self._class_ref(v) for v in self.ctx.variants_for(main)],
        )

    def fields_by_path(self, classes: list[str]) -> dict[str, Campo]:
        return {c.ruta: c for c in self.build(classes).campos}

    # ------------------------------------------------------------- internos
    def _node_shapes_for(self, classes: list[str]) -> list[Node]:
        ordered_classes: list[str] = []
        for c in classes:
            for sup in self.ctx.superclasses(c):
                if sup not in ordered_classes:
                    ordered_classes.append(sup)
        shapes: list[Node] = []
        for c in ordered_classes:
            node = URIRef(c)
            for s in self.g.subjects(SH.targetClass, node):
                if s not in shapes:
                    shapes.append(s)
            if (node, RDF.type, SH.NodeShape) in self.g and node not in shapes:
                shapes.append(node)
        return shapes

    def _shape_module(self, shape: Node) -> str | None:
        if not isinstance(shape, URIRef):
            return None
        return self.ctx.shape_modules.get(str(shape)) or self.ctx.module_of(str(shape))

    def _class_ref(self, iri: str) -> ClaseRef:
        return ClaseRef(iri=iri, clave=self.ctx.compact(iri), etiqueta=self.ctx.label(iri, self.lang))

    def _one(self, s: Node, p: URIRef) -> Node | None:
        return next(iter(self.g.objects(s, p)), None)

    def _num(self, s: Node, p: URIRef) -> float | None:
        v = self._one(s, p)
        if isinstance(v, Literal):
            try:
                return float(v.toPython())
            except (TypeError, ValueError):
                return None
        return None

    def _int(self, s: Node, p: URIRef) -> int | None:
        v = self._num(s, p)
        return int(v) if v is not None else None

    def _property(self, ps: Node, module: str | None) -> Campo | None:
        path = self._one(ps, SH.path)
        if not isinstance(path, URIRef):
            return None  # rutas complejas: no se representan en formularios
        ruta = str(path)
        etiqueta = pick_lang(self.g.objects(ps, SH.name), self.lang) or self.ctx.label(ruta, self.lang)
        ayuda = pick_lang(self.g.objects(ps, SH.description), self.lang) or None
        editor = self._one(ps, DASH.editor)
        widget = WIDGETS.get(str(editor)) if editor is not None else None
        hidden = self._one(ps, DASH.hidden)
        datatype = self._one(ps, SH.datatype)
        node_kind = self._one(ps, SH.nodeKind)
        sh_class = self._one(ps, SH["class"])
        sh_in = self._one(ps, SH["in"])
        sh_node = self._one(ps, SH.node)
        scheme = self._one(ps, RPG.conceptScheme)
        sh_or = self._one(ps, SH["or"])
        group = self._one(ps, SH.group)

        classes: list[str] = []
        if isinstance(sh_class, URIRef):
            classes.append(str(sh_class))
        if sh_or is not None:
            for alt in self.ctx.list_items(sh_or):
                c = self._one(alt, SH["class"])
                if isinstance(c, URIRef):
                    classes.append(str(c))

        valores: list[OpcionValor] | None = None
        subform = None
        tipo: TipoCampo
        if sh_in is not None:
            tipo = "enum"
            valores = [self._option(v) for v in self.ctx.list_items(sh_in)]
        elif scheme is not None:
            tipo = "enum"
            valores = [
                OpcionValor(valor=iri, clave=self.ctx.compact(iri), etiqueta=label,
                            descripcion=self.ctx.comment(iri, self.lang))
                for iri, label in self.ctx.concepts(str(scheme), self.lang)
            ]
        elif widget == "detalles" and (sh_node is not None or classes):
            tipo = "objeto"
            subform = self._subform(sh_node, classes, module)
        elif classes:
            tipo = "referencia"
        elif isinstance(datatype, URIRef):
            tipo = DATATYPE_TIPOS.get(str(datatype), "texto")
        elif node_kind == SH.IRI:
            tipo = "iri"
        else:
            tipo = "texto"
        if tipo == "texto" and widget == "textoLargo":
            tipo = "textoLargo"

        default = self._one(ps, SH.defaultValue)
        backlink = self._one(ps, RPG.backlink)
        pattern = self._one(ps, SH.pattern)
        return Campo(
            id=self.ctx.compact(ruta),
            ruta=ruta,
            etiqueta=etiqueta,
            ayuda=ayuda,
            tipo=tipo,
            datatype=str(datatype) if isinstance(datatype, URIRef) else None,
            cardinalidad=Cardinalidad(
                min=self._int(ps, SH.minCount) or 0, max=self._int(ps, SH.maxCount)
            ),
            restricciones=Restricciones(
                minInclusive=self._num(ps, SH.minInclusive),
                maxInclusive=self._num(ps, SH.maxInclusive),
                minExclusive=self._num(ps, SH.minExclusive),
                maxExclusive=self._num(ps, SH.maxExclusive),
                minLength=self._int(ps, SH.minLength),
                maxLength=self._int(ps, SH.maxLength),
                pattern=str(pattern) if pattern is not None else None,
            ),
            grupo=self.ctx.compact(str(group)) if isinstance(group, URIRef) else None,
            orden=self._num(ps, SH.order) or 0,
            modulo=module,
            widget=widget if widget not in (None, "detalles", "textoLargo") else None,
            oculto=bool(isinstance(hidden, Literal) and hidden.toPython() is True),
            valores=valores,
            clases=[self._class_ref(c) for c in classes] if classes else None,
            clasesCreables=self._creatable(classes) if tipo == "referencia" else None,
            subformulario=subform,
            enlaceInverso=self.ctx.compact(str(backlink)) if isinstance(backlink, URIRef) else None,
            valorPorDefecto=default.toPython() if isinstance(default, Literal) else (
                self.ctx.compact(str(default)) if isinstance(default, URIRef) else None
            ),
        )

    def _creatable(self, classes: list[str]) -> list[ClaseRef]:
        """Clases principales de la campaña compatibles con las admitidas por el campo."""
        out = [
            m for m in self.ctx.main_classes
            if any(c in self.ctx.superclasses(m) for c in classes)
        ]
        return [self._class_ref(c) for c in out]

    def _option(self, v: Node) -> OpcionValor:
        if isinstance(v, URIRef):
            iri = str(v)
            return OpcionValor(valor=iri, clave=self.ctx.compact(iri), etiqueta=self.ctx.label(iri, self.lang),
                               descripcion=self.ctx.comment(iri, self.lang))
        if isinstance(v, Literal):
            py = v.toPython()
            if not isinstance(py, (str, int, float, bool)):
                py = str(v)
            return OpcionValor(valor=py, etiqueta=str(v))
        return OpcionValor(valor=str(v), etiqueta=str(v))

    def _subform(self, sh_node: Node | None, classes: list[str], module: str | None) -> Formulario:
        campos: list[Campo] = []
        shapes: list[Node] = []
        if sh_node is not None:
            shapes.append(sh_node)
        for c in classes:
            for s in self._node_shapes_for([c]):
                if s not in shapes:
                    shapes.append(s)
        seen: dict[str, Campo] = {}
        for shape in shapes:
            for ps in self.g.objects(shape, SH.property):
                campo = self._property(ps, self._shape_module(shape) or module)
                if campo is None:
                    continue
                seen[campo.ruta] = _merge(seen[campo.ruta], campo) if campo.ruta in seen else campo
        campos = sorted(seen.values(), key=lambda c: (c.orden, c.etiqueta))
        main = classes[0] if classes else (str(sh_node) if isinstance(sh_node, URIRef) else "")
        return Formulario(
            clase=self.ctx.compact(main) if main else "",
            clases=[self._class_ref(c) for c in classes],
            etiqueta=self.ctx.label(main, self.lang) if main else "",
            descripcion=self.ctx.comment(main, self.lang) if main else None,
            grupos=[],
            campos=campos,
        )

    def _groups(self, campos: object) -> list[Grupo]:
        ids = {c.grupo for c in campos if c.grupo}  # type: ignore[attr-defined]
        grupos = []
        for gid in ids:
            iri = self.ctx.expand(gid) if not gid.startswith("http") else gid
            node = URIRef(iri)
            label = pick_lang(self.g.objects(node, URIRef("http://www.w3.org/2000/01/rdf-schema#label")), self.lang)
            order = self._num(node, SH.order) or 0
            grupos.append(Grupo(id=gid, etiqueta=label or local_name(iri), orden=order))
        grupos.sort(key=lambda g: (g.orden, g.etiqueta))
        return grupos


def _merge(a: Campo, b: Campo) -> Campo:
    """Combina dos formas de la misma propiedad: gana la etiqueta de la más específica
    (``a``) y se aplican las restricciones más estrictas de ambas."""
    mx = [m for m in (a.cardinalidad.max, b.cardinalidad.max) if m is not None]
    ra, rb = a.restricciones, b.restricciones

    def tighter(x: float | None, y: float | None, lower: bool) -> float | None:
        vals = [v for v in (x, y) if v is not None]
        if not vals:
            return None
        return max(vals) if lower else min(vals)

    merged = a.model_copy(deep=True)
    merged.cardinalidad = Cardinalidad(min=max(a.cardinalidad.min, b.cardinalidad.min), max=min(mx) if mx else None)
    merged.restricciones = Restricciones(
        minInclusive=tighter(ra.minInclusive, rb.minInclusive, True),
        maxInclusive=tighter(ra.maxInclusive, rb.maxInclusive, False),
        minExclusive=tighter(ra.minExclusive, rb.minExclusive, True),
        maxExclusive=tighter(ra.maxExclusive, rb.maxExclusive, False),
        minLength=_opt_int(tighter(ra.minLength, rb.minLength, True)),
        maxLength=_opt_int(tighter(ra.maxLength, rb.maxLength, False)),
        pattern=ra.pattern or rb.pattern,
    )
    if merged.valores is None and b.valores is not None:
        merged.valores = b.valores
    if merged.clases is None and b.clases is not None:
        merged.clases = b.clases
    if merged.ayuda is None:
        merged.ayuda = b.ayuda
    return merged


def _opt_int(v: float | None) -> int | None:
    return int(v) if v is not None else None

