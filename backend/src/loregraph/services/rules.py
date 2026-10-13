"""Reglas SPARQL CONSTRUCT de los módulos: generan el grafo ``<campaña>/derived``."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from loregraph.services.kernel import CampaignHandle

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

log = logging.getLogger(__name__)


class RulesService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    def recompute(self, camp: CampaignHandle) -> int:
        """Ejecuta todas las reglas de los módulos activos y reemplaza el grafo derivado.

        Las reglas leen el canon y los vocabularios (no lo derivado, para evitar
        dependencias circulares). Devuelve el número de tripletas derivadas.
        """
        source = [camp.canon, *camp.module_graphs]
        derived: dict[tuple[str, str, str], tuple] = {}
        for mod in camp.ctx.modules:
            for rule in mod.rules:
                try:
                    for t in self.k.store.query(rule.consulta, default_graph=source):
                        key = (str(t.subject), str(t.predicate), str(t.object))
                        derived[key] = (t.subject, t.predicate, t.object)
                except (SyntaxError, OSError) as exc:
                    log.error("Regla %s/%s falló: %s", mod.id, rule.nombre, exc)
        self.k.store.replace_graph(camp.derived, derived.values())
        return len(derived)
