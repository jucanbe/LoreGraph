"""Configuración de la aplicación, leída de variables de entorno y del archivo `.env`.

Las rutas relativas se resuelven respecto a la raíz del repositorio, de modo que
el backend funciona igual se arranque desde `backend/` o desde la raíz.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

#: Raíz del repositorio (…/KG Platform).
REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Parámetros configurables. Ver `.env.example` para la documentación de cada uno."""

    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", Path(".env")),
        env_file_encoding="utf-8",
        env_prefix="LOREGRAPH_",
        extra="ignore",
    )

    # --- Rutas ---
    data_dir: Path = Path("data")
    modules_dir: Path = Path("modules")

    # --- Identificadores ---
    base_iri: str = "https://loregraph.example.org/"
    user_name: str = "dm"

    # --- Servidor ---
    api_host: str = "127.0.0.1"
    api_port: int = 8765
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    default_language: str = "es"

    # --- SPARQL ---
    sparql_max_results: int = 1000
    sparql_timeout_s: float = 20.0

    # --- Federación con el mundo real ---
    wikidata_endpoint: str = "https://query.wikidata.org/sparql"
    dbpedia_endpoint: str = "https://dbpedia.org/sparql"
    federation_timeout_s: float = 15.0
    federation_cache_ttl_s: int = 7 * 24 * 3600
    #: Wikidata exige un User-Agent con URL o correo de contacto; si no, responde 403.
    federation_user_agent: str = "LoreGraph/0.1.0 (https://loregraph.example.org/; contacto@loregraph.example.org)"
    federation_enabled: bool = True
    #: Endpoints adicionales permitidos en SERVICE (además de Wikidata y DBpedia).
    federation_extra_endpoints: list[str] = Field(default_factory=list)

    # --- Modelos de lenguaje (agentes internos, PydanticAI) ---
    llm_provider: str = "ollama"
    llm_base_url: str = "http://localhost:11434/v1"
    llm_model: str = "qwen3:8b"
    llm_api_key: str | None = None
    llm_context_tokens: int = 8192
    llm_timeout_s: float = 120.0
    llm_max_retries: int = 3
    #: Cómo se pide la salida estructurada (generador): "tool" (llamada a herramienta), "native"
    #: (JSON Schema del proveedor, p. ej. `format` de Ollama) o "prompted" (esquema en las instrucciones).
    llm_output_mode: str = "tool"

    @property
    def data_path(self) -> Path:
        return self._resolve(self.data_dir)

    @property
    def modules_path(self) -> Path:
        return self._resolve(self.modules_dir)

    @property
    def store_path(self) -> Path:
        return self.data_path / "store"

    @property
    def aux_db_path(self) -> Path:
        return self.data_path / "aux.sqlite"

    @property
    def data_base(self) -> str:
        """IRI base de los datos de campaña (distinta de la de la ontología)."""
        return self.base_iri.rstrip("/") + "/data/"

    @staticmethod
    def _resolve(p: Path) -> Path:
        return p if p.is_absolute() else (REPO_ROOT / p).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
