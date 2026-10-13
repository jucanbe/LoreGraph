"""Vista en memoria (rdflib) de la ontología, vocabularios y formas de un conjunto de módulos.

Cada campaña usa un conjunto de módulos; para cada conjunto se construye (y se
cachea) un :class:`OntologyContext` con las consultas de esquema que necesitan
la API, los formularios y la validación.
"""

from __future__ import annotations

from collections.abc import Iterable
from functools import cached_property

from rdflib import Graph, Literal, URIRef
from rdflib.collection import Collection
from rdflib.namespace import OWL, RDF, RDFS, SH, SKOS

from loregraph.modules.manifest import EstiloRelacion, EstiloTipo, Manifest, Tema
from loregraph.modules.registry import Module
from loregraph.namespaces import BASE_PREFIXES, RPG

LABEL_PROPS = (SKOS.prefLabel, RDFS.label, SH.name)


def pick_lang(values: Iterable[Literal], lang: str) -> str | None:
    """Elige el literal en el idioma pedido, luego en/es, luego sin idioma, luego cualquiera."""
    vals = [v for v in values if isinstance(v, Literal)]
    if not vals:
        return None
    for pref in (lang, "en" if lang != "en" else "es", None):
        for v in vals:
            if (v.language or None) == pref:
                return str(v)
    return str(vals[0])


def local_name(iri: str) -> str:
    for sep in ("#", "/"):
        if sep in iri:
            tail = iri.rsplit(sep, 1)[1]
            if tail:
                return tail
    return iri


