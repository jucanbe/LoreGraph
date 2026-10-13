"""Acuñación de IRIs para campañas, entidades, grafos con nombre y agentes.

Esquema (con ``base`` = ``<base_iri>/data/``)::

    <base>campaign/<cid>                    campaña
    <base>campaign/<cid>/entity/<eid>       entidad
    <base>campaign/<cid>/canon              grafo canónico
    <base>campaign/<cid>/derived            grafo derivado por reglas
    <base>campaign/<cid>/provenance         registro de cambios
    <base>campaign/<cid>/proposals          metadatos de propuestas
    <base>campaign/<cid>/proposals/<pid>    tripletas de una propuesta
    <base>campaign/<cid>/knowledge/<eid>    creencias de un personaje
    <base>module/<mid>/<kind>               ontología, vocabulario y formas de un módulo
    <base>catalog                           catálogo de campañas
"""

from __future__ import annotations

import re
import secrets
import unicodedata
from dataclasses import dataclass

_SLUG_RE = re.compile(r"[^a-z0-9]+")
ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")


def slugify(text: str, max_len: int = 40) -> str:
    """Convierte un texto en un identificador ASCII en minúsculas con guiones."""
    norm = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    slug = _SLUG_RE.sub("-", norm.lower()).strip("-")
    return (slug[:max_len].rstrip("-")) or "entidad"


def new_suffix(n: int = 3) -> str:
    return secrets.token_hex(n)


@dataclass(frozen=True)
class Iris:
    """Fábrica de IRIs a partir de la IRI base de datos."""

    data_base: str

    # --- Catálogo y módulos ---
    @property
    def catalog_graph(self) -> str:
        return f"{self.data_base}catalog"

    def module_graph(self, module_id: str, kind: str) -> str:
        return f"{self.data_base}module/{module_id}/{kind}"

    # --- Campañas ---
    def campaign(self, cid: str) -> str:
        return f"{self.data_base}campaign/{cid}"

    def campaign_id(self, iri: str) -> str | None:
        prefix = f"{self.data_base}campaign/"
        if not iri.startswith(prefix):
            return None
        return iri[len(prefix):].split("/", 1)[0]

    def entity(self, cid: str, eid: str) -> str:
        return f"{self.campaign(cid)}/entity/{eid}"

    def entity_id(self, iri: str) -> str | None:
        """Identificador local de una entidad de campaña, o None si no lo es."""
        prefix = f"{self.data_base}campaign/"
        if not iri.startswith(prefix):
            return None
        rest = iri[len(prefix):].split("/")
        if len(rest) >= 3 and rest[1] == "entity":
            return "/".join(rest[2:])
        return None

    def is_campaign_data(self, iri: str) -> bool:
        return iri.startswith(self.data_base)

    def canon(self, cid: str) -> str:
        return f"{self.campaign(cid)}/canon"

    def derived(self, cid: str) -> str:
        return f"{self.campaign(cid)}/derived"

    def provenance(self, cid: str) -> str:
        return f"{self.campaign(cid)}/provenance"

    def proposals(self, cid: str) -> str:
        return f"{self.campaign(cid)}/proposals"

    def proposal_graph(self, cid: str, pid: str) -> str:
        return f"{self.campaign(cid)}/proposals/{pid}"

    def proposal(self, cid: str, pid: str) -> str:
        return f"{self.campaign(cid)}/proposal/{pid}"

    def knowledge(self, cid: str, eid: str) -> str:
        return f"{self.campaign(cid)}/knowledge/{eid}"

    def knowledge_prefix(self, cid: str) -> str:
        return f"{self.campaign(cid)}/knowledge/"

    def change(self, cid: str, chid: str) -> str:
        return f"{self.campaign(cid)}/change/{chid}"

    # --- Agentes ---
    def human(self, name: str) -> str:
        return f"{self.data_base}agent/human/{slugify(name)}"

    def ai_agent(self, name: str) -> str:
        return f"{self.data_base}agent/ai/{slugify(name)}"
