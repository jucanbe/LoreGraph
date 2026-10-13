"""Rutas de ajustes de la aplicación (guardados en la base de datos auxiliar)."""

from __future__ import annotations

from fastapi import APIRouter

from loregraph.api.deps import ERROR_RESPONSES, KernelDep
from loregraph.services.settings_store import Ajustes, AjustesEntrada, PruebaModelo

router = APIRouter(prefix="/ajustes", tags=["ajustes"], responses=ERROR_RESPONSES)


@router.get("", summary="Ajustes actuales (con su origen: .env o guardados)")
def ver_ajustes(kernel: KernelDep) -> Ajustes:
    return kernel.settings_store.get()


@router.put("", summary="Cambiar ajustes",
            description="Solo se modifican los campos enviados; `restablecer` devuelve ajustes al valor de .env.")
def cambiar_ajustes(entrada: AjustesEntrada, kernel: KernelDep) -> Ajustes:
    return kernel.settings_store.update(entrada)


@router.post("/llm/probar", summary="Probar la conexión con el servidor del modelo y listar sus modelos")
def probar_llm(kernel: KernelDep) -> PruebaModelo:
    return kernel.settings_store.test_llm()
