"""Temporalidad completa de las propiedades marcadas con ``rpg:isTemporal``.

La tripleta directa (``:lucia rpg:locatedIn :madrid``) es siempre el **estado
actual**. Cada vez que cambia, se guarda la historia en hechos con vigencia
(``rpg:TemporalStatement`` o la subclase de ``rpg:qualifiedBy``), anidados en la
entidad (``<entidad>/n/h-…``) y enlazados con ``rpg:hasHistory``:

* al **añadir** un valor se abre un hecho ``validFrom`` = sesión actual;
* al **quitar** un valor se cierra su hecho abierto con ``validUntil`` = sesión
  actual (si no había hecho —datos antiguos o de ejemplo— se crea uno ya cerrado).

La «sesión actual» es la elegida en los ajustes de la campaña o, si no, la de
número más alto. Sin sesiones no se registra historia.

Consulta del estado en la sesión N: un valor está vigente si
``desde ≤ N < hasta`` (los extremos que faltan no limitan). Para (sujeto,
propiedad) sin historia se usa la tripleta directa.
"""

from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass
from typing import TYPE_CHECKING

import pyoxigraph as ox

from loregraph.namespaces import RDF, RPG
from loregraph.services.kernel import CampaignHandle
from loregraph.store.terms import OxTerm, nn

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

Triple = tuple[OxTerm, OxTerm, OxTerm]
TYPE = nn(str(RDF.type))
HAS_HISTORY = str(RPG.hasHistory)


@dataclass
class HistoryRow:
    nodo: str
    sujeto: str
    propiedad: str
    valor: OxTerm
    desde: str | None
    desde_n: int | None
    hasta: str | None
    hasta_n: int | None

    def valid_at(self, n: int) -> bool:
        return (self.desde_n is None or self.desde_n <= n) and (self.hasta_n is None or n < self.hasta_n)


