"""Conocimiento epistémico: lo que cree saber cada personaje, comparado con el canon."""

from __future__ import annotations

from typing import TYPE_CHECKING, Literal

import pyoxigraph as ox

from loregraph.errors import BadRequest, NotFound, ValidationFailed
from loregraph.models import Actor, ConocimientoPersonaje, Creencia, EntidadRef, TripletaEntrada
from loregraph.namespaces import RDF, RDFS, RPG, SCHEMA, SKOS
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.services.triples import TripleResolver
from loregraph.store.terms import OxTerm, nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

Triple = tuple[OxTerm, OxTerm, OxTerm]
Estado = Literal["confirmado", "falso", "no_verificado"]
#: Propiedades descriptivas: una diferencia de texto no se considera «falsa».
DESCRIPTIVE = {str(RDFS.label), str(SKOS.altLabel), str(SCHEMA.description), str(RDF.type)}


class KnowledgeService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    def _character(self, camp: CampaignHandle, ref: str) -> str:
        iri = camp.entity_iri(ref)
        types = {t.value for _, _, t in self.k.store.triples(nn(iri), nn(str(RDF.type)), None, camp.canon)}
        if not types:
            raise NotFound(f"No existe la entidad '{ref}'")
        chars = camp.ctx.subclasses(str(RPG.Character)) | camp.ctx.subclasses(str(RPG.Player))
        if not types & chars:
            raise BadRequest("Solo los personajes y jugadores tienen vista epistémica")
        return iri

    def graph_for(self, camp: CampaignHandle, ref: str) -> tuple[str, str]:
        iri = self._character(camp, ref)
        eid = self.k.iris.entity_id(iri)
        assert eid is not None
        return iri, camp.knowledge(eid)

    def characters(self, camp: CampaignHandle, lang: str = "es") -> list[EntidadRef]:
        prefix = self.k.iris.knowledge_prefix(camp.id)
        iris = []
        for g in self.k.store.named_graphs():
            if g.startswith(prefix):
                iris.append(self.k.iris.entity(camp.id, g[len(prefix):]))
        labeler = Labeler(self.k.store, camp, lang)
        labeler.preload(iris)
        return sorted((labeler.entity_ref(i) for i in iris), key=lambda r: r.etiqueta.lower())

    # ----------------------------------------------------------- clasificación
    def classify(self, camp: CampaignHandle, triples: list[Triple]) -> list[tuple[Triple, Estado, list[OxTerm]]]:
        functional = camp.ctx.functional_properties
        canon_graphs = [camp.canon, camp.derived]
        out: list[tuple[Triple, Estado, list[OxTerm]]] = []
        for s, p, o in triples:
            if any(self.k.store.contains(s, p, o, g) for g in canon_graphs):
                out.append(((s, p, o), "confirmado", []))
                continue
            if p.value in functional and p.value not in DESCRIPTIVE:  # type: ignore[union-attr]
                canon_vals = [t[2] for g in canon_graphs for t in self.k.store.triples(s, p, None, g)]  # type: ignore[arg-type]
                if canon_vals and o not in canon_vals:
                    out.append(((s, p, o), "falso", canon_vals))
                    continue
            out.append(((s, p, o), "no_verificado", []))
        return out

    def beliefs(self, camp: CampaignHandle, ref: str, lang: str = "es") -> ConocimientoPersonaje:
        iri, graph = self.graph_for(camp, ref)
        triples = self.k.store.graph_triples(graph)
        labeler = Labeler(self.k.store, camp, lang, extra_graphs=[graph])
        labeler.preload([iri, *(t.value for tr in triples for t in tr if isinstance(t, ox.NamedNode))])
        creencias = [
            Creencia(tripleta=labeler.triple(*tr), estado=estado, canon=[labeler.term(c) for c in canon])
            for tr, estado, canon in self.classify(camp, triples)
        ]
        creencias.sort(key=lambda c: (c.tripleta.sujeto.etiqueta.lower(), c.tripleta.predicado.etiqueta))
        return ConocimientoPersonaje(personaje=labeler.entity_ref(iri), creencias=creencias)

    # ---------------------------------------------------------------- escritura
    def add(self, camp: CampaignHandle, ref: str, items: list[TripletaEntrada], actor: Actor, lang: str = "es") -> str:
        iri, graph = self.graph_for(camp, ref)
        triples, errors = TripleResolver(camp, lang=lang).resolve_all(items)
        if errors:
            raise ValidationFailed(errors)
        about = {t[0].value for t in triples if isinstance(t[0], ox.NamedNode)} | {iri}  # type: ignore[union-attr]
        return self.k.provenance.commit(camp, actor, adds={graph: triples}, about=about) or ""

    def remove(self, camp: CampaignHandle, ref: str, items: list[TripletaEntrada], actor: Actor, lang: str = "es") -> str:
        iri, graph = self.graph_for(camp, ref)
        triples, errors = TripleResolver(camp, lang=lang).resolve_all(items)
        if errors:
            raise ValidationFailed(errors)
        return self.k.provenance.commit(camp, actor, removes={graph: triples}, about={iri}) or ""
