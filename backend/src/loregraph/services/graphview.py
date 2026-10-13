"""Vista de grafo (formato apto para Cytoscape) con filtros y vista epistémica."""

from __future__ import annotations

import hashlib
from collections import defaultdict, deque
from typing import TYPE_CHECKING

import pyoxigraph as ox

from loregraph.errors import BadRequest
from loregraph.models import AristaGrafo, Grafo, NodoGrafo
from loregraph.namespaces import RDF, RPG
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler
from loregraph.store.terms import nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

#: Propiedades que no se dibujan como aristas.
SKIP_EDGE_PROPS = {str(RDF.type), str(RPG.relatedTo), str(RPG.hasRelationship), str(RPG.inCampaign),
                   str(RPG.hasHistory), str(RPG.hasDepiction), str(RPG.mapImage), str(RPG.hasMarker)}


class GraphViewService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    def graph(
        self,
        camp: CampaignHandle,
        lang: str = "es",
        tipos: list[str] | None = None,
        faccion: str | None = None,
        centro: str | None = None,
        profundidad: int = 1,
        relaciones: list[str] | None = None,
        vista: str | None = None,
        sesion: int | None = None,
        incluir_sesiones: bool = False,
        limite: int = 2000,
    ) -> Grafo:
        ctx = camp.ctx
        entity_classes = ctx.subclasses(str(RPG.Entity))
        session_classes = ctx.subclasses(str(RPG.Session))

        # ------------------------------------------------------------- aristas
        epistemic: dict[tuple[str, str, str], str] = {}
        if vista:
            _, kgraph = self.k.knowledge.graph_for(camp, vista)
            belief_triples = self.k.store.graph_triples(kgraph)
            for (s, p, o), estado, _ in self.k.knowledge.classify(camp, belief_triples):
                if isinstance(o, ox.NamedNode):
                    epistemic[(s.value, p.value, o.value)] = estado  # type: ignore[union-attr]
            edge_rows = [(s.value, p.value, o.value) for s, p, o in belief_triples  # type: ignore[union-attr]
                         if isinstance(o, ox.NamedNode) and isinstance(s, ox.NamedNode)]
            graphs_for_types = [camp.canon, kgraph, *camp.module_graphs]
        else:
            rows = self.k.store.select(
                "SELECT ?s ?p ?o WHERE { ?s ?p ?o . FILTER (isIRI(?o) && isIRI(?s)) }",
                default_graph=[camp.canon, camp.derived],
            )
            edge_rows = [(r["s"].value, r["p"].value, r["o"].value) for r in rows]
            graphs_for_types = [camp.canon, *camp.module_graphs]

        type_rows = self.k.store.select("SELECT ?s ?t WHERE { ?s a ?t }", default_graph=graphs_for_types)
        types: dict[str, list[str]] = defaultdict(list)
        for r in type_rows:
            if isinstance(r["s"], ox.NamedNode):
                types[r["s"].value].append(r["t"].value)

        def is_entity(iri: str) -> bool:
            ts = types.get(iri, [])
            if not any(t in entity_classes for t in ts):
                return False
            if not incluir_sesiones and any(t in session_classes for t in ts):
                return False
            return True

        edges: list[AristaGrafo] = []
        rel_styles = ctx.relation_styles
        labeler = Labeler(self.k.store, camp, lang, extra_graphs=graphs_for_types[1:2] if vista else ())

        # Relaciones cualificadas (con filtro temporal por sesión)
        if not vista:
            q_rows = self.k.store.select(
                f"""PREFIX rpg: <{RPG}> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
                SELECT ?r ?a ?b ?type ?str ?from ?until WHERE {{
                    ?r a/rdfs:subClassOf* rpg:Relationship ; rpg:source ?a ; rpg:target ?b .
                    OPTIONAL {{ ?r rpg:relationshipType ?type }}
                    OPTIONAL {{ ?r rpg:strength ?str }}
                    OPTIONAL {{ ?r rpg:validFrom/rpg:sessionNumber ?from }}
                    OPTIONAL {{ ?r rpg:validUntil/rpg:sessionNumber ?until }}
                }}""",
                default_graph=[camp.canon, *camp.module_graphs],
            )
            seen_q: set[str] = set()
            for r in q_rows:
                node = r["r"].value
                if node in seen_q:
                    continue
                seen_q.add(node)
                if sesion is not None:
                    frm = _int(r.get("from"))
                    until = _int(r.get("until"))
                    if (frm is not None and frm > sesion) or (until is not None and sesion >= until):
                        continue
                elif "until" in r:
                    continue  # sin sesión: solo el estado actual
                key = r["type"].value if "type" in r else str(RPG.relatedTo)
                st = rel_styles.get(key)
                edges.append(AristaGrafo(
                    id=_hash(node), origen=r["a"].value, destino=r["b"].value,
                    propiedad=ctx.compact(key), etiqueta=ctx.label(key, lang), cualificada=True,
                    intensidad=_int(r.get("str")),
                    color=st.color if st else None, linea=st.linea if st else None, ancho=st.ancho if st else None,
                ))

        # Estado en la sesión N: las propiedades temporales con historia toman los
        # valores vigentes entonces (que pueden no ser los actuales).
        if sesion is not None and not vista:
            state = self.k.temporal.state_at(camp, sesion)
            edge_rows = [(s, p, o) for s, p, o in edge_rows if (s, p) not in state]
            edge_rows += [(s, p, v.value) for (s, p), vals in state.items() for v in vals if isinstance(v, ox.NamedNode)]

        seen_e: set[tuple[str, str, str]] = set()
        for s, p, o in edge_rows:
            if p in SKIP_EDGE_PROPS or (s, p, o) in seen_e:
                continue
            if p == str(RPG.knows) and (o, p, s) in seen_e:
                continue  # simétrica: una sola arista
            seen_e.add((s, p, o))
            st = rel_styles.get(p)
            edges.append(AristaGrafo(
                id=_hash(f"{s}|{p}|{o}"), origen=s, destino=o, propiedad=ctx.compact(p),
                etiqueta=ctx.label(p, lang),
                color=st.color if st else None, linea=st.linea if st else None, ancho=st.ancho if st else None,
                estadoEpistemico=epistemic.get((s, p, o)) if vista else None,  # type: ignore[arg-type]
            ))

        # --------------------------------------------------------------- nodos
        node_iris = {i for i in types if is_entity(i) and self.k.iris.entity_id(i) is not None}
        if vista:
            node_iris = {e.origen for e in edges} | {e.destino for e in edges}
            node_iris = {i for i in node_iris if is_entity(i) or i in types}
        # entidades de vocabulario solo si aparecen en aristas
        endpoint_iris = {e.origen for e in edges} | {e.destino for e in edges}
        node_iris |= {i for i in endpoint_iris if is_entity(i)}
        edges = [e for e in edges if e.origen in node_iris and e.destino in node_iris]

        # ---------------------------------------------------------- filtros
        if relaciones:
            keep = set(relaciones)
            edges = [e for e in edges if e.propiedad in keep]
        if tipos:
            try:
                wanted = {ctx.expand(t) for t in tipos}
            except KeyError as exc:
                raise BadRequest(str(exc)) from exc
            node_iris = {
                i for i in node_iris
                if any(w in ctx.superclasses(t) for t in types.get(i, []) for w in wanted)
            }
        if faccion:
            f_iri = camp.entity_iri(faccion)
            members = {f_iri}
            frontier = [f_iri]
            while frontier:  # incluye subfacciones
                cur = frontier.pop()
                for e in edges:
                    if e.destino == cur and e.propiedad == "rpg:memberOf" and e.origen not in members:
                        members.add(e.origen)
                        frontier.append(e.origen)
            node_iris &= members | {f_iri}
        edges = [e for e in edges if e.origen in node_iris and e.destino in node_iris]
        if centro:
            c_iri = camp.entity_iri(centro)
            adj: dict[str, set[str]] = defaultdict(set)
            for e in edges:
                adj[e.origen].add(e.destino)
                adj[e.destino].add(e.origen)
            reach = {c_iri}
            dq: deque[tuple[str, int]] = deque([(c_iri, 0)])
            while dq:
                cur, d = dq.popleft()
                if d >= profundidad:
                    continue
                for nb in adj[cur]:
                    if nb not in reach:
                        reach.add(nb)
                        dq.append((nb, d + 1))
            node_iris &= reach
            if c_iri in types:
                node_iris.add(c_iri)
            edges = [e for e in edges if e.origen in node_iris and e.destino in node_iris]

        truncated = len(node_iris) > limite
        if truncated:
            degree: dict[str, int] = defaultdict(int)
            for e in edges:
                degree[e.origen] += 1
                degree[e.destino] += 1
            node_iris = set(sorted(node_iris, key=lambda i: -degree[i])[:limite])
            edges = [e for e in edges if e.origen in node_iris and e.destino in node_iris]

        labeler.preload(node_iris)
        nodes = []
        node_state: dict[str, str] = {}
        if vista:
            for (s, _, o), est in epistemic.items():
                for x in (s, o):
                    if est == "falso" or node_state.get(x) is None:
                        node_state[x] = est
        for iri in node_iris:
            ts = types.get(iri, [])
            primary = ctx.primary_type(ts) if ts else None
            style = ctx.style_for_types(ts) if ts else None
            nodes.append(NodoGrafo(
                id=camp.entity_id(iri) or iri, iri=iri, etiqueta=labeler.label(iri),
                tipo=ctx.compact(primary) if primary else None,
                clases=[ctx.compact(t) for t in ts],
                color=style.color if style else None, forma=style.forma if style else None,
                icono=style.icono if style else None,
                estadoEpistemico=(  # type: ignore[arg-type]
                    ("desconocido" if not self._in_canon(camp, iri) else node_state.get(iri)) if vista else None
                ),
            ))
        id_of = {n.iri: n.id for n in nodes}
        for e in edges:
            e.origen = id_of[e.origen]
            e.destino = id_of[e.destino]
        nodes.sort(key=lambda n: n.etiqueta.lower())
        return Grafo(nodos=nodes, aristas=edges, truncado=truncated)

    def _in_canon(self, camp: CampaignHandle, iri: str) -> bool:
        return next(self.k.store.triples(nn(iri), None, None, camp.canon), None) is not None


def _int(term: object) -> int | None:
    if term is None:
        return None
    try:
        return int(term.value)  # type: ignore[attr-defined]
    except (ValueError, AttributeError):
        return None


def _hash(text: str) -> str:
    return hashlib.sha1(text.encode()).hexdigest()[:12]