class TemporalService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    # ------------------------------------------------------------- escritura
    def _temporal(self, camp: CampaignHandle, prop: str) -> bool:
        return camp.ctx.is_temporal(prop)

    def _fact_class(self, camp: CampaignHandle, prop: str) -> str:
        from rdflib import URIRef

        q = next(iter(camp.ctx.ont.objects(URIRef(prop), RPG.qualifiedBy)), None)
        if q is not None and camp.ctx.is_subclass(str(q), str(RPG.TemporalStatement)):
            return str(q)
        return str(RPG.TemporalStatement)

    def _is_owner(self, camp: CampaignHandle, iri: str) -> bool:
        return self.k.iris.entity_id(iri) is not None and "/n/" not in iri

    def history_triples(self, camp: CampaignHandle, removes: list[Triple], adds: list[Triple]) -> list[Triple]:
        """Tripletas de historia que acompañan a un cambio del canon (ya filtrado)."""
        temporal_rem = [t for t in removes if isinstance(t[0], ox.NamedNode) and self._temporal(camp, t[1].value)  # type: ignore[union-attr]
                        and self._is_owner(camp, t[0].value)]
        # Las entidades nuevas no abren historia: su estado inicial es la línea base.
        temporal_add = [t for t in adds if isinstance(t[0], ox.NamedNode) and self._temporal(camp, t[1].value)  # type: ignore[union-attr]
                        and self._is_owner(camp, t[0].value) and self._exists(camp, t[0])]  # type: ignore[arg-type]
        if not temporal_rem and not temporal_add:
            return []
        session = self.k.campaign_settings.current_session(camp)
        if session is None:
            return []
        sess = nn(session)
        out: list[Triple] = []
        for s, p, o in temporal_rem:
            open_nodes = self._open_statements(camp, s.value, p.value, o)  # type: ignore[union-attr]
            if open_nodes:
                out.extend((n, nn(str(RPG.validUntil)), sess) for n in open_nodes)
            else:
                # Valor sin historia (anterior a la temporalidad): se registra ya cerrado.
                node = self._node(s.value, p.value, o, "c", session)  # type: ignore[union-attr]
                out.extend(self._statement(camp, node, s, p, o))  # type: ignore[arg-type]
                out.append((node, nn(str(RPG.validUntil)), sess))
        for s, p, o in temporal_add:
            node = self._node(s.value, p.value, o, "a", session)  # type: ignore[union-attr]
            out.extend(self._statement(camp, node, s, p, o))  # type: ignore[arg-type]
            out.append((node, nn(str(RPG.validFrom)), sess))
        return out

    def _exists(self, camp: CampaignHandle, s: ox.NamedNode) -> bool:
        return next(self.k.store.triples(s, TYPE, None, camp.canon), None) is not None

    def _node(self, s: str, p: str, o: OxTerm, kind: str, session: str) -> ox.NamedNode:
        h = hashlib.sha1(f"{p}|{o}|{kind}|{session}".encode()).hexdigest()[:10]
        return nn(f"{s}/n/h-{h}")

    def _statement(self, camp: CampaignHandle, node: ox.NamedNode, s: ox.NamedNode, p: ox.NamedNode,
                   o: OxTerm) -> list[Triple]:
        return [
            (s, nn(HAS_HISTORY), node),
            (node, TYPE, nn(self._fact_class(camp, p.value))),
            (node, nn(str(RPG.source)), s),
            (node, nn(str(RPG.property)), p),
            (node, nn(str(RPG.value)), o),
        ]

    def _open_statements(self, camp: CampaignHandle, s: str, p: str, o: OxTerm) -> list[ox.NamedNode]:
        rows = self.k.store.select(
            f"""SELECT ?h WHERE {{
                <{s}> <{HAS_HISTORY}> ?h .
                ?h <{RPG.property}> <{p}> ; <{RPG.value}> {o} .
                FILTER NOT EXISTS {{ ?h <{RPG.validUntil}> ?u }}
            }}""",
            default_graph=[camp.canon],
        )
        return [r["h"] for r in rows if isinstance(r["h"], ox.NamedNode)]

    # --------------------------------------------------------------- lectura
    def history(self, camp: CampaignHandle, subject: str | None = None) -> list[HistoryRow]:
        values = f"VALUES ?s {{ <{subject}> }}" if subject else ""
        rows = self.k.store.select(
            f"""PREFIX rpg: <{RPG}>
            SELECT ?h ?s ?p ?v ?d ?dn ?u ?un WHERE {{
                {values}
                ?s rpg:hasHistory ?h .
                ?h rpg:property ?p ; rpg:value ?v .
                OPTIONAL {{ ?h rpg:validFrom ?d . OPTIONAL {{ ?d rpg:sessionNumber ?dn }} }}
                OPTIONAL {{ ?h rpg:validUntil ?u . OPTIONAL {{ ?u rpg:sessionNumber ?un }} }}
            }}""",
            default_graph=[camp.canon],
        )
        out = []
        for r in rows:
            out.append(HistoryRow(
                nodo=r["h"].value, sujeto=r["s"].value, propiedad=r["p"].value, valor=r["v"],
                desde=r["d"].value if "d" in r else None, desde_n=_int(r.get("dn")),
                hasta=r["u"].value if "u" in r else None, hasta_n=_int(r.get("un")),
            ))
        out.sort(key=lambda h: (h.propiedad, h.desde_n if h.desde_n is not None else -1))
        return out

    def state_at(self, camp: CampaignHandle, n: int) -> dict[tuple[str, str], list[OxTerm]]:
        """Valores vigentes en la sesión N para cada (sujeto, propiedad) con historia."""
        out: dict[tuple[str, str], list[OxTerm]] = defaultdict(list)
        seen: set[tuple[str, str]] = set()
        for h in self.history(camp):
            key = (h.sujeto, h.propiedad)
            seen.add(key)
            if h.valid_at(n):
                out[key].append(h.valor)
        return {k: out.get(k, []) for k in seen}


def _int(term: object) -> int | None:
    if term is None:
        return None
    try:
        return int(term.value)  # type: ignore[attr-defined]
    except (ValueError, AttributeError):
        return None
