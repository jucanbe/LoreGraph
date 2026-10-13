"""Ajustes editables desde la interfaz.

Los valores de partida vienen de `.env` (o de los valores por defecto). Lo que se
cambia en la página de Ajustes se guarda en la base de datos auxiliar (SQLite) y
tiene prioridad. «Restablecer» un ajuste lo borra de la base de datos y vuelve al
valor de `.env`.

La clave de API del modelo se guarda en texto plano en `data/aux.sqlite` y nunca
se devuelve por la API (solo si hay una configurada).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal

import httpx
from pydantic import Field

from loregraph.apimodel import ApiModel

if TYPE_CHECKING:
    from loregraph.services.kernel import Kernel

#: Ajustes que se pueden cambiar desde la interfaz (nombre del campo de Settings).
EDITABLE = (
    "llm_provider",
    "llm_base_url",
    "llm_model",
    "llm_api_key",
    "llm_context_tokens",
    "llm_timeout_s",
    "llm_max_retries",
    "llm_output_mode",
    "user_name",
    "federation_enabled",
    "federation_user_agent",
    "federation_timeout_s",
    "sparql_max_results",
    "sparql_timeout_s",
)
SECRET = {"llm_api_key"}


class AjustesEntrada(ApiModel):
    """Cambios parciales. Un campo ausente no se toca; para volver al valor de
    `.env` se usa la lista ``restablecer``."""

    llm_provider: Literal["ollama", "openai"] | None = None
    llm_base_url: str | None = Field(default=None, pattern=r"^https?://\S+$")
    llm_model: str | None = Field(default=None, min_length=1, max_length=200)
    llm_api_key: str | None = Field(default=None, max_length=500)
    llm_context_tokens: int | None = Field(default=None, ge=512, le=2_000_000)
    llm_timeout_s: float | None = Field(default=None, ge=5, le=3600)
    llm_max_retries: int | None = Field(default=None, ge=0, le=10)
    llm_output_mode: Literal["tool", "native", "prompted"] | None = None
    user_name: str | None = Field(default=None, min_length=1, max_length=80)
    federation_enabled: bool | None = None
    federation_user_agent: str | None = Field(default=None, min_length=5, max_length=300)
    federation_timeout_s: float | None = Field(default=None, ge=1, le=120)
    sparql_max_results: int | None = Field(default=None, ge=1, le=100_000)
    sparql_timeout_s: float | None = Field(default=None, ge=1, le=600)
    restablecer: list[str] = Field(default_factory=list, description="Ajustes que vuelven al valor de .env.")


class Ajuste(ApiModel):
    clave: str
    valor: Any = Field(description="Valor efectivo (las claves secretas no se devuelven).")
    origen: Literal["env", "ajustes"]
    porDefecto: Any = Field(description="Valor de .env o por defecto (sin secretos).")
    secreto: bool = False
    configurado: bool = Field(default=True, description="Para secretos: si hay un valor guardado.")


class Ajustes(ApiModel):
    ajustes: dict[str, Ajuste]


class PruebaModelo(ApiModel):
    ok: bool
    modelos: list[str] = Field(default_factory=list)
    modeloDisponible: bool | None = None
    error: str | None = None


class SettingsService:
    def __init__(self, kernel: Kernel) -> None:
        self.k = kernel
        # Valores de .env/por defecto, para poder restablecer.
        self.base: dict[str, Any] = {k: getattr(kernel.settings, k) for k in EDITABLE}
        self._apply(self.k.aux.settings_get())

    def _apply(self, overrides: dict[str, Any]) -> None:
        for k, v in overrides.items():
            if k in EDITABLE:
                setattr(self.k.settings, k, v)

    def get(self) -> Ajustes:
        stored = self.k.aux.settings_get()
        out: dict[str, Ajuste] = {}
        for k in EDITABLE:
            secret = k in SECRET
            value = getattr(self.k.settings, k)
            out[k] = Ajuste(
                clave=k,
                valor=None if secret else value,
                origen="ajustes" if k in stored else "env",
                porDefecto=None if secret else self.base[k],
                secreto=secret,
                configurado=bool(value) if secret else True,
            )
        return Ajustes(ajustes=out)

    def update(self, entrada: AjustesEntrada) -> Ajustes:
        changes = {k: v for k, v in entrada.model_dump(exclude_unset=True).items() if k in EDITABLE and v is not None}
        if "llm_api_key" in changes and changes["llm_api_key"] == "":
            changes["llm_api_key"] = None  # cadena vacía = sin clave
        resets = [k for k in entrada.restablecer if k in EDITABLE]
        if changes:
            self.k.aux.settings_set(changes)
            self._apply(changes)
        if resets:
            self.k.aux.settings_delete(resets)
            for k in resets:
                setattr(self.k.settings, k, self.base[k])
        return self.get()

    def test_llm(self) -> PruebaModelo:
        """Comprueba el servidor del modelo listando sus modelos (API compatible con OpenAI)."""
        s = self.k.settings
        url = s.llm_base_url.rstrip("/") + "/models"
        headers = {"Authorization": f"Bearer {s.llm_api_key}"} if s.llm_api_key else {}
        transport = getattr(self.k, "http_transport", None)
        try:
            with httpx.Client(timeout=6, transport=transport) as client:
                r = client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            return PruebaModelo(ok=False, error=f"No se pudo conectar con {s.llm_base_url}: {exc}")
        if r.status_code >= 400:
            return PruebaModelo(ok=False, error=f"El servidor respondió {r.status_code}: {r.text[:200]}")
        try:
            data = r.json()
            models = sorted({str(m.get("id")) for m in data.get("data", []) if m.get("id")})
        except (ValueError, AttributeError):
            return PruebaModelo(ok=False, error="Respuesta no reconocida (se esperaba la API de modelos de OpenAI)")
        return PruebaModelo(ok=True, modelos=models, modeloDisponible=s.llm_model in models if models else None)
