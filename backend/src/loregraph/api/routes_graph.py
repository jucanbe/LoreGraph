"""Rutas de grafo, SPARQL, conocimiento epistémico y propuestas."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status

from loregraph.api.deps import ERROR_RESPONSES, ActorDep, CampDep, KernelDep, LangDep
from loregraph.apimodel import ApiModel
from loregraph.errors import NotFound
from loregraph.models import (
    ConocimientoPersonaje,
    ConsultaEjemplo,
    ConsultaGuardadaEntrada,
    ConsultaSparql,
    EntidadRef,
    Grafo,
    LoteEntrada,
    PropuestaDetalle,
    PropuestaEntrada,
    PropuestaResumen,
    ResultadoLote,
    ResultadoPropuesta,
    ResultadoSparql,
    RevisionEntrada,
    TripletaEntrada,
)
from loregraph.services.coherence import InformeCoherencia

router = APIRouter(prefix="/campanas/{cid}", responses=ERROR_RESPONSES)


class CambioRespuesta(ApiModel):
    cambio: str


class PropuestaEditable(ApiModel):
    anadir: list[TripletaEntrada]
    eliminar: list[TripletaEntrada]


# --------------------------------------------------------------------- grafo
@router.get("/grafo", tags=["grafo"], summary="Grafo de la campaña para Cytoscape",
            description="Filtros por tipo, facción, entidad central y relación; vista epistémica de un personaje; "
                        "estado en una sesión concreta.")
def grafo(
    camp: CampDep, kernel: KernelDep, lang: LangDep,
    tipo: Annotated[list[str] | None, Query()] = None,
    faccion: str | None = None,
    centro: str | None = None,
    profundidad: Annotated[int, Query(ge=1, le=4)] = 1,
    relacion: Annotated[list[str] | None, Query()] = None,
    vista: Annotated[str | None, Query(description="Id de personaje para la vista epistémica")] = None,
    sesion: Annotated[int | None, Query(ge=0, description="Estado del mundo en la sesión N")] = None,
    sesiones: bool = False,
    limite: Annotated[int, Query(ge=10, le=5000)] = 2000,
) -> Grafo:
    return kernel.graphview.graph(camp, lang, tipo, faccion, centro, profundidad, relacion, vista, sesion,
                                  sesiones, limite)


# -------------------------------------------------------------------- SPARQL
@router.post("/sparql", tags=["sparql"], summary="Consulta SPARQL de solo lectura",
             description="Destino 'local' (admite SERVICE para federar), 'wikidata' o 'dbpedia'. "
                         "Los prefijos de la campaña están predeclarados.")
def sparql(camp: CampDep, consulta: ConsultaSparql, kernel: KernelDep, lang: LangDep) -> ResultadoSparql:
    return kernel.sparql.run(camp, consulta, lang)


@router.get("/sparql/ejemplos", tags=["sparql"], summary="Consultas de ejemplo (módulos) y guardadas")
def ejemplos(camp: CampDep, kernel: KernelDep) -> list[ConsultaEjemplo]:
    return kernel.sparql.examples(camp)


@router.post("/sparql/guardadas", tags=["sparql"], status_code=status.HTTP_201_CREATED,
             summary="Guardar una consulta")
def guardar_consulta(camp: CampDep, entrada: ConsultaGuardadaEntrada, kernel: KernelDep) -> ConsultaEjemplo:
    qid = kernel.aux.save_query(camp.id, entrada.titulo, entrada.descripcion, entrada.consulta)
    return ConsultaEjemplo(id=f"guardada:{qid}", titulo=entrada.titulo, descripcion=entrada.descripcion,
                           consulta=entrada.consulta, guardada=True)


@router.delete("/sparql/guardadas/{qid}", tags=["sparql"], status_code=status.HTTP_204_NO_CONTENT,
               summary="Borrar una consulta guardada")
def borrar_consulta(camp: CampDep, qid: str, kernel: KernelDep) -> Response:
    if not kernel.aux.delete_query(camp.id, qid.removeprefix("guardada:")):
        raise NotFound("Consulta no encontrada")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- coherencia
class MarcaIncoherencia(ApiModel):
    ignorada: bool


@router.get("/incoherencias", tags=["coherencia"], summary="Incoherencias detectadas en el mundo",
            description="Ejecuta las comprobaciones `checks/*.rq` del núcleo y de los módulos activos.")
def incoherencias(camp: CampDep, kernel: KernelDep, lang: LangDep, incluir_ignoradas: bool = False,
                  entidad: str | None = None) -> InformeCoherencia:
    iri = kernel.entities.resolve(camp, entidad) if entidad else None
    return kernel.coherence.check(camp, lang, incluir_ignoradas, iri)


@router.put("/incoherencias/{iid}", tags=["coherencia"], status_code=status.HTTP_204_NO_CONTENT,
            summary="Marcar una incoherencia como intencionada (ignorada) o volver a mostrarla")
def marcar_incoherencia(camp: CampDep, iid: str, marca: MarcaIncoherencia, kernel: KernelDep) -> Response:
    kernel.coherence.ignore(camp, iid, marca.ignorada)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------- conocimiento
@router.get("/conocimiento", tags=["conocimiento"], summary="Personajes con vista epistémica")
def personajes_con_conocimiento(camp: CampDep, kernel: KernelDep, lang: LangDep) -> list[EntidadRef]:
    return kernel.knowledge.characters(camp, lang)


@router.get("/conocimiento/{eid}", tags=["conocimiento"], summary="Creencias de un personaje frente al canon")
def conocimiento(camp: CampDep, eid: str, kernel: KernelDep, lang: LangDep) -> ConocimientoPersonaje:
    return kernel.knowledge.beliefs(camp, eid, lang)


@router.post("/conocimiento/{eid}", tags=["conocimiento"], summary="Añadir creencias (escritura humana directa)")
def anadir_creencias(camp: CampDep, eid: str, tripletas: list[TripletaEntrada], kernel: KernelDep,
                     lang: LangDep, actor: ActorDep) -> CambioRespuesta:
    return CambioRespuesta(cambio=kernel.knowledge.add(camp, eid, tripletas, actor, lang))


@router.post("/conocimiento/{eid}/eliminar", tags=["conocimiento"], summary="Eliminar creencias")
def eliminar_creencias(camp: CampDep, eid: str, tripletas: list[TripletaEntrada], kernel: KernelDep,
                       lang: LangDep, actor: ActorDep) -> CambioRespuesta:
    return CambioRespuesta(cambio=kernel.knowledge.remove(camp, eid, tripletas, actor, lang))


# ----------------------------------------------------------------- propuestas
@router.get("/propuestas", tags=["propuestas"], summary="Listado de propuestas")
def propuestas(camp: CampDep, kernel: KernelDep, lang: LangDep,
               estado: Literal["pendiente", "aprobada", "rechazada"] | None = None) -> list[PropuestaResumen]:
    return kernel.proposals.list(camp, estado, lang)


@router.post("/propuestas", tags=["propuestas"], summary="Crear propuesta (solo escribe en el grafo de propuestas)")
def crear_propuesta(camp: CampDep, entrada: PropuestaEntrada, kernel: KernelDep, lang: LangDep) -> ResultadoPropuesta:
    return kernel.proposals.create(camp, entrada, "agente", lang)


@router.post("/propuestas/aprobar-lote", tags=["propuestas"], summary="Aprobar varias propuestas")
def aprobar_lote(camp: CampDep, entrada: LoteEntrada, kernel: KernelDep, lang: LangDep,
                 actor: ActorDep) -> ResultadoLote:
    return kernel.proposals.approve_batch(camp, entrada.ids, entrada.nota, actor, lang)


@router.get("/propuestas/{pid}", tags=["propuestas"], summary="Detalle de una propuesta con diff legible")
def propuesta(camp: CampDep, pid: str, kernel: KernelDep, lang: LangDep) -> PropuestaDetalle:
    return kernel.proposals.detail(camp, pid, lang)


@router.get("/propuestas/{pid}/editable", tags=["propuestas"], summary="Tripletas de la propuesta para editarlas")
def propuesta_editable(camp: CampDep, pid: str, kernel: KernelDep) -> PropuestaEditable:
    anadir, eliminar = kernel.proposals.raw(camp, pid)
    return PropuestaEditable(anadir=anadir, eliminar=eliminar)


@router.post("/propuestas/{pid}/aprobar", tags=["propuestas"],
             summary="Aprobar (opcionalmente editando las tripletas antes)")
def aprobar(camp: CampDep, pid: str, revision: RevisionEntrada, kernel: KernelDep, lang: LangDep,
            actor: ActorDep) -> PropuestaResumen:
    return kernel.proposals.approve(camp, pid, revision, actor, lang)


@router.post("/propuestas/{pid}/rechazar", tags=["propuestas"], summary="Rechazar propuesta")
def rechazar(camp: CampDep, pid: str, revision: RevisionEntrada, kernel: KernelDep, lang: LangDep) -> PropuestaResumen:
    return kernel.proposals.reject(camp, pid, revision.nota, lang)