class OntologyContext:
    """Ontología + vocabularios + formas de los módulos activos."""

    def __init__(self, modules: list[Module]) -> None:
        self.modules = modules
        self.ont = Graph()
        self.shapes = Graph()
        #: Forma (IRI) → módulo que la declara (las formas usan su propio espacio de nombres).
        self.shape_modules: dict[str, str] = {}
        for m in modules:
            if m.ontology:
                self.ont.parse(data=m.ontology, format="turtle")
            for v in m.vocabulary:
                self.ont.parse(data=v, format="turtle")
            if m.shapes:
                g = Graph().parse(data=m.shapes, format="turtle")
                for s in set(g.subjects()):
                    if isinstance(s, URIRef):
                        self.shape_modules.setdefault(str(s), m.id)
                self.shapes += g
        self.prefixes: dict[str, str] = dict(BASE_PREFIXES)
        for m in modules:
            self.prefixes[m.manifest.prefijo] = m.manifest.iri
            self.prefixes.update(m.manifest.prefijos)
        # Prefijos más largos primero para compactar correctamente.
        self._prefix_items = sorted(self.prefixes.items(), key=lambda kv: -len(kv[1]))
        self._sub_cache: dict[str, set[str]] = {}
        self._super_cache: dict[str, list[str]] = {}

    # ------------------------------------------------------------- utilidades
    @property
    def module_ids(self) -> list[str]:
        return [m.id for m in self.modules]

    @property
    def manifests(self) -> list[Manifest]:
        return [m.manifest for m in self.modules]

    def compact(self, iri: str) -> str:
        for prefix, ns in self._prefix_items:
            if iri.startswith(ns) and len(iri) > len(ns):
                rest = iri[len(ns):]
                if "/" not in rest and "#" not in rest:
                    return f"{prefix}:{rest}"
        return iri

    def expand(self, key: str) -> str:
        """Expande una clave compacta (``rpg:Place``) o devuelve la IRI tal cual."""
        if key.startswith(("http://", "https://", "urn:")):
            return key
        if ":" in key:
            prefix, rest = key.split(":", 1)
            if prefix in self.prefixes:
                return self.prefixes[prefix] + rest
        from loregraph.errors import UnknownPrefix

        raise UnknownPrefix(f"Prefijo desconocido en '{key}'")

    def module_of(self, iri: str) -> str | None:
        for m in reversed(self.modules):
            if iri.startswith(m.manifest.iri):
                return m.id
        return None

    # --------------------------------------------------------------- etiquetas
    def label(self, iri: str, lang: str = "es") -> str:
        node = URIRef(iri)
        for prop in LABEL_PROPS:
            v = pick_lang(self.ont.objects(node, prop), lang)
            if v:
                return v
        return local_name(iri)

    def has_label(self, iri: str) -> bool:
        node = URIRef(iri)
        return any(True for prop in LABEL_PROPS for _ in self.ont.objects(node, prop))

    def comment(self, iri: str, lang: str = "es") -> str | None:
        node = URIRef(iri)
        return pick_lang(self.ont.objects(node, RDFS.comment), lang) or pick_lang(
            self.ont.objects(node, SKOS.definition), lang
        )

    # ------------------------------------------------------------------ clases
    def superclasses(self, cls: str) -> list[str]:
        """Clase y superclases (cierre transitivo), de la más concreta a la más general."""
        if cls in self._super_cache:
            return self._super_cache[cls]
        out: list[str] = []
        frontier = [cls]
        while frontier:
            c = frontier.pop(0)
            if c in out:
                continue
            out.append(c)
            frontier.extend(str(o) for o in self.ont.objects(URIRef(c), RDFS.subClassOf) if isinstance(o, URIRef))
        self._super_cache[cls] = out
        return out

    def subclasses(self, cls: str) -> set[str]:
        """Clase y subclases (cierre transitivo)."""
        if cls in self._sub_cache:
            return self._sub_cache[cls]
        out: set[str] = set()
        frontier = [cls]
        while frontier:
            c = frontier.pop()
            if c in out:
                continue
            out.add(c)
            frontier.extend(str(s) for s in self.ont.subjects(RDFS.subClassOf, URIRef(c)) if isinstance(s, URIRef))
        self._sub_cache[cls] = out
        return out

    def is_subclass(self, cls: str, of: str) -> bool:
        return of in self.superclasses(cls)

    @cached_property
    def known_classes(self) -> set[str]:
        out = {str(s) for s in self.ont.subjects(RDF.type, OWL.Class) if isinstance(s, URIRef)}
        out |= {str(s) for s in self.ont.subjects(RDF.type, RDFS.Class) if isinstance(s, URIRef)}
        return out

    @cached_property
    def main_classes(self) -> list[str]:
        """Clases principales declaradas por los manifiestos, en orden."""
        out: list[str] = []
        for m in self.modules:
            for key in m.manifest.clases_principales:
                iri = self.expand(key)
                if iri not in out:
                    out.append(iri)
        return out

    def variants_for(self, cls: str) -> list[str]:
        """Clases variante (``rpg:variantOf``) aplicables a ``cls`` o a sus superclases."""
        supers = set(self.superclasses(cls))
        out = []
        for v, _, base in self.ont.triples((None, RPG.variantOf, None)):
            if str(base) in supers and str(v) not in out:
                out.append(str(v))
        return sorted(out, key=lambda i: self.label(i))

    def primary_type(self, types: Iterable[str]) -> str | None:
        """La clase principal (o variante) más específica entre los tipos de una entidad."""
        types = list(types)
        mains = self.main_classes
        # Una clase principal exacta tiene prioridad (orden del manifiesto).
        for m in mains:
            if m in types:
                return m
        # Si no, la primera clase principal de la que alguno de los tipos es subclase.
        for m in mains:
            for t in types:
                if m in self.superclasses(t):
                    return m
        return types[0] if types else None

    # ------------------------------------------------------------- propiedades
    @cached_property
    def functional_properties(self) -> set[str]:
        out = {str(s) for s in self.ont.subjects(RDF.type, OWL.FunctionalProperty)}
        for ps in self.shapes.subjects(SH.maxCount, Literal(1)):
            for p in self.shapes.objects(ps, SH.path):
                if isinstance(p, URIRef):
                    out.add(str(p))
        out.discard(str(RDFS.label))
        return out

    @cached_property
    def known_properties(self) -> set[str]:
        """Propiedades declaradas en la ontología o usadas como sh:path en las formas."""
        kinds = (RDF.Property, OWL.ObjectProperty, OWL.DatatypeProperty, OWL.AnnotationProperty)
        out = {str(s) for k in kinds for s in self.ont.subjects(RDF.type, k) if isinstance(s, URIRef)}
        out |= {str(p) for p in self.shapes.objects(None, SH.path) if isinstance(p, URIRef)}
        # Términos externos documentados en la ontología (rdfs:label, schema:description…)
        out |= {str(s) for s in self.ont.subjects(RDFS.label, None)
                if isinstance(s, URIRef) and not str(s).startswith(tuple(m.manifest.iri for m in self.modules))}
        out |= {str(RDF.type), str(OWL.sameAs)}
        return out

    @cached_property
    def object_properties(self) -> set[str]:
        return {str(s) for s in self.ont.subjects(RDF.type, OWL.ObjectProperty)}

    def is_temporal(self, prop: str) -> bool:
        return (URIRef(prop), RPG.isTemporal, Literal(True)) in self.ont

    # ---------------------------------------------------------------- SKOS
    def concepts(self, scheme: str, lang: str = "es") -> list[tuple[str, str]]:
        out = [
            (str(c), self.label(str(c), lang))
            for c in self.ont.subjects(SKOS.inScheme, URIRef(scheme))
            if isinstance(c, URIRef)
        ]
        return sorted(out, key=lambda t: t[1].lower())

    def list_items(self, node: object) -> list:
        return list(Collection(self.shapes, node))  # type: ignore[arg-type]

    # ---------------------------------------------------------------- estilos
    @cached_property
    def type_styles(self) -> dict[str, EstiloTipo]:
        out: dict[str, EstiloTipo] = {}
        for m in self.modules:
            for k, v in m.manifest.estilos_tipos.items():
                out[self.expand(k)] = v
        return out

    @cached_property
    def relation_styles(self) -> dict[str, EstiloRelacion]:
        out: dict[str, EstiloRelacion] = {}
        for m in self.modules:
            for k, v in m.manifest.estilos_relaciones.items():
                out[self.expand(k)] = v
        return out

    def style_for_types(self, types: Iterable[str]) -> EstiloTipo:
        """Estilo del tipo más específico que tenga uno (variantes y subclases incluidas)."""
        styles = self.type_styles
        best: tuple[int, EstiloTipo] | None = None
        for t in types:
            for dist, c in enumerate(self.superclasses(t)):
                if c in styles:
                    if best is None or dist < best[0]:
                        best = (dist, styles[c])
                    break
        return best[1] if best else EstiloTipo()

    def style_for(self, cls: str) -> EstiloTipo:
        styles = self.type_styles
        for c in self.superclasses(cls):
            if c in styles:
                return styles[c]
        return EstiloTipo()

    @cached_property
    def theme(self) -> tuple[str, Tema] | None:
        """Tema del último módulo de sistema que declare uno (si no, el del núcleo)."""
        chosen: tuple[str, Tema] | None = None
        for m in self.modules:
            if m.manifest.tema is not None:
                chosen = (m.id, m.manifest.tema)
        return chosen
