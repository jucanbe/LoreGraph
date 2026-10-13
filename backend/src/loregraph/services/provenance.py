"""Procedencia PROV-O: cada escritura queda registrada como un ``rpg:Change``.

El registro guarda las tripletas añadidas y eliminadas (reificadas con
``rdf:Statement``) en el grafo ``<campaña>/provenance``. El canon queda limpio.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pyoxigraph as ox

from loregraph.models import Actor, CambioInfo
from loregraph.namespaces import PROV, RDF, RDFS, RPG, XSD
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.store.terms import OxTerm, lit, nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

Triple = tuple[OxTerm, OxTerm, OxTerm]
TYPE = nn(str(RDF.type))


def _visible(triples: list[Triple]) -> list[Triple]:
    """Sin la historia temporal que añade el sistema (se ve en su propia vista)."""
    return [t for t in triples if "/n/h-" not in str(t[0]) and t[1].value != str(RPG.hasHistory)]  # type: ignore[union-attr]


def now_literal() -> ox.Literal:
    # Microsegundos: los cambios hechos en el mismo segundo conservan su orden.
    return ox.Literal(datetime.now(UTC).isoformat(timespec="microseconds"), datatype=nn(str(XSD.dateTime)))


class ProvenanceService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    # --------------------------------------------------------------- agentes
    def agent_iri(self, actor: Actor) -> str:
        return self.k.iris.ai_agent(actor.nombre) if actor.tipo == "agente" else self.k.iris.human(actor.nombre)

    def agent_triples(self, actor: Actor) -> list[Triple]:
        a = nn(self.agent_iri(actor))
        cls = RPG.AIAgent if actor.tipo == "agente" else RPG.HumanUser
        return [(a, TYPE, nn(str(cls))), (a, nn(str(RDFS.label)), lit(actor.nombre))]

    # ---------------------------------------------------------------- commit
    def commit(
        self,
        camp: CampaignHandle,
        actor: Actor,
        removes: dict[str, Iterable[Triple]] | None = None,
        adds: dict[str, Iterable[Triple]] | None = None,
        about: Iterable[str] = (),
        proposal_iri: str | None = None,
        extra: dict[str, Iterable[Triple]] | None = None,
        track_time: bool = True,
        reverts: str | None = None,
    ) -> str | None:
        """Aplica un cambio atómico y registra su procedencia.

        ``extra`` son tripletas adicionales que se escriben sin registrarse como
        cambio (p. ej. metadatos de propuestas). Con ``track_time`` se añade la
        historia de las propiedades temporales (ver :mod:`loregraph.services.temporal`).
        ``reverts`` es la IRI del cambio que este deshace. Devuelve la IRI del
        cambio, o None si no había nada que cambiar.
        """
        store = self.k.store
        rem: dict[str, list[Triple]] = defaultdict(list)
        add: dict[str, list[Triple]] = defaultdict(list)
        for g, ts in (removes or {}).items():
            for s, p, o in dict.fromkeys(ts):
                if store.contains(s, p, o, g):
                    rem[g].append((s, p, o))
        for g, ts in (adds or {}).items():
            removed_here = set(rem.get(g, []))
            for s, p, o in dict.fromkeys(ts):
                if (s, p, o) in removed_here:
                    # quitar y volver a poner = no hacer nada
                    rem[g].remove((s, p, o))
                    continue
                if not store.contains(s, p, o, g):
                    add[g].append((s, p, o))
        rem = {g: ts for g, ts in rem.items() if ts}
        add = {g: ts for g, ts in add.items() if ts}
        if track_time and (camp.canon in rem or camp.canon in add):
            history = self.k.temporal.history_triples(camp, rem.get(camp.canon, []), add.get(camp.canon, []))
            new = [t for t in dict.fromkeys(history) if not store.contains(*t, camp.canon)]
            if new:
                add.setdefault(camp.canon, []).extend(new)
                about = [*about, *{t[0].value.split("/n/", 1)[0] for t in new if isinstance(t[0], ox.NamedNode)}]
        extra_adds = {g: list(ts) for g, ts in (extra or {}).items()}
        if not rem and not add and not extra_adds:
            return None

        chid = uuid.uuid4().hex[:16]
        ch = nn(self.k.iris.change(camp.id, chid))
        ts_lit = now_literal()
        prov: list[Triple] = [
            (ch, TYPE, nn(str(RPG.Change))),
            (ch, TYPE, nn(str(PROV.Activity))),
            (ch, nn(str(PROV.wasAssociatedWith)), nn(self.agent_iri(actor))),
            (ch, nn(str(PROV.endedAtTime)), ts_lit),
            *self.agent_triples(actor),
        ]
        if actor.peticion:
            prov.append((ch, nn(str(RPG.request)), lit(actor.peticion)))
        if proposal_iri:
            prov.append((ch, nn(str(PROV.used)), nn(proposal_iri)))
        if reverts:
            prov.append((ch, nn(str(RPG.reverts)), nn(reverts)))
        for e in set(about):
            prov.append((ch, nn(str(RPG.aboutEntity)), nn(e)))
        n = 0
        for kind, data in ((RPG.added, add), (RPG.removed, rem)):
            for g, triples in data.items():
                prov.append((ch, nn(str(RPG.targetGraph)), nn(g)))
                for s, p, o in triples:
                    n += 1
                    st = nn(f"{ch.value}#s{n}")
                    prov.extend([
                        (ch, nn(str(kind)), st),
                        (st, TYPE, nn(str(RDF.Statement))),
                        (st, nn(str(RDF.subject)), s),
                        (st, nn(str(RDF.predicate)), p),
                        (st, nn(str(RDF.object)), o),
                        (st, nn(str(RPG.targetGraph)), nn(g)),
                    ])
        all_adds: dict[str, list[Triple]] = defaultdict(list)
        for g, ts in add.items():
            all_adds[g].extend(ts)
        for g, ts in extra_adds.items():
            all_adds[g].extend(ts)
        all_adds[camp.provenance].extend(prov)
        store.apply(rem, all_adds)

        touched_graphs = set(rem) | set(add)
        self.k.campaigns.after_write(camp, touched_graphs, set(about))
        return ch.value

    # ------------------------------------------------------------- historial
    def history(self, camp: CampaignHandle, entity_iri: str | None, lang: str = "es", limit: int = 100,
                offset: int = 0) -> list[CambioInfo]:
        """Cambios de una entidad (o de toda la campaña si ``entity_iri`` es None), del más reciente al más antiguo."""
        rows = self.k.store.select(
            f"""PREFIX prov: <{PROV}> PREFIX rpg: <{RPG}> PREFIX rdfs: <{RDFS}>
            SELECT ?ch ?t ?agent ?agentType ?agentName ?req ?prop ?rev ?revBy WHERE {{
                {f"?ch rpg:aboutEntity <{entity_iri}> ." if entity_iri else "?ch a rpg:Change ."}
                ?ch prov:endedAtTime ?t ;
                    prov:wasAssociatedWith ?agent .
                OPTIONAL {{ ?agent a ?agentType . FILTER (?agentType IN (rpg:AIAgent, rpg:HumanUser)) }}
                OPTIONAL {{ ?agent rdfs:label ?agentName }}
                OPTIONAL {{ ?ch rpg:request ?req }}
                OPTIONAL {{ ?ch prov:used ?prop }}
                OPTIONAL {{ ?ch rpg:reverts ?rev }}
                OPTIONAL {{ ?revBy rpg:reverts ?ch }}
            }} ORDER BY DESC(?t) LIMIT {limit} OFFSET {offset}""",
            default_graph=[camp.provenance],
        )
        labeler = Labeler(self.k.store, camp, lang)
        out: list[CambioInfo] = []
        seen: set[str] = set()
        for r in rows:
            ch = r["ch"].value
            if ch in seen:
                continue
            seen.add(ch)
            added, removed = self.statements(camp, ch)
            is_agent = r.get("agentType") is not None and r["agentType"].value == str(RPG.AIAgent)
            prop = r.get("prop")
            out.append(
                CambioInfo(
                    id=ch.rsplit("/", 1)[-1],
                    fecha=r["t"].value,
                    agente=Actor(
                        tipo="agente" if is_agent else "humano",
                        nombre=r["agentName"].value if "agentName" in r else "?",
                    ),
                    peticion=r["req"].value if "req" in r else None,
                    propuesta=prop.value.rsplit("/", 1)[-1] if prop is not None else None,
                    anadidas=labeler.triples(_visible(added)),
                    eliminadas=labeler.triples(_visible(removed)),
                    deshace=r["rev"].value.rsplit("/", 1)[-1] if "rev" in r else None,
                    deshechoPor=r["revBy"].value.rsplit("/", 1)[-1] if "revBy" in r else None,
                )
            )
        return out

    # --------------------------------------------------------------- deshacer
    def statements_by_graph(self, camp: CampaignHandle, change_iri: str) -> tuple[dict[str, list[Triple]],
                                                                                   dict[str, list[Triple]]]:
        rows = self.k.store.select(
            f"""PREFIX rpg: <{RPG}> PREFIX rdf: <{RDF}>
            SELECT ?kind ?s ?p ?o ?g WHERE {{
                <{change_iri}> ?kind ?st .
                FILTER (?kind IN (rpg:added, rpg:removed))
                ?st rdf:subject ?s ; rdf:predicate ?p ; rdf:object ?o ; rpg:targetGraph ?g .
            }}""",
            default_graph=[camp.provenance],
        )
        added: dict[str, list[Triple]] = defaultdict(list)
        removed: dict[str, list[Triple]] = defaultdict(list)
        for r in rows:
            t = (r["s"], r["p"], r["o"])
            (added if r["kind"].value == str(RPG.added) else removed)[r["g"].value].append(t)
        return added, removed

    def undo(self, camp: CampaignHandle, chid: str, actor: Actor, lang: str = "es") -> str:
        """Deshace un cambio aplicando el inverso, si nada posterior tocó lo mismo."""
        from loregraph.errors import Conflict, NotFound, ValidationFailed

        ch = self.k.iris.change(camp.id, chid)
        meta = self.k.store.select(
            f"""PREFIX rpg: <{RPG}> PREFIX prov: <{PROV}>
            SELECT ?t ?revBy WHERE {{ <{ch}> a rpg:Change ; prov:endedAtTime ?t . OPTIONAL {{ ?revBy rpg:reverts <{ch}> }} }}""",
            default_graph=[camp.provenance],
        )
        if not meta:
            raise NotFound(f"No existe el cambio '{chid}'")
        if "revBy" in meta[0]:
            raise Conflict("Este cambio ya se deshizo")
        added, removed = self.statements_by_graph(camp, ch)
        touched = {(str(s), str(p)) for ts in [*added.values(), *removed.values()] for s, p, _ in ts}
        later = self.k.store.select(
            f"""PREFIX rpg: <{RPG}> PREFIX prov: <{PROV}> PREFIX rdf: <{RDF}>
            SELECT ?s ?p WHERE {{
                ?c a rpg:Change ; prov:endedAtTime ?t2 ; ?kind ?st .
                FILTER (?t2 > "{meta[0]['t'].value}"^^<http://www.w3.org/2001/XMLSchema#dateTime> && ?c != <{ch}>)
                # Los cambios ya deshechos y los propios deshaceres se anulan entre sí.
                FILTER NOT EXISTS {{ ?x rpg:reverts ?c }}
                FILTER NOT EXISTS {{ ?c rpg:reverts ?y }}
                FILTER (?kind IN (rpg:added, rpg:removed))
                ?st rdf:subject ?s ; rdf:predicate ?p .
            }}""",
            default_graph=[camp.provenance],
        )
        clash = [r for r in later if (str(r["s"]), str(r["p"])) in touched]
        if clash:
            raise Conflict("Hay cambios posteriores sobre los mismos datos; deshazlos primero (del más reciente al más antiguo)")
        # Validación SHACL del estado resultante en el canon.
        if camp.canon in added or camp.canon in removed:
            rem_set = set(added.get(camp.canon, []))
            subjects = {str(s.value).split("/n/", 1)[0] for s, _, _ in [*added.get(camp.canon, []),  # type: ignore[union-attr]
                                                                        *removed.get(camp.canon, [])]
                        if isinstance(s, ox.NamedNode)}
            subjects = {s for s in subjects if self.k.iris.entity_id(s) is not None}
            state: list[Triple] = []
            for subj in subjects:
                state += [t for t in self.k.store.triples(nn(subj), None, None, camp.canon) if t not in rem_set]
                state += [t for t in self.k.entities._nested_cbd(subj, camp.canon) if t not in rem_set]
            state += removed.get(camp.canon, [])
            alive = [s for s in subjects if any(t[0].value == s for t in state)]  # type: ignore[union-attr]
            refs = {o.value for _, _, o in state if isinstance(o, ox.NamedNode)}
            errors = [e for e in self.k.entities.validate_state(camp, state, alive, refs, lang)
                      if e.severidad == "violacion"] if alive else []
            if errors:
                raise ValidationFailed(errors, "Deshacer dejaría datos no válidos")
        about = {str(s.value).split("/n/", 1)[0] for ts in [*added.values(), *removed.values()]  # type: ignore[union-attr]
                 for s, _, _ in ts if isinstance(s, ox.NamedNode)}
        undo_actor = Actor(tipo=actor.tipo, nombre=actor.nombre, peticion=f"Deshacer el cambio {chid}")
        new = self.commit(camp, undo_actor, removes=dict(added), adds=dict(removed), about=about,
                          track_time=False, reverts=ch)
        if new is None:
            raise Conflict("No hay nada que deshacer: los datos ya no coinciden con el cambio")
        return new

    def statements(self, camp: CampaignHandle, change_iri: str) -> tuple[list[Triple], list[Triple]]:  # noqa: D102
        rows = self.k.store.select(
            f"""PREFIX rpg: <{RPG}> PREFIX rdf: <{RDF}>
            SELECT ?kind ?s ?p ?o WHERE {{
                <{change_iri}> ?kind ?st .
                FILTER (?kind IN (rpg:added, rpg:removed))
                ?st rdf:subject ?s ; rdf:predicate ?p ; rdf:object ?o .
            }}""",
            default_graph=[camp.provenance],
        )
        added: list[Triple] = []
        removed: list[Triple] = []
        for r in rows:
            t = (r["s"], r["p"], r["o"])
            (added if r["kind"].value == str(RPG.added) else removed).append(t)
        return added, removed
