"""Propuestas de agentes: se escriben SOLO en grafos de propuesta y un humano las revisa.

Cada propuesta tiene sus tripletas añadidas en ``<campaña>/proposals/<id>`` y sus
metadatos (agente, petición, estado, eliminaciones reificadas) en
``<campaña>/proposals``. Aprobarla aplica el cambio al grafo destino con
procedencia; rechazarla la marca como rechazada.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import TYPE_CHECKING, Literal

import pyoxigraph as ox

from loregraph.errors import BadRequest, Conflict, NotFound
from loregraph.forms.builder import FormBuilder
from loregraph.models import (
    Actor,
    ErrorValidacion,
    PropuestaDetalle,
    PropuestaEntrada,
    PropuestaResumen,
    ResultadoLote,
    ResultadoPropuesta,
    RevisionEntrada,
    TripletaEntrada,
)
from loregraph.namespaces import OWL, PROV, RDF, RDFS, RPG, SCHEMA
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.services.provenance import now_literal
from loregraph.services.triples import TripleResolver
from loregraph.services.values import BuildResult, ValueBuilder
from loregraph.store.iris import new_suffix, slugify
from loregraph.store.terms import OxTerm, lit, nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

Triple = tuple[OxTerm, OxTerm, OxTerm]
TYPE = nn(str(RDF.type))
STATUS = {
    str(RPG["proposal-pending"]): "pendiente",
    str(RPG["proposal-approved"]): "aprobada",
    str(RPG["proposal-rejected"]): "rechazada",
}
STATUS_IRI = {v: k for k, v in STATUS.items()}


class _MappedValueBuilder(ValueBuilder):
    """ValueBuilder que entiende las claves temporales de las entidades nuevas."""

    def __init__(self, camp: CampaignHandle, ref_map: dict[str, str], lang: str) -> None:
        super().__init__(camp, lang)
        self.ref_map = ref_map

    def resolve_ref(self, ref: str) -> str | None:
        return self.ref_map.get(ref.strip()) or super().resolve_ref(ref)


class ProposalService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    # ------------------------------------------------------------- utilidades
    def _target_graph(self, camp: CampaignHandle, destino: str) -> str:
        if destino == "canon":
            return camp.canon
        if destino.startswith("conocimiento/"):
            ref = destino.split("/", 1)[1]
            _, graph = self.k.knowledge.graph_for(camp, ref)
            return graph
        raise BadRequest("Destino no válido: usa 'canon' o 'conocimiento/<id de personaje>'")

    def _destino_name(self, camp: CampaignHandle, graph: str) -> str:
        if graph == camp.canon:
            return "canon"
        prefix = self.k.iris.knowledge_prefix(camp.id)
        if graph.startswith(prefix):
            return "conocimiento/" + graph[len(prefix):]
        return graph

    def _owner(self, iri: str) -> str:
        """Entidad propietaria de un nodo anidado (``<e>/n/…``) o la propia IRI."""
        return iri.split("/n/", 1)[0] if "/n/" in iri else iri

    def _safety(self, camp: CampaignHandle, adds: list[Triple], lang: str) -> list[ErrorValidacion]:
        """Reglas que ningún agente puede saltarse."""
        errors: list[ErrorValidacion] = []
        es = lang == "es"
        for s, p, o in adds:
            s_iri = s.value  # type: ignore[union-attr]
            if not self.k.iris.is_campaign_data(s_iri) or self.k.iris.campaign_id(s_iri) != camp.id:
                errors.append(ErrorValidacion(
                    foco=s_iri, campo=camp.ctx.compact(p.value),  # type: ignore[union-attr]
                    mensaje=("Solo se pueden afirmar hechos sobre entidades de esta campaña "
                             "(nunca sobre recursos reales u ontologías)") if es else
                    "Facts can only be asserted about entities of this campaign (never about real resources or ontologies)",
                ))
            if p.value == str(OWL.sameAs) and isinstance(o, ox.NamedNode) and not self.k.iris.is_campaign_data(o.value):  # type: ignore[union-attr]
                errors.append(ErrorValidacion(
                    foco=s_iri, campo="owl:sameAs",
                    mensaje=("No se permite owl:sameAs hacia recursos externos: usa rpg:inspiredBy o rpg:correspondsTo"
                             if es else "owl:sameAs to external resources is not allowed: use rpg:inspiredBy"),
                ))
        return errors

    # ------------------------------------------------------------ construcción
    def _build(
        self, camp: CampaignHandle, entrada: PropuestaEntrada, pgraph: str, lang: str
    ) -> tuple[list[Triple], list[Triple], list[ErrorValidacion], set[str]]:
        ref_map: dict[str, str] = {}
        errors: list[ErrorValidacion] = []
        adds: list[Triple] = []
        refs: set[str] = set()
        existing: dict[str, str] = {}
        es = lang == "es"
        # 1) referencias de entidades (existentes o nuevas)
        for ent in entrada.entidades:
            iri = None
            try:
                cand = camp.entity_iri(ent.ref)
                if self.k.entities.exists(camp, cand) or not self.k.iris.is_campaign_data(cand):
                    iri = cand
                    existing[ent.ref] = cand
            except KeyError:
                pass
            if iri is None:
                if not ent.clases:
                    errors.append(ErrorValidacion(mensaje=(f"La entidad nueva '{ent.ref}' necesita 'clases'"
                                                           if es else f"New entity '{ent.ref}' needs 'clases'")))
                    continue
                label = ent.valores.get("rdfs:label") or ["entidad"]
                base = slugify(str(label[0]) if label else "entidad")
                iri = self.k.iris.entity(camp.id, f"{base}-{new_suffix(2)}")
            ref_map[ent.ref] = iri
        # 2) valores de las entidades
        vb = _MappedValueBuilder(camp, ref_map, lang)
        for ent in entrada.entidades:
            iri = ref_map.get(ent.ref)
            if iri is None:
                continue
            if ent.ref in existing:
                types = self.k.entities._types(camp, iri, camp.read_graphs)
                classes = self.k.entities._ordered_classes(camp, types)
                if ent.clases:
                    try:
                        classes = [*classes, *[camp.ctx.expand(c) for c in ent.clases if camp.ctx.expand(c) not in classes]]
                    except KeyError as exc:
                        errors.append(ErrorValidacion(mensaje=str(exc)))
                        continue
                    adds.extend((nn(iri), TYPE, nn(c)) for c in classes if c not in types)
                if not classes:
                    errors.append(ErrorValidacion(foco=iri, mensaje="Entidad sin clase conocida"))
                    continue
                form = FormBuilder(camp.ctx, lang).build(classes)
                res = BuildResult()
                vb.build(iri, ent.valores, form.campos, res)
            else:
                try:
                    classes = self.k.entities._validate_classes(camp, ent.clases)
                except BadRequest as exc:
                    errors.append(ErrorValidacion(mensaje=exc.message))
                    continue
                form = FormBuilder(camp.ctx, lang).build(classes)
                res = BuildResult(triples=[(nn(iri), TYPE, nn(c)) for c in classes])
                vb.build(iri, ent.valores, form.campos, res)
            errors.extend(res.errors)
            adds.extend(res.triples)
            refs |= res.references
        # 3) tripletas sueltas y Turtle
        resolver = TripleResolver(camp, ref_map, lang)
        extra, errs = resolver.resolve_all(entrada.anadir)
        adds.extend(extra)
        errors.extend(errs)
        removes, errs = resolver.resolve_all(entrada.eliminar)
        errors.extend(errs)
        if entrada.turtle:
            ttl, errs = resolver.parse_turtle(entrada.turtle, pgraph)
            adds.extend(ttl)
            errors.extend(errs)
        for _, _, o in adds:
            if isinstance(o, ox.NamedNode):
                refs.add(o.value)
        return list(dict.fromkeys(adds)), list(dict.fromkeys(removes)), errors, refs

    def _validate(
        self, camp: CampaignHandle, target: str, adds: list[Triple], removes: list[Triple], refs: set[str],
        pgraph: str | None, lang: str,
    ) -> list[ErrorValidacion]:
        errors = self._safety(camp, adds, lang)
        es = lang == "es"
        for s, p, o in removes:
            if not self.k.store.contains(s, p, o, target):
                errors.append(ErrorValidacion(foco=s.value, campo=camp.ctx.compact(p.value),  # type: ignore[union-attr]
                                              mensaje="La tripleta a eliminar no existe" if es else
                                              "The triple to remove does not exist", valor=str(o)))
        if errors or target != camp.canon:
            return errors
        subjects = {self._owner(s.value) for s, _, _ in [*adds, *removes] if isinstance(s, ox.NamedNode)}  # type: ignore[union-attr]
        state: list[Triple] = []
        rem = set(removes)
        for subj in subjects:
            for t in self.k.store.triples(nn(subj), None, None, camp.canon):
                if t not in rem:
                    state.append(t)
            for t in self.k.entities._nested_cbd(subj, camp.canon):
                if t not in rem:
                    state.append(t)
        state.extend(adds)
        # Tipos de todo lo que referencia el estado completo, no solo lo nuevo.
        refs = set(refs) | {o.value for _, _, o in state if isinstance(o, ox.NamedNode)}
        focus = sorted({s.value for s, _, _ in adds if isinstance(s, ox.NamedNode)} | subjects)  # type: ignore[union-attr]
        return [e for e in self.k.entities.validate_state(camp, state, focus, refs, lang,
                                                          extra_graphs=[pgraph] if pgraph else None)
                if e.severidad == "violacion"]

    def check(self, camp: CampaignHandle, entrada: PropuestaEntrada, lang: str = "es") -> list[ErrorValidacion]:
        """Valida una propuesta sin guardarla (lo usa el generador antes de crearla)."""
        target = self._target_graph(camp, entrada.destino)
        adds, removes, errors, refs = self._build(camp, entrada, self.k.iris.proposal_graph(camp.id, "comprobacion"), lang)
        return errors or self._validate(camp, target, adds, removes, refs, None, lang)

    # ---------------------------------------------------------------- crear
    def create(self, camp: CampaignHandle, entrada: PropuestaEntrada, tipo_agente: Literal["agente", "humano"] = "agente",
               lang: str = "es") -> ResultadoPropuesta:
        target = self._target_graph(camp, entrada.destino)
        pid = uuid.uuid4().hex[:10]
        pgraph = self.k.iris.proposal_graph(camp.id, pid)
        adds, removes, errors, refs = self._build(camp, entrada, pgraph, lang)
        if not errors:
            errors = self._validate(camp, target, adds, removes, refs, None, lang)
        if not adds and not removes and not errors:
            errors = [ErrorValidacion(mensaje="La propuesta está vacía" if lang == "es" else "The proposal is empty")]
        if errors:
            return ResultadoPropuesta(ok=False, errores=errors)
        actor = Actor(tipo=tipo_agente, nombre=entrada.agente, peticion=entrada.peticion)
        prop = nn(self.k.iris.proposal(camp.id, pid))
        agent = nn(self.k.provenance.agent_iri(actor))
        meta: list[Triple] = [
            (prop, TYPE, nn(str(RPG.Proposal))),
            (prop, TYPE, nn(str(PROV.Entity))),
            (prop, nn(str(PROV.wasAttributedTo)), agent),
            (prop, nn(str(PROV.generatedAtTime)), now_literal()),
            (prop, nn(str(RPG.request)), lit(entrada.peticion)),
            (prop, nn(str(RPG.proposalStatus)), nn(STATUS_IRI["pendiente"])),
            (prop, nn(str(RPG.targetGraph)), nn(target)),
            (prop, nn(str(RPG.proposalGraph)), nn(pgraph)),
            *self.k.provenance.agent_triples(actor),
        ]
        if entrada.resumen:
            meta.append((prop, nn(str(SCHEMA.description)), lit(entrada.resumen)))
        meta.extend(self._removal_triples(prop, removes))
        about = {self._owner(s.value) for s, _, _ in [*adds, *removes] if isinstance(s, ox.NamedNode)}  # type: ignore[union-attr]
        meta.extend((prop, nn(str(RPG.aboutEntity)), nn(e)) for e in about)
        self.k.store.apply({}, {camp.proposals: meta, pgraph: adds})
        return ResultadoPropuesta(ok=True, propuesta=self._summary(camp, pid, lang))

    def _removal_triples(self, prop: ox.NamedNode, removes: list[Triple]) -> list[Triple]:
        out: list[Triple] = []
        for i, (s, p, o) in enumerate(removes, 1):
            st = nn(f"{prop.value}#r{i}")
            out.extend([
                (prop, nn(str(RPG.removed)), st), (st, TYPE, nn(str(RDF.Statement))),
                (st, nn(str(RDF.subject)), s), (st, nn(str(RDF.predicate)), p), (st, nn(str(RDF.object)), o),
            ])
        return out

    # ---------------------------------------------------------------- lectura
    def _meta(self, camp: CampaignHandle, pid: str) -> dict:
        prop = self.k.iris.proposal(camp.id, pid)
        rows = self.k.store.select(f"SELECT ?p ?o WHERE {{ <{prop}> ?p ?o }}", default_graph=[camp.proposals])
        if not rows:
            raise NotFound(f"No existe la propuesta '{pid}'")
        m: dict = defaultdict(list)
        for r in rows:
            m[r["p"].value].append(r["o"])
        return m

    def _removals(self, camp: CampaignHandle, pid: str) -> list[Triple]:
        prop = self.k.iris.proposal(camp.id, pid)
        rows = self.k.store.select(
            f"""SELECT ?s ?p ?o WHERE {{ <{prop}> <{RPG.removed}> ?st .
                ?st <{RDF.subject}> ?s ; <{RDF.predicate}> ?p ; <{RDF.object}> ?o . }}""",
            default_graph=[camp.proposals],
        )
        return [(r["s"], r["p"], r["o"]) for r in rows]

    def _additions(self, camp: CampaignHandle, pid: str, m: dict) -> list[Triple]:
        pgraph = self.k.iris.proposal_graph(camp.id, pid)
        adds = self.k.store.graph_triples(pgraph)
        if not adds and STATUS.get(m[str(RPG.proposalStatus)][0].value) == "aprobada":
            # Tras aprobar, el grafo de la propuesta se elimina: se recupera del cambio.
            prop = self.k.iris.proposal(camp.id, pid)
            rows = self.k.store.select(f"SELECT ?ch WHERE {{ ?ch <{PROV.used}> <{prop}> }}", default_graph=[camp.provenance])
            if rows:
                adds, _ = self.k.provenance.statements(camp, rows[0]["ch"].value)
                # Sin la historia temporal que el sistema añadió al aplicar la propuesta.
                adds = [t for t in adds if t[1].value != str(RPG.hasHistory)  # type: ignore[union-attr]
                        and "/n/h-" not in str(t[0])]
        return adds

    def _summary(self, camp: CampaignHandle, pid: str, lang: str, labeler: Labeler | None = None) -> PropuestaResumen:
        m = self._meta(camp, pid)
        prop = self.k.iris.proposal(camp.id, pid)
        agent_iri = m[str(PROV.wasAttributedTo)][0].value
        agent_rows = self.k.store.select(
            f"SELECT ?l ?t WHERE {{ <{agent_iri}> <{RDFS.label}> ?l ; a ?t }}", default_graph=[camp.proposals]
        )
        agent_name = agent_rows[0]["l"].value if agent_rows else agent_iri.rsplit("/", 1)[-1]
        is_ai = any(r["t"].value == str(RPG.AIAgent) for r in agent_rows)
        status = STATUS.get(m[str(RPG.proposalStatus)][0].value, "pendiente")
        n_add = len(self._additions(camp, pid, m))
        n_rem = len(m.get(str(RPG.removed), []))
        about = [o.value for o in m.get(str(RPG.aboutEntity), [])]
        pgraph = self.k.iris.proposal_graph(camp.id, pid)
        lab = labeler or Labeler(self.k.store, camp, lang, extra_graphs=[pgraph])
        lab.preload(about)

        def first(key: str) -> str | None:
            v = m.get(key)
            return v[0].value if v else None

        return PropuestaResumen(
            id=pid, iri=prop, estado=status,  # type: ignore[arg-type]
            agente=agent_name, tipoAgente="agente" if is_ai else "humano",
            peticion=first(str(RPG.request)) or "",
            resumen=first(str(SCHEMA.description)),
            destino=self._destino_name(camp, m[str(RPG.targetGraph)][0].value),
            creada=first(str(PROV.generatedAtTime)) or "",
            revisada=first(str(PROV.invalidatedAtTime)),
            notaRevision=first(str(RPG.reviewNote)),
            numAnadidas=n_add, numEliminadas=n_rem,
            entidades=[lab.entity_ref(a) for a in about],
        )

    def ids(self, camp: CampaignHandle, estado: str | None = None) -> list[tuple[str, str]]:
        status_filter = f"; <{RPG.proposalStatus}> <{STATUS_IRI[estado]}>" if estado in STATUS_IRI else ""
        rows = self.k.store.select(
            f"""SELECT ?p ?t WHERE {{ ?p a <{RPG.Proposal}> {status_filter} ;
                <{PROV.generatedAtTime}> ?t }} ORDER BY DESC(?t)""",
            default_graph=[camp.proposals],
        )
        return [(r["p"].value.rsplit("/", 1)[-1], r["t"].value) for r in rows]

    def list(self, camp: CampaignHandle, estado: str | None = None, lang: str = "es") -> list[PropuestaResumen]:
        return [self._summary(camp, pid, lang) for pid, _ in self.ids(camp, estado)]

    def count_pending(self, camp: CampaignHandle) -> int:
        rows = self.k.store.select(
            f"""SELECT (COUNT(?p) AS ?n) WHERE {{ ?p a <{RPG.Proposal}> ;
                <{RPG.proposalStatus}> <{STATUS_IRI['pendiente']}> }}""",
            default_graph=[camp.proposals],
        )
        return int(rows[0]["n"].value) if rows else 0

    def detail(self, camp: CampaignHandle, pid: str, lang: str = "es") -> PropuestaDetalle:
        m = self._meta(camp, pid)
        pgraph = self.k.iris.proposal_graph(camp.id, pid)
        labeler = Labeler(self.k.store, camp, lang, extra_graphs=[pgraph])
        summary = self._summary(camp, pid, lang, labeler)
        adds = self._additions(camp, pid, m)
        removes = self._removals(camp, pid)
        errors: list[ErrorValidacion] = []
        if summary.estado == "pendiente":
            target = m[str(RPG.targetGraph)][0].value
            refs = {o.value for _, _, o in adds if isinstance(o, ox.NamedNode)}
            errors = self._validate(camp, target, adds, removes, refs, pgraph, lang)
        return PropuestaDetalle(
            **summary.model_dump(),
            anadidas=labeler.triples(_sort(adds)),
            eliminadas=labeler.triples(removes),
            errores=errors,
        )

    def raw(self, camp: CampaignHandle, pid: str) -> tuple[list[TripletaEntrada], list[TripletaEntrada]]:
        """Tripletas de la propuesta en formato editable."""
        from loregraph.services.triples import to_entrada

        m = self._meta(camp, pid)
        return [to_entrada(t) for t in self._additions(camp, pid, m)], [to_entrada(t) for t in self._removals(camp, pid)]

    # -------------------------------------------------------------- revisión
    def approve(self, camp: CampaignHandle, pid: str, revision: RevisionEntrada, reviewer: Actor,
                lang: str = "es") -> PropuestaResumen:
        m = self._meta(camp, pid)
        status = STATUS.get(m[str(RPG.proposalStatus)][0].value)
        if status != "pendiente":
            raise Conflict(f"La propuesta ya está {status}")
        target = m[str(RPG.targetGraph)][0].value
        pgraph = self.k.iris.proposal_graph(camp.id, pid)
        adds = self.k.store.graph_triples(pgraph)
        removes = self._removals(camp, pid)
        edited = revision.anadir is not None or revision.eliminar is not None
        if edited:
            resolver = TripleResolver(camp, lang=lang)
            errs: list[ErrorValidacion] = []
            if revision.anadir is not None:
                adds, e1 = resolver.resolve_all(revision.anadir)
                errs.extend(e1)
            if revision.eliminar is not None:
                removes, e2 = resolver.resolve_all(revision.eliminar)
                errs.extend(e2)
            if errs:
                from loregraph.errors import ValidationFailed

                raise ValidationFailed(errs)
        refs = {o.value for _, _, o in adds if isinstance(o, ox.NamedNode)}
        errors = self._validate(camp, target, adds, removes, refs, None if edited else pgraph, lang)
        if errors:
            from loregraph.errors import ValidationFailed

            raise ValidationFailed(errors)
        request = m.get(str(RPG.request))
        prop_iri = self.k.iris.proposal(camp.id, pid)
        about = {self._owner(s.value) for s, _, _ in [*adds, *removes] if isinstance(s, ox.NamedNode)}  # type: ignore[union-attr]
        actor = Actor(tipo=reviewer.tipo, nombre=reviewer.nombre,
                      peticion=request[0].value if request else None)
        self._set_status(camp, pid, "aprobada", revision.nota)
        self.k.provenance.commit(camp, actor, removes={target: removes}, adds={target: adds}, about=about,
                                 proposal_iri=prop_iri)
        self.k.store.drop_graph(pgraph)
        return self._summary(camp, pid, lang)

    def reject(self, camp: CampaignHandle, pid: str, nota: str | None, lang: str = "es") -> PropuestaResumen:
        m = self._meta(camp, pid)
        status = STATUS.get(m[str(RPG.proposalStatus)][0].value)
        if status != "pendiente":
            raise Conflict(f"La propuesta ya está {status}")
        self._set_status(camp, pid, "rechazada", nota)
        return self._summary(camp, pid, lang)

    def _set_status(self, camp: CampaignHandle, pid: str, status: str, nota: str | None) -> None:
        prop = nn(self.k.iris.proposal(camp.id, pid))
        old = list(self.k.store.triples(prop, nn(str(RPG.proposalStatus)), None, camp.proposals))
        adds: list[Triple] = [
            (prop, nn(str(RPG.proposalStatus)), nn(STATUS_IRI[status])),
            (prop, nn(str(PROV.invalidatedAtTime)), now_literal()),
        ]
        if nota:
            adds.append((prop, nn(str(RPG.reviewNote)), lit(nota)))
        self.k.store.apply({camp.proposals: old}, {camp.proposals: adds})

    def approve_batch(self, camp: CampaignHandle, ids: list[str], nota: str | None, reviewer: Actor,
                      lang: str = "es") -> ResultadoLote:
        from loregraph.errors import DomainError, ValidationFailed

        ok: list[str] = []
        failed: dict[str, list[ErrorValidacion]] = {}
        for pid in ids:
            try:
                self.approve(camp, pid, RevisionEntrada(nota=nota), reviewer, lang)
                ok.append(pid)
            except ValidationFailed as exc:
                failed[pid] = exc.errors
            except DomainError as exc:
                failed[pid] = [ErrorValidacion(mensaje=exc.message)]
        return ResultadoLote(aprobadas=ok, fallidas=failed)


def _sort(triples: list[Triple]) -> list[Triple]:
    return sorted(triples, key=lambda t: (str(t[0]), t[1].value != str(RDF.type), str(t[1])))  # type: ignore[union-attr]
