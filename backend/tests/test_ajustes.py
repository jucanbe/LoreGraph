"""Ajustes editables desde la interfaz (guardados en SQLite, con prioridad sobre .env)."""

from __future__ import annotations

from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from loregraph.config import Settings
from loregraph.main import create_app
from loregraph.services.kernel import Kernel
from loregraph.services.settings_store import AjustesEntrada


def _settings(tmp_path: Path) -> Settings:
    return Settings(_env_file=None, modules_dir=tmp_path / "m", data_dir=tmp_path / "d", llm_model="base:1b")


def test_ver_y_cambiar_ajustes(tmp_path: Path) -> None:
    k = Kernel(_settings(tmp_path), in_memory=True)
    with TestClient(create_app(k.settings, k, with_mcp=False)) as c:
        a = c.get("/ajustes").json()["ajustes"]
        assert a["llm_model"] == {**a["llm_model"], "valor": "base:1b", "origen": "env"}
        assert a["llm_api_key"]["valor"] is None and a["llm_api_key"]["configurado"] is False

        r = c.put("/ajustes", json={"llm_model": "qwen3:14b", "llm_api_key": "secreta", "llm_context_tokens": 32768})
        a = r.json()["ajustes"]
        assert a["llm_model"]["valor"] == "qwen3:14b" and a["llm_model"]["origen"] == "ajustes"
        assert a["llm_api_key"]["valor"] is None and a["llm_api_key"]["configurado"] is True
        assert "secreta" not in r.text  # la clave nunca sale por la API
        assert k.settings.llm_model == "qwen3:14b" and k.settings.llm_context_tokens == 32768
        # el asistente usa los ajustes nuevos
        assert c.get("/campanas").status_code == 200

        a = c.put("/ajustes", json={"restablecer": ["llm_model"]}).json()["ajustes"]
        assert a["llm_model"]["valor"] == "base:1b" and a["llm_model"]["origen"] == "env"


def test_validacion(tmp_path: Path) -> None:
    k = Kernel(_settings(tmp_path), in_memory=True)
    with TestClient(create_app(k.settings, k, with_mcp=False)) as c:
        assert c.put("/ajustes", json={"llm_base_url": "ftp://x"}).status_code == 422
        assert c.put("/ajustes", json={"llm_context_tokens": 10}).status_code == 422
        assert c.put("/ajustes", json={"llm_provider": "otro"}).status_code == 422


def test_persisten_entre_reinicios(tmp_path: Path) -> None:
    s = _settings(tmp_path)
    k = Kernel(s)
    k.settings_store.update(AjustesEntrada(user_name="alicia"))
    k.close()
    k2 = Kernel(_settings(tmp_path))
    try:
        assert k2.settings.user_name == "alicia"
        assert k2.settings_store.get().ajustes["user_name"].origen == "ajustes"
    finally:
        k2.close()


def test_probar_llm(tmp_path: Path) -> None:
    k = Kernel(_settings(tmp_path), in_memory=True)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/models")
        return httpx.Response(200, json={"data": [{"id": "base:1b"}, {"id": "llama3:8b"}]})

    k.http_transport = httpx.MockTransport(handler)  # type: ignore[attr-defined]
    with TestClient(create_app(k.settings, k, with_mcp=False)) as c:
        r = c.post("/ajustes/llm/probar").json()
        assert r == {"ok": True, "modelos": ["base:1b", "llama3:8b"], "modeloDisponible": True, "error": None}

    k.http_transport = httpx.MockTransport(lambda req: (_ for _ in ()).throw(httpx.ConnectError("rechazada")))  # type: ignore[attr-defined]
    r = k.settings_store.test_llm()
    assert not r.ok and "No se pudo conectar" in (r.error or "")
