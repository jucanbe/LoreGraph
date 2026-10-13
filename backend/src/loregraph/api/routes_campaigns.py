"""Rutas de campañas, entidades, formularios y sesiones."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Query, Response, UploadFile, status

from loregraph.api.deps import ERROR_RESPONSES, ActorDep, CampDep, KernelDep, LangDep
from loregraph.errors import BadRequest, ValidationFailed
from loregraph.forms.schema import Formulario
from loregraph.models import (
    CambioInfo,
    CampanaEntrada,
    CampanaResumen,
    Entidad,
    EntidadEntrada,
    ErrorValidacion,
    Grafo,
    HechoTemporal,
    InfoCampana,
    ListaEntidades,
    MundoRealEntidad,
    PanelCampana,
    ResultadoEscritura,
    SesionLinea,
)
from loregraph.services.campaign_settings import AjustesCampana
from loregraph.services.transfer import ResultadoImportacion

router = APIRouter(prefix="/campanas", responses=ERROR_RESPONSES)


# ------------------------------------------------------------------ campañas
@router.get("", tags=["campañas"], summary="Listado de campañas")
def listar_campanas(kernel: KernelDep, lang: LangDep) -> list[CampanaResumen]:
    return kernel.campaigns.list(lang)


@router.post("", tags=["campañas"], status_code=status.HTTP_201_CREATED, summary="Crear campaña")
def crear_campana(entrada: CampanaEntrada, kernel: KernelDep, lang: LangDep) -> CampanaResumen:
    camp = kernel.campaigns.create(entrada)
    return kernel.campaigns.summary(camp, lang)


@router.post("/importar", tags=["campañas"], status_code=status.HTTP_201_CREATED,
             summary="Importar una campaña exportada (ZIP de LoreGraph)",
             description="Opcionalmente con otro id o nombre (para duplicar una campaña o evitar conflictos).")
async def importar_campana(kernel: KernelDep, archivo: Annotated[UploadFile, File()],
                           id: Annotated[str | None, Form()] = None,
                           nombre: Annotated[str | None, Form()] = None) -> ResultadoImportacion:
    data = await archivo.read()
    return kernel.transfer.import_(data, id or None, nombre or None)


@router.get("/{cid}/exportar", tags=["campañas"], summary="Exportar la campaña completa (ZIP)",
            response_class=Response,
            responses={200: {"content": {"application/zip": {}}, "description": "Archivo ZIP"}})
def exportar_campana(camp: CampDep, kernel: KernelDep) -> Response:
    fecha = datetime.now(UTC).strftime("%Y%m%d")
    return Response(
        content=kernel.transfer.export(camp), media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{camp.id}-{fecha}.loregraph.zip"'},
    )


@router.get("/{cid}", tags=["campañas"], summary="Información de presentación de la campaña",
            description="Tipos de entidad, estilos, prefijos y tema activos. El frontend no necesita conocer los módulos.")
def info_campana(camp: CampDep, kernel: KernelDep, lang: LangDep) -> InfoCampana:
    return kernel.campaigns.info(camp, lang)


@router.put("/{cid}", tags=["campañas"], summary="Editar campaña (nombre, descripción, módulos)")
def editar_campana(camp: CampDep, entrada: CampanaEntrada, kernel: KernelDep, lang: LangDep) -> CampanaResumen:
    updated = kernel.campaigns.update(camp.id, entrada)
    return kernel.campaigns.summary(updated, lang)


@router.delete("/{cid}", tags=["campañas"], status_code=status.HTTP_204_NO_CONTENT,
               summary="Borrar campaña (permanente)")
def borrar_campana(camp: CampDep, kernel: KernelDep) -> Response:
    kernel.campaigns.delete(camp.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{cid}/ajustes", tags=["campañas"], summary="Ajustes de la campaña (lore para la IA, asistente…)")
def ajustes_campana(camp: CampDep, kernel: KernelDep) -> AjustesCampana:
    return kernel.campaign_settings.get(camp)


@router.put("/{cid}/ajustes", tags=["campañas"], summary="Guardar los ajustes de la campaña")
def guardar_ajustes_campana(camp: CampDep, ajustes: AjustesCampana, kernel: KernelDep) -> AjustesCampana:
    return kernel.campaign_settings.set(camp, ajustes)


@router.get("/{cid}/panel", tags=["campañas"], summary="Panel resumen de la campaña")
def panel(camp: CampDep, kernel: KernelDep, lang: LangDep) -> PanelCampana:
    return kernel.campaigns.panel(camp, lang)


@router.get("/{cid}/sesiones", tags=["sesiones"], summary="Línea temporal de sesiones")
def sesiones(camp: CampDep, kernel: KernelDep, lang: LangDep) -> list[SesionLinea]:
    return kernel.sessions.sessions(camp, lang)


# --------------------------------------------------------------- formularios
@router.get("/{cid}/formularios/{clase}", tags=["formularios"],
            summary="Esquema de formulario derivado de SHACL",
            description="Une las formas de la clase, sus superclases y las variantes indicadas, "
                        "incluidas las de los módulos activos.")
def formulario(
    camp: CampDep, kernel: KernelDep, lang: LangDep, clase: str,
    variante: Annotated[list[str] | None, Query()] = None,
) -> Formulario:
    return kernel.entities.form(camp, [clase, *(variante or [])], lang)


# ----------------------------------------------------------------- entidades
@router.get("/{cid}/entidades", tags=["entidades"], summary="Listado de entidades con búsqueda y filtros")
def listar_entidades(
    camp: CampDep, kernel: KernelDep, lang: LangDep,
    clase: str | None = None,
    q: str | None = None,
    orden: Literal["nombre", "reciente", "relevancia"] = "nombre",
    limite: Annotated[int, Query(ge=1, le=500)] = 50,
    desplazamiento: Annotated[int, Query(ge=0)] = 0,
    filtro: Annotated[list[str] | None, Query(description="Filtros 'propiedad=id', p. ej. rpg:memberOf=camarilla")] = None,
) -> ListaEntidades:
    filtros: dict[str, str] = {}
    for f in filtro or []:
        if "=" not in f:
            raise BadRequest(f"Filtro no válido: {f}")
        k, v = f.split("=", 1)
        filtros[k.strip()] = v.strip()
    return kernel.entities.list(camp, clase, q, orden, limite, desplazamiento, lang, filtros)


@router.post("/{cid}/entidades", tags=["entidades"], status_code=status.HTTP_201_CREATED, summary="Crear entidad")
def crear_entidad(camp: CampDep, entrada: EntidadEntrada, kernel: KernelDep, lang: LangDep,
                  actor: ActorDep) -> ResultadoEscritura:
    return kernel.entities.create(camp, entrada, actor, lang)


@router.post("/{cid}/validar", tags=["entidades"], summary="Validar una entidad sin guardarla")
def validar_entidad(camp: CampDep, entrada: EntidadEntrada, kernel: KernelDep, lang: LangDep,
                    entidad: str | None = None) -> list[ErrorValidacion]:
    iri = kernel.entities.resolve(camp, entidad) if entidad else kernel.iris.entity(camp.id, entrada.id or "nueva")
    try:
        _, form, res = kernel.entities.build_entity_triples(camp, iri, entrada, lang)
    except ValidationFailed as exc:
        return exc.errors
    if res.errors:
        return res.errors
    state = list(res.triples)
    if entidad:
        covered = {c.ruta for c in form.campos}
        from loregraph.store.terms import nn

        state += [t for t in kernel.store.triples(nn(iri), None, None, camp.canon)
                  if t[1].value not in covered and t[1].value != "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"]
    return kernel.entities.validate_state(camp, state, [iri, *res.nested], res.references, lang)


@router.get("/{cid}/entidades/{eid}", tags=["entidades"], summary="Ficha de una entidad")
def ver_entidad(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep) -> Entidad:
    return kernel.entities.get(camp, eid, lang)


@router.put("/{cid}/entidades/{eid}", tags=["entidades"], summary="Editar entidad")
def editar_entidad(camp: CampDep, eid: str, entrada: EntidadEntrada, kernel: KernelDep, lang: LangDep,
                   actor: ActorDep) -> ResultadoEscritura:
    return kernel.entities.update(camp, eid, entrada, actor, lang)


@router.delete("/{cid}/entidades/{eid}", tags=["entidades"], summary="Borrar entidad (y referencias a ella)")
def borrar_entidad(camp: CampDep, eid: str, kernel: KernelDep, actor: ActorDep) -> dict[str, str]:
    return {"cambio": kernel.entities.delete(camp, eid, actor)}


@router.get("/{cid}/entidades/{eid}/procedencia", tags=["entidades"], summary="Historial de cambios de la entidad")
def procedencia(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep) -> list[CambioInfo]:
    iri = kernel.entities.resolve(camp, eid)
    return kernel.provenance.history(camp, iri, lang)


@router.get("/{cid}/cambios", tags=["historial"], summary="Historial de cambios de toda la campaña")
def cambios(camp: CampDep, kernel: KernelDep, lang: LangDep,
            limite: Annotated[int, Query(ge=1, le=200)] = 50,
            desplazamiento: Annotated[int, Query(ge=0)] = 0) -> list[CambioInfo]:
    return kernel.provenance.history(camp, None, lang, limite, desplazamiento)


@router.post("/{cid}/cambios/{chid}/deshacer", tags=["historial"],
             summary="Deshacer un cambio (aplica el inverso con su propia procedencia)",
             description="Se rechaza (409) si un cambio posterior tocó los mismos datos o si ya se deshizo.")
def deshacer(camp: CampDep, chid: str, kernel: KernelDep, lang: LangDep, actor: ActorDep) -> dict[str, str]:
    return {"cambio": kernel.provenance.undo(camp, chid, actor, lang)}


@router.get("/{cid}/entidades/{eid}/historia-temporal", tags=["entidades"],
            summary="Evolución de las propiedades temporales (ubicación, facción, estado…) por sesiones")
def historia_temporal(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep) -> list[HechoTemporal]:
    from loregraph.services.labels import Labeler

    iri = kernel.entities.resolve(camp, eid)
    rows = kernel.temporal.history(camp, iri)
    labeler = Labeler(kernel.store, camp, lang)
    labeler.preload([*(r.valor.value for r in rows if hasattr(r.valor, "value")), *(r.desde for r in rows if r.desde),
                     *(r.hasta for r in rows if r.hasta)])
    from loregraph.store.terms import nn

    return [
        HechoTemporal(
            propiedad=labeler.term(nn(r.propiedad)), valor=labeler.term(r.valor),
            desde=labeler.entity_ref(r.desde) if r.desde else None,
            hasta=labeler.entity_ref(r.hasta) if r.hasta else None,
            vigente=r.hasta is None,
        )
        for r in rows
    ]


@router.get("/{cid}/entidades/{eid}/vecindario", tags=["grafo"], summary="Mini-grafo del vecindario")
def vecindario(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep,
               profundidad: Annotated[int, Query(ge=1, le=3)] = 1) -> Grafo:
    return kernel.graphview.graph(camp, lang, centro=eid, profundidad=profundidad, incluir_sesiones=True)


@router.get("/{cid}/entidades/{eid}/mundo-real", tags=["mundo real"],
            summary="Datos del mundo real (Wikidata/DBpedia) de las anclas de la entidad")
def mundo_real(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep) -> MundoRealEntidad:
    return kernel.realworld.for_entity(camp, eid, lang)
