"""Contexto para modelos de lenguaje (context.yaml + estadísticas derivadas de SHACL)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from loregraph.config import REPO_ROOT, Settings
from loregraph.main import create_app
from loregraph.models import CampanaEntrada
from loregraph.modules.registry import ModuleError, load_module
from loregraph.services.kernel import Kernel
from loregraph.services.llm_context import render


@pytest.fixture(scope="module")
def kernel_real(tmp_path_factory: pytest.TempPathFactory) -> Kernel:
    s = Settings(_env_file=None, modules_dir=REPO_ROOT / "modules", data_dir=tmp_path_factory.mktemp("d"),
                 federation_enabled=False)
    k = Kernel(s, in_memory=True)
    k.campaigns.create(CampanaEntrada(id="vamp", nombre="Vamp", descripcion="Premisa de prueba.", modulos=["vtm5"]))
    return k


def test_estadisticas_con_rango_de_shacl_y_explicacion_del_modulo(kernel_real: Kernel) -> None:
    ctx = kernel_real.llm_context.build(kernel_real.campaign("vamp"), "es")
    vtm = next(m for m in ctx.modulos if m.id == "vtm5")
    hambre = next(s for s in vtm.estadisticas if s.clave == "vtm:hunger")
    assert hambre.rango == "0–5"                      # de sh:minInclusive/sh:maxInclusive
    assert hambre.explicada and "sangre" in (hambre.explicacion or "")
    assert hambre.escala and "saciado" in hambre.escala
    secta = next(s for s in vtm.estadisticas if s.clave == "vtm:sect")
    assert "Camarilla" in secta.valores               # de los conceptos SKOS
    assert "Premisa de prueba." in ctx.texto and "Mascarada" in ctx.texto


def test_idioma_ingles(kernel_real: Kernel) -> None:
    ctx = kernel_real.llm_context.build(kernel_real.campaign("vamp"), "en")
    assert "Personal horror" in ctx.texto and "### Statistics" in ctx.texto


def test_recorte_por_prioridad(kernel_real: Kernel) -> None:
    camp = kernel_real.campaign("vamp")
    completo = kernel_real.llm_context.build(camp, "es")
    assert not completo.recortado and "### Glosario" in completo.texto
    medio = kernel_real.llm_context.build(camp, "es", len(completo.texto) - 200)
    assert medio.recortado and "### Glosario" not in medio.texto and "### Estadísticas" in medio.texto
    minimo = kernel_real.llm_context.build(camp, "es", 900)
    assert minimo.recortado and len(minimo.texto) <= 900


def test_render_vacio() -> None:
    texto, recortado = render("C", "", [], "es", None)
    assert texto.startswith("# Campaña: C") and not recortado


def test_context_yaml_invalido(tmp_path: Path) -> None:
    (tmp_path / "manifest.yaml").write_text(
        "id: malo\nnombre: {es: Malo}\nversion: 0.1.0\niri: https://x.example/ont#\nprefijo: malo\n", encoding="utf-8")
    (tmp_path / "context.yaml").write_text("resumen: hola\ncampo_desconocido: 1\n", encoding="utf-8")
    with pytest.raises(ModuleError):
        load_module(tmp_path, "https://loregraph.example.org/data/")


def test_api_y_herramienta(kernel_real: Kernel) -> None:
    from loregraph.tools.core import KGTools

    with TestClient(create_app(kernel_real.settings, kernel_real, with_mcp=False)) as c:
        r = c.get("/campanas/vamp/contexto-llm", params={"max_caracteres": 1500})
        assert r.status_code == 200 and r.json()["recortado"] and len(r.json()["texto"]) <= 1500
    res = KGTools(kernel_real).contexto_sistema("vamp")
    assert "Mascarada" in res["texto"]
    assert "error" in KGTools(kernel_real).contexto_sistema("no-existe")


def test_instrucciones_del_agente_incluyen_contexto(kernel_real: Kernel) -> None:
    from loregraph.agents.assistant import _instructions

    texto = _instructions(kernel_real, kernel_real.campaign("vamp"), "es", 8192)
    assert "Mascarada" in texto and "hambre" in texto
