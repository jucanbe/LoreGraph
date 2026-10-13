"""Resolución de etiquetas legibles para IRIs (entidades, vocabulario y ontología)."""

from __future__ import annotations

from collections.abc import Iterable

import pyoxigraph as ox

from loregraph.forms.schema import ClaseRef
from loregraph.models import EntidadRef, Termino, TripletaLegible
from loregraph.namespaces import RDF, RDFS, RPG, SCHEMA, SKOS
from loregraph.ontology.context import local_name
from loregraph.services.kernel import CampaignHandle
from loregraph.store.store import GraphStore
from loregraph.store.terms import OxTerm

_LABEL_PROPS = (str(RDFS.label), str(SKOS.prefLabel))


class Labeler:
    """Etiquetas y tipos de IRIs con caché por petición."""

    def __init__(
        self,
        store: GraphStore,
        camp: CampaignHandle,
        lang: str = "es",
        extra_graphs: Iterable[str] = (),
    ) -> None:
        self.store = store
        self.camp = camp
        self.ctx = camp.ctx
        self.lang = lang
        self.graphs = [*camp.read_graphs, *extra_graphs]
        self._labels: dict[str, str] = {}
        self._types: dict[str, list[str]] = {}
        self._desc: dict[str, str] = {}

    # ---------------------------------------------------------------- carga
    def preload(self, iris: Iterable[str]) -> None:
        todo = [i for i in set(iris) if i not in self._labels]
        for i in range(0, len(todo), 300):
            chunk = todo[i:i + 300]
            values = " ".join(f"<{x}>" for x in chunk)
            rows = self.store.select(
                f"""SELECT ?s ?p ?o WHERE {{
                    VALUES ?s {{ {values} }}
                    ?s ?p ?o .
                    FILTER (?p IN (<{RDFS.label}>, <{SKOS.prefLabel}>, <{RDF.type}>, <{SCHEMA.description}>))
                }}""",
                default_graph=self.graphs,
            )
            labels: dict[str, list[ox.Literal]] = {}
            for r in rows:
                s, p, o = r["s"].value, r["p"].value, r["o"]
                if p == str(RDF.type) and isinstance(o, ox.NamedNode):
                    self._types.setdefault(s, [])
                    if o.value not in self._types[s]:
                        self._types[s].append(o.value)
                elif p in _LABEL_PROPS and isinstance(o, ox.Literal):
                    labels.setdefault(s, []).append(o)
                elif p == str(SCHEMA.description) and isinstance(o, ox.Literal):
                    self._desc.setdefault(s, o.value)
            for s in chunk:
                self._types.setdefault(s, [])
                lits = labels.get(s)
                if lits:
                    self._labels[s] = _pick(lits, self.lang)
                elif self.ctx.has_label(s):
                    self._labels[s] = self.ctx.label(s, self.lang)
                else:
                    self._labels[s] = local_name(s)

    # --------------------------------------------------------------- consulta
    def label(self, iri: str) -> str:
        if iri not in self._labels:
            self.preload([iri])
        return self._labels[iri]

    def types(self, iri: str) -> list[str]:
        if iri not in self._types:
            self.preload([iri])
        return self._types[iri]

    def description(self, iri: str) -> str | None:
        if iri not in self._labels:
            self.preload([iri])
        return self._desc.get(iri)

    def class_ref(self, iri: str) -> ClaseRef:
        return ClaseRef(iri=iri, clave=self.ctx.compact(iri), etiqueta=self.ctx.label(iri, self.lang))

    def is_entity(self, iri: str) -> bool:
        """¿Es una entidad navegable (de la campaña o del vocabulario de un módulo)?"""
        types = self.types(iri)
        if not types:
            return False
        entity_classes = self.ctx.subclasses(str(RPG.Entity))
        return any(t in entity_classes for t in types) or (
            self.camp.iris.entity_id(iri) is not None and str(RPG.Fact) not in self._fact_supers(types)
        )

    def _fact_supers(self, types: list[str]) -> set[str]:
        out: set[str] = set()
        for t in types:
            out.update(self.ctx.superclasses(t))
        return out

    def entity_ref(self, iri: str, with_description: bool = False) -> EntidadRef:
        types = self.types(iri)
        primary = self.ctx.primary_type(types)
        desc = self.description(iri) if with_description else None
        if desc and len(desc) > 240:
            desc = desc[:237] + "…"
        return EntidadRef(
            id=self.camp.entity_id(iri) or iri,
            iri=iri,
            etiqueta=self.label(iri),
            tipo=self.class_ref(primary) if primary else None,
            descripcion=desc,
            editable=self.camp.iris.entity_id(iri) is not None,
        )

    def term(self, t: OxTerm) -> Termino:
        if isinstance(t, ox.NamedNode):
            iri = t.value
            compact = self.ctx.compact(iri)
            return Termino(
                tipo="iri",
                valor=iri,
                etiqueta=self.label(iri) if not self._is_schema_term(iri) else self.ctx.label(iri, self.lang),
                id=self.camp.entity_id(iri) if self.camp.iris.is_campaign_data(iri) else None,
                clave=compact if compact != iri else None,
            )
        if isinstance(t, ox.Literal):
            return Termino(
                tipo="literal",
                valor=t.value,
                etiqueta=t.value,
                datatype=t.datatype.value if t.datatype else None,
                idioma=t.language,
            )
        return Termino(tipo="blanco", valor=str(t), etiqueta=str(t))

    def _is_schema_term(self, iri: str) -> bool:
        return self.ctx.has_label(iri) and not self.camp.iris.is_campaign_data(iri)

    def triple(self, s: OxTerm, p: OxTerm, o: OxTerm, graph: str | None = None) -> TripletaLegible:
        return TripletaLegible(sujeto=self.term(s), predicado=self.term(p), objeto=self.term(o), grafo=graph)

    def triples(self, triples: Iterable[tuple[OxTerm, OxTerm, OxTerm]], graph: str | None = None) -> list[TripletaLegible]:
        triples = list(triples)
        self.preload(
            t.value for tr in triples for t in tr if isinstance(t, ox.NamedNode)
        )
        return [self.triple(s, p, o, graph) for s, p, o in triples]


def _pick(lits: list[ox.Literal], lang: str) -> str:
    for pref in (lang, None, "en", "es"):
        for lit in lits:
            if (lit.language or None) == pref:
                return lit.value
    return lits[0].value
