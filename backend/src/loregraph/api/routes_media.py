"""Rutas de imágenes: retratos, mapas propios y archivos subidos."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Form, Response, UploadFile, status
from fastapi.responses import FileResponse

from loregraph.api.deps import ERROR_RESPONSES, ActorDep, CampDep, KernelDep, LangDep
from loregraph.services.media import Imagen, Mapa, MarcadorEntrada

router = APIRouter(responses=ERROR_RESPONSES)


@router.get("/media/{cid}/{archivo}", tags=["imágenes"], summary="Archivo de imagen subido",
            response_class=FileResponse)
def archivo(cid: str, archivo: str, kernel: KernelDep) -> FileResponse:
    return FileResponse(kernel.media.file_path(cid, archivo), headers={"Cache-Control": "public, max-age=86400"})


@router.post("/campanas/{cid}/entidades/{eid}/retratos", tags=["imágenes"], status_code=status.HTTP_201_CREATED,
             summary="Subir un retrato (PNG, JPEG, WebP o GIF)")
async def subir_retrato(camp: CampDep, eid: str, kernel: KernelDep, actor: ActorDep,
                        archivo: Annotated[UploadFile, File()],
                        reemplazar: Annotated[bool, Form()] = True) -> Imagen:
    data = await archivo.read()
    return kernel.media.add_portrait(camp, eid, data, actor, reemplazar)


@router.delete("/campanas/{cid}/entidades/{eid}/retratos", tags=["imágenes"],
               status_code=status.HTTP_204_NO_CONTENT, summary="Quitar un retrato",
               description="`nodo`: IRI del nodo de imagen o la URL de la imagen (como aparece en la ficha).")
def quitar_retrato(camp: CampDep, eid: str, nodo: str, kernel: KernelDep, actor: ActorDep) -> Response:
    kernel.media.remove_portrait(camp, eid, nodo, actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/campanas/{cid}/mapas", tags=["mapas"], summary="Mapas propios de la campaña")
def mapas(camp: CampDep, kernel: KernelDep, lang: LangDep) -> list[Mapa]:
    return kernel.media.maps(camp, lang)


@router.post("/campanas/{cid}/mapas", tags=["mapas"], status_code=status.HTTP_201_CREATED,
             summary="Crear un mapa subiendo su imagen")
async def crear_mapa(camp: CampDep, kernel: KernelDep, lang: LangDep, actor: ActorDep,
                     archivo: Annotated[UploadFile, File()], nombre: Annotated[str, Form(min_length=1)],
                     descripcion: Annotated[str, Form()] = "") -> Mapa:
    data = await archivo.read()
    eid = kernel.media.create_map(camp, nombre.strip(), descripcion.strip(), data, actor)
    return kernel.media.get_map(camp, eid, lang)


@router.get("/campanas/{cid}/mapas/{eid}", tags=["mapas"], summary="Un mapa con sus marcadores")
def mapa(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep) -> Mapa:
    return kernel.media.get_map(camp, eid, lang)


@router.put("/campanas/{cid}/mapas/{eid}/marcadores", tags=["mapas"], summary="Reemplazar los marcadores de un mapa")
def marcadores(camp: CampDep, eid: str, entrada: list[MarcadorEntrada], kernel: KernelDep, lang: LangDep,
               actor: ActorDep) -> Mapa:
    return kernel.media.set_markers(camp, eid, entrada, actor, lang)


@router.get("/campanas/{cid}/entidades/{eid}/mapas", tags=["mapas"], summary="Mapas en los que aparece una entidad")
def mapas_de_entidad(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep) -> list[Mapa]:
    return kernel.media.maps_of_entity(camp, eid, lang)
