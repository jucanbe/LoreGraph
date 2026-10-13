"""Detector de incoherencias del mundo.

Cada módulo (y el núcleo) aporta comprobaciones en `checks/*.rq`: consultas
SELECT que devuelven ``?entidad`` y, opcionalmente, ``?mensaje`` y una o varias
``?relacionada``. Se ejecutan sobre el canon, lo derivado y las ontologías.
Las incoherencias que la persona marca como intencionadas se guardan como
«ignoradas» en la base de datos auxiliar.
"""

from __future__ import annotations

import hashlib
import logging
from collections import defaultdict
from typing import TYPE_CHECKING, Literal

import pyoxigraph as ox

from loregraph.apimodel import ApiModel
from loregraph.models import EntidadRef
from loregraph.services.kernel import CampaignHandle
from loregraph.services.labels import Labeler

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

log = logging.getLogger(__name__)


class Incoherencia(ApiModel):
    id: str
    regla: str
    titulo: str
    descripcion: str
    severidad: Literal["error", "aviso"]
    mensajes: list[str]
    entidad: EntidadRef
    relacionadas: list[EntidadRef]
    ignorada: bool = False


class InformeCoherencia(ApiModel):
    incoherencias: list[Incoherencia]
    errores: int
    avisos: int
    ignoradas: int
    reglas: int


class CoherenceService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    def check(self, camp: CampaignHandle, lang: str = "es", include_ignored: bool = False,
              entity: str | None = None) -> InformeCoherencia:
        graphs = [camp.canon, camp.derived, *camp.module_graphs]
        ignored = self.k.aux.ignored_get(camp.id)
        found: dict[str, dict] = {}
        n_rules = 0
        for mod in camp.ctx.modules:
            for chk in mod.checks:
                n_rules += 1
                try:
                    rows = self.k.store.select(chk.consulta, default_graph=graphs)
                except (SyntaxError, OSError) as exc:
                    log.error("Comprobación %s falló: %s", chk.id, exc)
                    continue
                grouped: dict[str, dict] = defaultdict(lambda: {"msgs": [], "rel": []})
                for r in rows:
                    e = r.get("entidad")
                    if not isinstance(e, ox.NamedNode):
                        continue
                    g = grouped[e.value]
                    m = r.get("mensaje")
                    if isinstance(m, ox.Literal) and m.value not in g["msgs"]:
                        g["msgs"].append(m.value)
                    rel = r.get("relacionada")
                    if isinstance(rel, ox.NamedNode) and rel.value != e.value and rel.value not in g["rel"]:
                        g["rel"].append(rel.value)
                for e_iri, g in grouped.items():
                    # Con ids locales (no IRIs) para que las ignoradas sobrevivan a exportar/importar.
                    local = [self._local(camp, x) for x in (e_iri, *sorted(g["rel"]))]
                    ident = hashlib.sha1(f"{chk.id}|{'|'.join(local)}".encode()).hexdigest()[:12]
                    found[ident] = {"chk": chk, "e": e_iri, **g}
        labeler = Labeler(self.k.store, camp, lang)
        labeler.preload([*(f["e"] for f in found.values()), *(x for f in found.values() for x in f["rel"])])
        out: list[Incoherencia] = []
        for ident, f in found.items():
            is_ignored = ident in ignored
            if is_ignored and not include_ignored:
                continue
            if entity and entity != f["e"] and entity not in f["rel"]:
                continue
            chk = f["chk"]
            out.append(Incoherencia(
                id=ident, regla=chk.id, titulo=chk.titulo.get(lang) or chk.titulo["es"], descripcion=chk.descripcion,
                severidad=chk.severidad, mensajes=f["msgs"], entidad=labeler.entity_ref(f["e"]),
                relacionadas=[labeler.entity_ref(x) for x in f["rel"]], ignorada=is_ignored,
            ))
        out.sort(key=lambda i: (i.ignorada, i.severidad != "error", i.titulo, i.entidad.etiqueta.lower()))
        activas = [i for i in out if not i.ignorada]
        return InformeCoherencia(
            incoherencias=out,
            errores=sum(1 for i in activas if i.severidad == "error"),
            avisos=sum(1 for i in activas if i.severidad == "aviso"),
            ignoradas=len(ignored & set(found)),
            reglas=n_rules,
        )

    def _local(self, camp: CampaignHandle, iri: str) -> str:
        return camp.entity_id(iri) or iri

    def ignore(self, camp: CampaignHandle, ident: str, ignored: bool) -> None:
        self.k.aux.ignored_set(camp.id, ident, ignored)
