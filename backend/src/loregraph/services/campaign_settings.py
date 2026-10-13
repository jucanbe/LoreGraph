"""Ajustes propios de cada campaña: lore para la IA, asistente y sesión actual.

Se guardan en la base de datos auxiliar (no son hechos del mundo) y viajan en
la exportación de la campaña.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import Field

from loregraph.apimodel import ApiModel
from loregraph.errors import BadRequest
from loregraph.namespaces import RPG
from loregraph.services.kernel import CampaignHandle

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel


class LoreCampana(ApiModel):
    """Contexto propio de la crónica para los modelos de lenguaje."""

    resumen: str = Field(default="", max_length=8000, description="Premisa, historia reciente y situación actual.")
    tono: str = Field(default="", max_length=2000)
    reglasCasa: list[str] = Field(default_factory=list, description="Reglas de la casa o ajustes al sistema.")
    evitar: list[str] = Field(default_factory=list, description="Temas o elementos que no deben aparecer.")
    notas: str = Field(default="", max_length=8000, description="Otros datos útiles para la IA.")


class AsistenteCampana(ApiModel):
    """Preferencias del asistente para esta campaña (si faltan, se usan los ajustes generales)."""

    modelo: str | None = Field(default=None, max_length=200)
    contextoTokens: int | None = Field(default=None, ge=512, le=2_000_000)


class AjustesCampana(ApiModel):
    lore: LoreCampana = Field(default_factory=LoreCampana)
    asistente: AsistenteCampana = Field(default_factory=AsistenteCampana)
    sesionActual: str | None = Field(
        default=None,
        description="Id de la sesión en curso; los cambios temporales se fechan en ella. "
                    "Si falta, se usa la de número más alto.",
    )


class CampaignSettingsService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel

    def get(self, camp: CampaignHandle) -> AjustesCampana:
        raw = self.k.aux.campaign_settings_get(camp.id)
        return AjustesCampana.model_validate(raw) if raw else AjustesCampana()

    def set(self, camp: CampaignHandle, ajustes: AjustesCampana) -> AjustesCampana:
        if ajustes.sesionActual:
            iri = camp.entity_iri(ajustes.sesionActual)
            if not self.k.store.query(f"ASK {{ <{iri}> a <{RPG.Session}> }}", default_graph=[camp.canon]):
                raise BadRequest(f"No existe la sesión '{ajustes.sesionActual}'")
        self.k.aux.campaign_settings_set(camp.id, ajustes.model_dump())
        return ajustes

    def current_session(self, camp: CampaignHandle) -> str | None:
        """IRI de la sesión actual (ajustada o la de número más alto)."""
        chosen = self.get(camp).sesionActual
        if chosen:
            return camp.entity_iri(chosen)
        rows = self.k.store.select(
            f"""SELECT ?s ?n WHERE {{ ?s a <{RPG.Session}> ; <{RPG.sessionNumber}> ?n }}
                ORDER BY DESC(?n) LIMIT 1""",
            default_graph=[camp.canon],
        )
        return rows[0]["s"].value if rows else None
