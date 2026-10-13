"""Rutas generales: salud, módulos, recursos de módulos y búsqueda global."""

from __future__ import annotations

from pathlib import Path as FsPath
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from loregraph.api.deps import ERROR_RESPONSES, KernelDep, LangDep
from loregraph.models import ModuloInfo, ResultadoBusqueda

router = APIRouter(responses=ERROR_RESPONSES)


@router.get("/salud", tags=["general"], summary="Estado del servicio")
def salud(kernel: KernelDep) -> dict[str, object]:
    return {"ok": True, "modulos": sorted(kernel.registry.modules), "campanas": len(kernel.campaigns.ids())}


@router.get("/modulos", tags=["módulos"], summary="Módulos disponibles con su manifiesto y tema")
def modulos(kernel: KernelDep, lang: LangDep) -> list[ModuloInfo]:
    out = []
    for m in kernel.registry.modules.values():
        man = m.manifest
        out.append(ModuloInfo(
            id=man.id,
            nombre=man.nombre.get(lang) or next(iter(man.nombre.values())),
            descripcion=man.descripcion.get(lang) or next(iter(man.descripcion.values()), ""),
            version=man.version, categoria=man.categoria, prefijo=man.prefijo, iri=man.iri,
            licencia=man.licencia, depende_de=man.depende_de, clases_principales=man.clases_principales,
            tema=man.tema, estilos_tipos=man.estilos_tipos, estilos_relaciones=man.estilos_relaciones,
        ))
    out.sort(key=lambda x: (x.categoria != "nucleo", x.nombre.lower()))
    return out


@router.get("/modulos/{mid}/assets/{ruta:path}", tags=["módulos"], summary="Recurso estático de un módulo",
            response_class=FileResponse)
def asset(mid: str, ruta: str, kernel: KernelDep) -> FileResponse:
    mod = kernel.registry.modules.get(mid)
    if mod is None:
        raise HTTPException(404, "Módulo desconocido")
    base = mod.assets_path.resolve()
    target = (base / ruta).resolve()
    if not target.is_relative_to(base) or not target.is_file():
        raise HTTPException(404, "Recurso no encontrado")
    return FileResponse(FsPath(target))


@router.get("/busqueda", tags=["búsqueda"], summary="Búsqueda global por texto en etiquetas y descripciones")
def busqueda(
    kernel: KernelDep,
    lang: LangDep,
    q: Annotated[str, Query(min_length=1)],
    campana: str | None = None,
    limite: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[ResultadoBusqueda]:
    camp = kernel.campaign(campana) if campana else None
    return kernel.search.search(q, camp, limite, lang)
