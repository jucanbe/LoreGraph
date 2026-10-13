"""Núcleo de servicios: une almacén, módulos, índices y servicios de dominio."""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path

from loregraph.config import Settings
from loregraph.errors import NotFound
from loregraph.modules.registry import ModuleRegistry
from loregraph.ontology.context import OntologyContext
from loregraph.store.iris import Iris
from loregraph.store.store import GraphStore

log = logging.getLogger(__name__)

MODULE_GRAPH_KINDS = ("ontology", "vocabulary", "shapes")


@dataclass
class CampaignHandle:
    """Datos de una campaña ya resuelta (módulos y contexto ontológico)."""

    id: str
    iri: str
    nombre: str
    descripcion: str
    declared_modules: list[str]
    ctx: OntologyContext
    iris: Iris
    creada: str | None = None
    extra: dict[str, str] = field(default_factory=dict)

    @property
    def modules(self) -> list[str]:
        return self.ctx.module_ids

    @property
    def canon(self) -> str:
        return self.iris.canon(self.id)

    @property
    def derived(self) -> str:
        return self.iris.derived(self.id)

    @property
    def provenance(self) -> str:
        return self.iris.provenance(self.id)

    @property
    def proposals(self) -> str:
        return self.iris.proposals(self.id)

    def knowledge(self, eid: str) -> str:
        return self.iris.knowledge(self.id, eid)

    @property
    def module_graphs(self) -> list[str]:
        return [self.iris.module_graph(m, k) for m in self.modules for k in ("ontology", "vocabulary")]

    @property
    def read_graphs(self) -> list[str]:
        """Grafo por defecto para leer el mundo canónico (con lo derivado y los vocabularios)."""
        return [self.canon, self.derived, *self.module_graphs]

    def entity_iri(self, ref: str) -> str:
        """Convierte un id local, clave compacta o IRI en IRI."""
        if ref.startswith(("http://", "https://", "urn:")):
            return ref
        if ":" in ref:
            return self.ctx.expand(ref)
        return self.iris.entity(self.id, ref)

    def entity_id(self, iri: str) -> str | None:
        """Id para la API: id local para entidades de campaña, clave compacta para vocabulario."""
        eid = self.iris.entity_id(iri)
        if eid is not None:
            return eid if self.iris.campaign_id(iri) == self.id else None
        compact = self.ctx.compact(iri)
        return compact if compact != iri else None


class Kernel:
    """Contenedor de la aplicación. Una instancia por proceso."""

    def __init__(self, settings: Settings, in_memory: bool = False) -> None:
        from loregraph.services.aux_db import AuxDB

        self.settings = settings
        self.iris = Iris(settings.data_base)
        self.store = GraphStore(None if in_memory else settings.store_path)
        self.aux = AuxDB(None if in_memory else settings.aux_db_path)
        self.registry = ModuleRegistry(settings.modules_path, settings.data_base)
        self._contexts: dict[tuple[str, ...], OntologyContext] = {}
        self._ctx_lock = threading.Lock()
        self.load_module_graphs()
        self._init_services()

    def _init_services(self) -> None:
        from loregraph.services.campaigns import CampaignService
        from loregraph.services.entities import EntityService
        from loregraph.services.graphview import GraphViewService
        from loregraph.services.knowledge import KnowledgeService
        from loregraph.services.llm_context import LLMContextService
        from loregraph.services.proposals import ProposalService
        from loregraph.services.provenance import ProvenanceService
        from loregraph.services.realworld import RealWorldService
        from loregraph.services.rules import RulesService
        from loregraph.services.search import SearchService
        from loregraph.services.sessions import SessionService
        from loregraph.services.sparql import SparqlService

        self.provenance = ProvenanceService(self)
        self.rules = RulesService(self)
        self.search = SearchService(self)
        self.campaigns = CampaignService(self)
        self.entities = EntityService(self)
        self.graphview = GraphViewService(self)
        self.sparql = SparqlService(self)
        self.realworld = RealWorldService(self)
        self.sessions = SessionService(self)
        self.knowledge = KnowledgeService(self)
        self.proposals = ProposalService(self)
        self.llm_context = LLMContextService(self)
        from loregraph.services.campaign_settings import CampaignSettingsService

        self.campaign_settings = CampaignSettingsService(self)
        from loregraph.services.temporal import TemporalService

        self.temporal = TemporalService(self)
        from loregraph.services.coherence import CoherenceService

        self.coherence = CoherenceService(self)
        from loregraph.services.media import MediaService
        from loregraph.services.transfer import TransferService

        self.media = MediaService(self)
        self.transfer = TransferService(self)
        from loregraph.services.settings_store import SettingsService

        # Último: aplica los ajustes guardados en la base de datos sobre los de .env.
        self.settings_store = SettingsService(self)

    # --------------------------------------------------------------- módulos
    def load_module_graphs(self) -> None:
        """Carga (o recarga) ontología, vocabulario y formas de cada módulo en el almacén."""
        for mod in self.registry.modules.values():
            self.store.load_turtle(mod.ontology or "", self.iris.module_graph(mod.id, "ontology"))
            self.store.load_turtle("\n".join(mod.vocabulary), self.iris.module_graph(mod.id, "vocabulary"))
            self.store.load_turtle(mod.shapes or "", self.iris.module_graph(mod.id, "shapes"))

    def reload_modules(self) -> None:
        self.registry.reload()
        with self._ctx_lock:
            self._contexts.clear()
        self.load_module_graphs()

    def context(self, module_ids: list[str]) -> OntologyContext:
        mods = self.registry.resolve(module_ids)
        key = tuple(m.id for m in mods)
        with self._ctx_lock:
            ctx = self._contexts.get(key)
            if ctx is None:
                ctx = OntologyContext(mods)
                self._contexts[key] = ctx
            return ctx

    # ------------------------------------------------------------- campañas
    def campaign(self, cid: str) -> CampaignHandle:
        handle = self.campaigns.handle(cid)
        if handle is None:
            raise NotFound(f"No existe la campaña '{cid}'")
        return handle

    def close(self) -> None:
        self.store.close()
        self.aux.close()


def ensure_dirs(settings: Settings) -> None:
    Path(settings.data_path).mkdir(parents=True, exist_ok=True)
