"""Dependencias comunes de la API: núcleo, idioma, actor y campaña."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, Path, Query, Request

from loregraph.apimodel import ApiModel
from loregraph.models import Actor, ErrorValidacion
from loregraph.services.kernel import CampaignHandle, Kernel

SUPPORTED_LANGS = ("es", "en")


class ErrorRespuesta(ApiModel):
    """Cuerpo de las respuestas de error."""

    detalle: str
    errores: list[ErrorValidacion] = []


ERROR_RESPONSES: dict[int | str, dict] = {
    400: {"model": ErrorRespuesta, "description": "Petición no válida"},
    404: {"model": ErrorRespuesta, "description": "No encontrado"},
    409: {"model": ErrorRespuesta, "description": "Conflicto"},
    422: {"model": ErrorRespuesta, "description": "Datos no válidos (incluye errores SHACL)"},
}


def get_kernel(request: Request) -> Kernel:
    return request.app.state.kernel  # type: ignore[no-any-return]


def get_lang(
    request: Request,
    idioma: Annotated[str | None, Query(description="Idioma de etiquetas: es | en")] = None,
) -> str:
    if idioma in SUPPORTED_LANGS:
        return idioma  # type: ignore[return-value]
    header = request.headers.get("accept-language", "")
    for part in header.split(","):
        code = part.split(";")[0].strip().lower()[:2]
        if code in SUPPORTED_LANGS:
            return code
    kernel: Kernel = request.app.state.kernel
    return kernel.settings.default_language


def get_actor(
    request: Request,
    x_usuario: Annotated[str | None, Header(description="Nombre del usuario humano (opcional)")] = None,
) -> Actor:
    kernel: Kernel = request.app.state.kernel
    return Actor(tipo="humano", nombre=(x_usuario or kernel.settings.user_name).strip() or "dm")


def get_campaign(
    cid: Annotated[str, Path(description="Identificador de la campaña")],
    kernel: Annotated[Kernel, Depends(get_kernel)],
) -> CampaignHandle:
    return kernel.campaign(cid)


KernelDep = Annotated[Kernel, Depends(get_kernel)]
LangDep = Annotated[str, Depends(get_lang)]
ActorDep = Annotated[Actor, Depends(get_actor)]
CampDep = Annotated[CampaignHandle, Depends(get_campaign)]
