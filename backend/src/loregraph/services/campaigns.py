"""Campañas: catálogo, módulos activos, panel resumen e información de presentación."""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pyoxigraph as ox

from loregraph.errors import BadRequest, Conflict
from loregraph.models import (
    CampanaEntrada,
    CampanaResumen,
    EstiloRelacionInfo,
    InfoCampana,
    PanelCampana,
    TemaActivo,
    TipoEntidad,
    TramaResumen,
)
from loregraph.modules.registry import ModuleError
from loregraph.namespaces import PROV, RDF, RDFS, RPG, SCHEMA, XSD
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.store.iris import slugify
from loregraph.store.terms import lit, nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

log = logging.getLogger(__name__)
TYPE = nn(str(RDF.type))


class CampaignService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel
        self._handles: dict[str, CampaignHandle] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------- catálogo
    def module_node(self, mid: str) -> str:
        return f"{self.k.iris.data_base}module/{mid}"

    def _load(self, cid: str) -> CampaignHandle | None:
        iri = self.k.iris.campaign(cid)
        rows = self.k.store.select(
            f"""SELECT ?p ?o ?mid WHERE {{
                <{iri}> a <{RPG.Campaign}> ; ?p ?o .
                OPTIONAL {{ ?o <{RPG.moduleId}> ?mid }}
            }}""",
            default_graph=[self.k.iris.catalog_graph],
        )
        if not rows:
            return None
        nombre, descripcion, creada = cid, "", None
        modules: list[str] = []
        for r in rows:
            p = r["p"].value
            if p == str(RDFS.label):
                nombre = r["o"].value
            elif p == str(SCHEMA.description):
                descripcion = r["o"].value
            elif p == str(SCHEMA.dateCreated):
                creada = r["o"].value
            elif p == str(RPG.usesModule) and "mid" in r:
                modules.append(r["mid"].value)
        modules.sort()
        try:
            ctx = self.k.context(modules)
        except ModuleError as exc:
            log.error("Campaña %s: módulos no disponibles (%s); se usa solo el núcleo", cid, exc)
            ctx = self.k.context([])
        return CampaignHandle(
            id=cid, iri=iri, nombre=nombre, descripcion=descripcion, declared_modules=modules,
            ctx=ctx, iris=self.k.iris, creada=creada,
        )

    def handle(self, cid: str) -> CampaignHandle | None:
        with self._lock:
            if cid in self._handles:
                return self._handles[cid]
        h = self._load(cid)
        if h is not None:
            with self._lock:
                self._handles[cid] = h
        return h

    def invalidate(self, cid: str | None = None) -> None:
        with self._lock:
            if cid is None:
                self._handles.clear()
            else:
                self._handles.pop(cid, None)

    def ids(self) -> list[str]:
        rows = self.k.store.select(
            f"SELECT ?c WHERE {{ ?c a <{RPG.Campaign}> }}", default_graph=[self.k.iris.catalog_graph]
        )
        out = []
        for r in rows:
            cid = self.k.iris.campaign_id(r["c"].value)
            if cid:
                out.append(cid)
        return sorted(out)

    def summary(self, camp: CampaignHandle, lang: str = "es") -> CampanaResumen:
        systems = [
            m.manifest.nombre.get(lang) or next(iter(m.manifest.nombre.values()))
            for m in camp.ctx.modules
            if m.manifest.categoria == "sistema"
        ]
        count = self.k.store.select(
            f"SELECT (COUNT(DISTINCT ?e) AS ?n) WHERE {{ ?e <{RDFS.label}> ?l }}", default_graph=[camp.canon]
        )
        n = int(count[0]["n"].value) if count else 0
        return CampanaResumen(
            id=camp.id, iri=camp.iri, nombre=camp.nombre, descripcion=camp.descripcion,
            modulos=camp.declared_modules, sistema=" + ".join(systems) or "Genérico",
            creada=camp.creada, numEntidades=n,
        )

    def list(self, lang: str = "es") -> list[CampanaResumen]:
        out = []
        for cid in self.ids():
            h = self.handle(cid)
            if h is not None:
                out.append(self.summary(h, lang))
        return out

    def _catalog_triples(self, iri: str, entrada: CampanaEntrada, created: str | None) -> list:
        c = nn(iri)
        ts = [
            (c, TYPE, nn(str(RPG.Campaign))),
            (c, nn(str(RDFS.label)), lit(entrada.nombre)),
            (c, nn(str(SCHEMA.description)), lit(entrada.descripcion)),
        ]
        if created:
            ts.append((c, nn(str(SCHEMA.dateCreated)), ox.Literal(created, datatype=nn(str(XSD.dateTime)))))
        for mid in sorted(set(entrada.modulos)):
            node = nn(self.module_node(mid))
            ts.append((c, nn(str(RPG.usesModule)), node))
            ts.append((node, nn(str(RPG.moduleId)), lit(mid)))
        return ts

    def _check_modules(self, modulos: list[str]) -> None:
        try:
            self.k.registry.resolve(modulos)
        except ModuleError as exc:
            raise BadRequest(str(exc)) from exc

    def create(self, entrada: CampanaEntrada) -> CampaignHandle:
        self._check_modules(entrada.modulos)
        cid = entrada.id or slugify(entrada.nombre)
        if entrada.id is None:
            base, i = cid, 2
            while self.handle(cid) is not None:
                cid = f"{base}-{i}"
                i += 1
        elif self.handle(cid) is not None:
            raise Conflict(f"Ya existe la campaña '{cid}'")
        created = datetime.now(UTC).isoformat(timespec="seconds")
        self.k.store.add_triples(self.k.iris.catalog_graph, self._catalog_triples(self.k.iris.campaign(cid), entrada, created))
        self.invalidate(cid)
        camp = self.handle(cid)
        assert camp is not None
        self.k.rules.recompute(camp)
        return camp

    def update(self, cid: str, entrada: CampanaEntrada) -> CampaignHandle:
        camp = self.k.campaign(cid)
        self._check_modules(entrada.modulos)
        iri = camp.iri
        old = list(self.k.store.triples(nn(iri), None, None, self.k.iris.catalog_graph))
        removes = [t for t in old if t[1].value != str(SCHEMA.dateCreated)]
        adds = self._catalog_triples(iri, entrada, None)
        self.k.store.apply({self.k.iris.catalog_graph: removes}, {self.k.iris.catalog_graph: adds})
        self.invalidate(cid)
        camp = self.k.campaign(cid)
        self.k.rules.recompute(camp)
        return camp

    def delete(self, cid: str) -> None:
        camp = self.k.campaign(cid)
        prefix = camp.iri + "/"
        for g in self.k.store.named_graphs():
            if g.startswith(prefix):
                self.k.store.drop_graph(g)
        old = list(self.k.store.triples(nn(camp.iri), None, None, self.k.iris.catalog_graph))
        self.k.store.apply({self.k.iris.catalog_graph: old}, {})
        self.k.aux.clear_campaign(cid)
        self.invalidate(cid)

    # ------------------------------------------------------------ escritura
    def after_write(self, camp: CampaignHandle, graphs: set[str], about: set[str]) -> None:
        """Mantiene lo derivable tras una escritura: reglas, índice y fechas."""
        if camp.canon in graphs:
            self.k.rules.recompute(camp)
            self.k.search.reindex_entities(camp, about)
        for iri in about:
            if self.k.iris.entity_id(iri) is not None:
                self.k.aux.touch(iri, camp.id)

    def rebuild_indexes(self) -> None:
        """Reconstruye reglas, índice de búsqueda y metadatos de todas las campañas."""
        self.k.search.reindex_modules()
        for cid in self.ids():
            camp = self.handle(cid)
            if camp is not None:
                self.rebuild_campaign(camp)

    def rebuild_campaign(self, camp: CampaignHandle) -> None:
        """Reglas derivadas, índice de búsqueda y fechas de modificación de una campaña."""
        self.k.rules.recompute(camp)
        self.k.search.reindex_campaign(camp)
        rows = self.k.store.select(
            f"""SELECT ?e (MIN(?t) AS ?c) (MAX(?t) AS ?m) WHERE {{
                ?ch <{RPG.aboutEntity}> ?e ; <{PROV.endedAtTime}> ?t .
            }} GROUP BY ?e""",
            default_graph=[camp.provenance],
        )
        for r in rows:
            for key in ("c", "m"):
                try:
                    ts = datetime.fromisoformat(r[key].value).timestamp()
                except (KeyError, ValueError):
                    continue
                self.k.aux.touch(r["e"].value, camp.id, ts)

    # ---------------------------------------------------------- presentación
    def theme(self, camp: CampaignHandle) -> TemaActivo | None:
        chosen = camp.ctx.theme
        if chosen is None:
            return None
        mid, tema = chosen
        return TemaActivo(modulo=mid, tema=tema, urlBaseAssets=f"/modulos/{mid}/assets/")

    def counts(self, camp: CampaignHandle) -> dict[str, int]:
        rows = self.k.store.select(
            "SELECT ?e ?t WHERE { ?e a ?t }",
            default_graph=[camp.canon, *[self.k.iris.module_graph(m, "vocabulary") for m in camp.modules]],
        )
        types: dict[str, set[str]] = defaultdict(set)
        for r in rows:
            types[r["e"].value].add(r["t"].value)
        counts = {camp.ctx.compact(m): 0 for m in camp.ctx.main_classes}
        for ts in types.values():
            supers: set[str] = set()
            for t in ts:
                supers.update(camp.ctx.superclasses(t))
            for m in camp.ctx.main_classes:
                if m in supers:
                    counts[camp.ctx.compact(m)] += 1
        return counts

    def info(self, camp: CampaignHandle, lang: str = "es") -> InfoCampana:
        ctx = camp.ctx
        counts = self.counts(camp)
        tipos = [
            TipoEntidad(
                clase=_ref(ctx, m, lang),
                descripcion=ctx.comment(m, lang),
                modulo=ctx.module_of(m),
                recuento=counts.get(ctx.compact(m), 0),
                estilo=ctx.style_for(m),
                variantes=[_ref(ctx, v, lang) for v in ctx.variants_for(m)],
            )
            for m in ctx.main_classes
        ]
        relaciones = [
            EstiloRelacionInfo(clave=ctx.compact(iri), iri=iri, etiqueta=ctx.label(iri, lang), estilo=st)
            for iri, st in ctx.relation_styles.items()
        ]
        return InfoCampana(
            campana=self.summary(camp, lang), tipos=tipos, relaciones=relaciones,
            prefijos=dict(ctx.prefixes), tema=self.theme(camp),
        )

    def _active_inconsistencies(self, camp: CampaignHandle, lang: str) -> int:
        informe = self.k.coherence.check(camp, lang)
        return informe.errores + informe.avisos

    def panel(self, camp: CampaignHandle, lang: str = "es") -> PanelCampana:
        labeler = Labeler(self.k.store, camp, lang)
        recent_iris = [i for i, _ in self.k.aux.recent(camp.id, 12)]
        recent_iris = [i for i in recent_iris if next(self.k.store.triples(nn(i), TYPE, None, camp.canon), None)]
        labeler.preload(recent_iris)
        meta = self.k.aux.meta(recent_iris)
        recientes = []
        for i in recent_iris[:8]:
            ref = labeler.entity_ref(i)
            ref.modificada = meta.get(i, (None, None))[1]
            recientes.append(ref)

        plots = self.k.store.select(
            f"""SELECT ?p ?x WHERE {{
                ?p a <{RPG.Plot}> ; <{RPG.plotStatus}> <{RPG["plot-open"]}> .
                OPTIONAL {{ ?p <{RPG.involves}> ?x }}
            }}""",
            default_graph=[camp.canon],
        )
        by_plot: dict[str, list[str]] = defaultdict(list)
        for r in plots:
            by_plot[r["p"].value]
            if "x" in r:
                by_plot[r["p"].value].append(r["x"].value)
        labeler.preload([*by_plot, *(x for xs in by_plot.values() for x in xs)])
        tramas = sorted(
            (TramaResumen(entidad=labeler.entity_ref(p, with_description=True),
                          implicados=[labeler.entity_ref(x) for x in xs]) for p, xs in by_plot.items()),
            key=lambda t: t.entidad.etiqueta.lower(),
        )
        sessions = self.k.sessions.sessions(camp, lang)
        return PanelCampana(
            campana=self.summary(camp, lang),
            recuentos=self.counts(camp),
            recientes=recientes,
            tramasAbiertas=tramas,
            propuestasPendientes=self.k.proposals.count_pending(camp),
            incoherencias=self._active_inconsistencies(camp, lang),
            ultimaSesion=sessions[-1].sesion if sessions else None,
            tema=self.theme(camp),
        )


def _ref(ctx, iri: str, lang: str):  # type: ignore[no-untyped-def]
    from loregraph.forms.schema import ClaseRef

    return ClaseRef(iri=iri, clave=ctx.compact(iri), etiqueta=ctx.label(iri, lang))
