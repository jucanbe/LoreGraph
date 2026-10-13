"""Sesiones de juego: línea temporal con las entidades que aparecen en cada una."""

from __future__ import annotations

from collections import defaultdict
from typing import TYPE_CHECKING

from loregraph.models import SesionLinea, SesionResumen
from loregraph.namespaces import RPG
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel


class SessionService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    def sessions(self, camp: CampaignHandle, lang: str = "es") -> list[SesionLinea]:
        rows = self.k.store.select(
            f"""PREFIX rpg: <{RPG}>
            SELECT ?s ?n ?date ?world ?notes WHERE {{
                ?s a rpg:Session .
                OPTIONAL {{ ?s rpg:sessionNumber ?n }}
                OPTIONAL {{ ?s rpg:sessionDate ?date }}
                OPTIONAL {{ ?s rpg:inWorldDateLabel ?world }}
                OPTIONAL {{ ?s rpg:sessionNotes ?notes }}
            }}""",
            default_graph=[camp.canon],
        )
        appear = self.k.store.select(
            f"SELECT ?e ?s WHERE {{ ?e <{RPG.appearsInSession}> ?s }}", default_graph=[camp.canon]
        )
        by_session: dict[str, list[str]] = defaultdict(list)
        for r in appear:
            by_session[r["s"].value].append(r["e"].value)
        labeler = Labeler(self.k.store, camp, lang)
        labeler.preload([*(r["s"].value for r in rows), *(e for es in by_session.values() for e in es)])
        out: list[SesionLinea] = []
        seen: set[str] = set()
        for r in rows:
            iri = r["s"].value
            if iri in seen:
                continue
            seen.add(iri)
            num = None
            if "n" in r:
                try:
                    num = int(r["n"].value)
                except ValueError:
                    num = None
            ents = sorted(
                (labeler.entity_ref(e) for e in dict.fromkeys(by_session.get(iri, []))),
                key=lambda x: ((x.tipo.clave if x.tipo else ""), x.etiqueta.lower()),
            )
            out.append(
                SesionLinea(
                    sesion=SesionResumen(
                        entidad=labeler.entity_ref(iri),
                        numero=num,
                        fecha=r["date"].value if "date" in r else None,
                        fechaMundo=r["world"].value if "world" in r else None,
                        notas=r["notes"].value if "notes" in r else None,
                    ),
                    entidades=ents,
                )
            )
        out.sort(key=lambda s: (s.sesion.numero if s.sesion.numero is not None else 1 << 30, s.sesion.fecha or ""))
        return out
