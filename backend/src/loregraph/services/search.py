"""Búsqueda por texto (índice FTS5 insensible a acentos)."""

from __future__ import annotations

from collections.abc import Iterable
from typing import TYPE_CHECKING

import pyoxigraph as ox

from loregraph.models import ResultadoBusqueda
from loregraph.namespaces import RDF, RDFS, RPG, SCHEMA, SKOS
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

VOCAB_SCOPE = "modulo:"


class SearchService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    # ------------------------------------------------------------ indexación
    def _entity_rows(self, graphs: list[str], subjects: list[str] | None = None) -> dict[str, dict]:
        values = ""
        if subjects is not None:
            if not subjects:
                return {}
            values = "VALUES ?s { " + " ".join(f"<{s}>" for s in subjects) + " }"
        rows = self.k.store.select(
            f"""SELECT ?s ?p ?o WHERE {{
                {values}
                ?s ?p ?o .
                FILTER (?p IN (<{RDF.type}>, <{RDFS.label}>, <{SKOS.prefLabel}>, <{SKOS.altLabel}>, <{SCHEMA.description}>))
            }}""",
            default_graph=graphs,
        )
        data: dict[str, dict] = {}
        for r in rows:
            s, p, o = r["s"].value, r["p"].value, r["o"]
            d = data.setdefault(s, {"tipos": [], "etiqueta": "", "alias": [], "descripcion": ""})
            if p == str(RDF.type) and isinstance(o, ox.NamedNode):
                d["tipos"].append(o.value)
            elif p in (str(RDFS.label), str(SKOS.prefLabel)) and isinstance(o, ox.Literal):
                if not d["etiqueta"] or (o.language in (None, "es")):
                    d["etiqueta"] = o.value
                else:
                    d["alias"].append(o.value)
            elif p == str(SKOS.altLabel) and isinstance(o, ox.Literal):
                d["alias"].append(o.value)
            elif p == str(SCHEMA.description) and isinstance(o, ox.Literal):
                d["descripcion"] = o.value
        return data

    def _is_indexable(self, camp: CampaignHandle, types: list[str]) -> bool:
        entity_classes = camp.ctx.subclasses(str(RPG.Entity))
        return any(t in entity_classes for t in types)

    def reindex_campaign(self, camp: CampaignHandle) -> int:
        # Solo se vacía el índice de búsqueda; las consultas guardadas se conservan.
        with self.k.aux.lock:
            self.k.aux.conn.execute("DELETE FROM busqueda WHERE campana = ?", (camp.id,))
            self.k.aux.conn.commit()
        data = self._entity_rows([camp.canon])
        n = 0
        for s, d in data.items():
            if d["etiqueta"] and self._is_indexable(camp, d["tipos"]):
                self.k.aux.index_entity(s, camp.id, d["tipos"], d["etiqueta"], d["alias"], d["descripcion"])
                n += 1
        return n

    def reindex_modules(self) -> None:
        """Indexa las entidades de vocabulario de cada módulo (ámbito ``modulo:<id>``)."""
        for mod in self.k.registry.modules.values():
            scope = VOCAB_SCOPE + mod.id
            with self.k.aux.lock:
                self.k.aux.conn.execute("DELETE FROM busqueda WHERE campana = ?", (scope,))
                self.k.aux.conn.commit()
            try:
                entity_classes = self.k.context([mod.id]).subclasses(str(RPG.Entity))
            except Exception:  # noqa: BLE001 - módulo con dependencias rotas
                continue
            data = self._entity_rows([self.k.iris.module_graph(mod.id, "vocabulary")])
            for s, d in data.items():
                if d["etiqueta"] and any(t in entity_classes for t in d["tipos"]):
                    self.k.aux.index_entity(s, scope, d["tipos"], d["etiqueta"], d["alias"], d["descripcion"])

    def reindex_entities(self, camp: CampaignHandle, iris: Iterable[str]) -> None:
        iris = [i for i in set(iris) if self.k.iris.entity_id(i) is not None]
        data = self._entity_rows([camp.canon], iris)
        for iri in iris:
            d = data.get(iri)
            if d and d["etiqueta"] and self._is_indexable(camp, d["tipos"]):
                self.k.aux.index_entity(iri, camp.id, d["tipos"], d["etiqueta"], d["alias"], d["descripcion"])
            else:
                self.k.aux.unindex_entity(iri, camp.id)

    # ---------------------------------------------------------------- búsqueda
    def search(
        self, q: str, camp: CampaignHandle | None = None, limit: int = 20, lang: str = "es"
    ) -> list[ResultadoBusqueda]:
        if camp is not None:
            scopes = [camp.id, *(VOCAB_SCOPE + m for m in camp.modules)]
            hits = self.k.aux.search(q, scopes, limit)
            labeler = Labeler(self.k.store, camp, lang)
            labeler.preload(h.iri for h in hits)
            return [
                ResultadoBusqueda(entidad=labeler.entity_ref(h.iri, with_description=True), campana=camp.id,
                                  puntuacion=h.puntuacion)
                for h in hits
            ]
        # búsqueda global: todas las campañas
        hits = [h for h in self.k.aux.search(q, None, limit * 2) if not h.campana.startswith(VOCAB_SCOPE)]
        out: list[ResultadoBusqueda] = []
        labelers: dict[str, Labeler] = {}
        for h in hits[:limit]:
            handle = self.k.campaigns.handle(h.campana)
            if handle is None:
                continue
            lab = labelers.setdefault(h.campana, Labeler(self.k.store, handle, lang))
            out.append(ResultadoBusqueda(entidad=lab.entity_ref(h.iri, with_description=True), campana=h.campana,
                                         puntuacion=h.puntuacion))
        return out

    def matching_iris(self, q: str, camp: CampaignHandle, limit: int = 500) -> list[str]:
        scopes = [camp.id, *(VOCAB_SCOPE + m for m in camp.modules)]
        return [h.iri for h in self.k.aux.search(q, scopes, limit)]
