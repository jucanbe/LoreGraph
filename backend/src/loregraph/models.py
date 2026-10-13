"""Modelos de datos de la API (y de los servicios). Generan el esquema OpenAPI
del que se derivan los tipos TypeScript del frontend."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from loregraph.apimodel import ApiModel
from loregraph.forms.schema import ClaseRef
from loregraph.modules.manifest import EstiloRelacion, EstiloTipo, Tema

# ---------------------------------------------------------------- comunes


class Actor(ApiModel):
    """Quién realiza un cambio."""

    tipo: Literal["humano", "agente"] = "humano"
    nombre: str
    peticion: str | None = Field(default=None, description="Petición que originó el cambio (agentes).")


class Termino(ApiModel):
    """Un término RDF presentado de forma legible."""

    tipo: Literal["iri", "literal", "blanco"]
    valor: str
    etiqueta: str
    id: str | None = Field(default=None, description="Identificador local si es una entidad.")
    clave: str | None = Field(default=None, description="Clave compacta si es un término de la ontología.")
    datatype: str | None = None
    idioma: str | None = None


class TripletaLegible(ApiModel):
    sujeto: Termino
    predicado: Termino
    objeto: Termino
    grafo: str | None = None


class TripletaEntrada(ApiModel):
    """Tripleta en JSON. Sujeto y predicado: IRI, clave compacta o id local.
    Objeto: igual, o un literal si se indica ``literal``/``datatype``/``idioma``."""

    s: str
    p: str
    o: str | int | float | bool
    literal: bool = False
    datatype: str | None = None
    idioma: str | None = None


class ErrorValidacion(ApiModel):
    foco: str | None = None
    focoId: str | None = None
    campo: str | None = Field(default=None, description="Clave compacta de la propiedad afectada.")
    mensaje: str
    severidad: Literal["violacion", "aviso", "info"] = "violacion"
    valor: str | None = None


class Pagina(ApiModel):
    total: int
    limite: int
    desplazamiento: int


# ---------------------------------------------------------------- módulos


class ModuloInfo(ApiModel):
    id: str
    nombre: str
    descripcion: str
    version: str
    categoria: str
    prefijo: str
    iri: str
    licencia: str | None = None
    depende_de: dict[str, str]
    clases_principales: list[str]
    tema: Tema | None = None
    estilos_tipos: dict[str, EstiloTipo] = Field(default_factory=dict)
    estilos_relaciones: dict[str, EstiloRelacion] = Field(default_factory=dict)


class TemaActivo(ApiModel):
    modulo: str
    tema: Tema
    urlBaseAssets: str


# ---------------------------------------------------------------- campañas


class CampanaEntrada(ApiModel):
    id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,60}$")
    nombre: str = Field(min_length=1)
    descripcion: str = ""
    modulos: list[str] = Field(default_factory=list)


class CampanaResumen(ApiModel):
    id: str
    iri: str
    nombre: str
    descripcion: str
    modulos: list[str]
    sistema: str = Field(description="Nombre legible del sistema de juego (módulos de sistema).")
    creada: str | None = None
    numEntidades: int = 0


class EntidadRef(ApiModel):
    id: str
    iri: str
    etiqueta: str
    tipo: ClaseRef | None = None
    descripcion: str | None = None
    editable: bool = True
    modificada: float | None = None


class TramaResumen(ApiModel):
    entidad: EntidadRef
    implicados: list[EntidadRef]


class SesionResumen(ApiModel):
    entidad: EntidadRef
    numero: int | None = None
    fecha: str | None = None
    fechaMundo: str | None = None
    notas: str | None = None


class PanelCampana(ApiModel):
    campana: CampanaResumen
    recuentos: dict[str, int] = Field(description="Clave compacta de clase principal → número de entidades.")
    recientes: list[EntidadRef]
    tramasAbiertas: list[TramaResumen]
    propuestasPendientes: int
    incoherencias: int = Field(default=0, description="Incoherencias activas (errores + avisos no ignorados).")
    ultimaSesion: SesionResumen | None = None
    tema: TemaActivo | None = None


class TipoEntidad(ApiModel):
    """Clase principal para el explorador (pestañas)."""

    clase: ClaseRef
    descripcion: str | None = None
    modulo: str | None = None
    recuento: int = 0
    estilo: EstiloTipo = Field(default_factory=EstiloTipo)
    variantes: list[ClaseRef] = Field(default_factory=list)


class EstiloRelacionInfo(ApiModel):
    clave: str
    iri: str
    etiqueta: str
    estilo: EstiloRelacion


class InfoCampana(ApiModel):
    """Todo lo que el frontend necesita para presentar la campaña sin conocer los módulos."""

    campana: CampanaResumen
    tipos: list[TipoEntidad]
    relaciones: list[EstiloRelacionInfo]
    prefijos: dict[str, str]
    tema: TemaActivo | None = None


# ---------------------------------------------------------------- entidades


class Valor(ApiModel):
    """Valor de una propiedad en la ficha de una entidad."""

    tipo: Literal["iri", "literal", "objeto"]
    valor: Any
    etiqueta: str
    id: str | None = None
    clave: str | None = None
    clase: ClaseRef | None = None
    datatype: str | None = None
    idioma: str | None = None
    campos: list[CampoValores] | None = Field(default=None, description="Campos del nodo anidado (tipo objeto).")


class CampoValores(ApiModel):
    id: str
    ruta: str
    etiqueta: str
    tipo: str | None = None
    widget: str | None = None
    valores: list[Valor]


class GrupoValores(ApiModel):
    id: str | None
    etiqueta: str
    campos: list[CampoValores]


class Relacion(ApiModel):
    """Arista entre la entidad y otra entidad (directa o cualificada)."""

    propiedad: Termino
    otra: EntidadRef
    direccion: Literal["saliente", "entrante"]
    cualificada: bool = False
    tipoRelacion: Termino | None = None
    intensidad: int | None = None
    desde: EntidadRef | None = None
    hasta: EntidadRef | None = None
    nodo: str | None = None


class Entidad(ApiModel):
    id: str
    iri: str
    campana: str
    etiqueta: str
    descripcion: str | None = None
    tipo: ClaseRef | None = None
    clases: list[ClaseRef]
    editable: bool = True
    origen: str = Field(description="'campana' o 'modulo:<id>' si procede del vocabulario de un módulo.")
    grupos: list[GrupoValores]
    valores: dict[str, list[Valor]] = Field(description="Todos los valores por clave compacta de propiedad.")
    relaciones: list[Relacion]
    imagenes: list[str] = Field(default_factory=list)
    anclasReales: list[Valor] = Field(default_factory=list)
    creada: float | None = None
    modificada: float | None = None


class EntidadEntrada(ApiModel):
    """Datos para crear o editar una entidad.

    ``valores``: clave compacta de propiedad → lista de valores. Literales como
    texto, número o booleano; referencias como id local, clave compacta o IRI;
    objetos anidados como ``{"iri"?: str, "valores": {...}}``.
    """

    clases: list[str] = Field(min_length=1, description="Clase principal y variantes (claves compactas).")
    valores: dict[str, list[Any]]
    id: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,80}$")


class ListaEntidades(ApiModel):
    elementos: list[EntidadRef]
    pagina: Pagina


class ResultadoEscritura(ApiModel):
    id: str
    iri: str
    cambio: str


class CambioInfo(ApiModel):
    id: str
    fecha: str
    agente: Actor
    peticion: str | None = None
    propuesta: str | None = None
    anadidas: list[TripletaLegible]
    eliminadas: list[TripletaLegible]
    deshace: str | None = Field(default=None, description="Id del cambio que este deshace.")
    deshechoPor: str | None = Field(default=None, description="Id del cambio que deshizo este.")


class HechoTemporal(ApiModel):
    """Valor que tuvo una propiedad temporal durante un intervalo de sesiones."""

    propiedad: Termino
    valor: Termino
    desde: EntidadRef | None = None
    hasta: EntidadRef | None = None
    vigente: bool


# ---------------------------------------------------------------- búsqueda


class ResultadoBusqueda(ApiModel):
    entidad: EntidadRef
    campana: str
    puntuacion: float


# ---------------------------------------------------------------- grafo


class NodoGrafo(ApiModel):
    id: str
    iri: str
    etiqueta: str
    tipo: str | None = Field(default=None, description="Clave compacta de la clase principal.")
    clases: list[str] = Field(default_factory=list)
    color: str | None = None
    forma: str | None = None
    icono: str | None = None
    estadoEpistemico: Literal["confirmado", "falso", "no_verificado", "desconocido"] | None = None


class AristaGrafo(ApiModel):
    id: str
    origen: str
    destino: str
    propiedad: str = Field(description="Clave compacta de la propiedad o del tipo de relación.")
    etiqueta: str
    cualificada: bool = False
    intensidad: int | None = None
    color: str | None = None
    linea: str | None = None
    ancho: float | None = None
    estadoEpistemico: Literal["confirmado", "falso", "no_verificado", "desconocido"] | None = None


class Grafo(ApiModel):
    nodos: list[NodoGrafo]
    aristas: list[AristaGrafo]
    truncado: bool = False


# ---------------------------------------------------------------- SPARQL


class ConsultaSparql(ApiModel):
    consulta: str
    limite: int | None = Field(default=None, ge=1)
    timeout: float | None = Field(default=None, gt=0, description="Segundos.")
    destino: Literal["local", "wikidata", "dbpedia"] = "local"


class ResultadoSparql(ApiModel):
    tipo: Literal["select", "ask", "construct"]
    variables: list[str] = Field(default_factory=list)
    filas: list[dict[str, Termino]] = Field(default_factory=list)
    booleano: bool | None = None
    tripletas: list[TripletaLegible] = Field(default_factory=list)
    truncado: bool = False
    duracion: float = 0
    cache: bool = False


class ConsultaEjemplo(ApiModel):
    id: str
    titulo: str
    descripcion: str
    consulta: str
    modulo: str | None = None
    guardada: bool = False


class ConsultaGuardadaEntrada(ApiModel):
    titulo: str = Field(min_length=1)
    descripcion: str = ""
    consulta: str = Field(min_length=1)


# ---------------------------------------------------------------- mundo real


class HechoReal(ApiModel):
    propiedad: str
    etiqueta: str
    valores: list[str]


class MundoReal(ApiModel):
    iri: str
    fuente: Literal["wikidata", "dbpedia"]
    relacion: str = Field(description="Clave compacta de la propiedad de anclaje (rpg:inspiredBy…).")
    etiqueta: str | None = None
    descripcion: str | None = None
    resumen: str | None = None
    imagen: str | None = None
    latitud: float | None = None
    longitud: float | None = None
    hechos: list[HechoReal] = Field(default_factory=list)
    enlace: str | None = None
    error: str | None = None


class MundoRealEntidad(ApiModel):
    entidad: EntidadRef
    anclas: list[MundoReal]


# ---------------------------------------------------------------- sesiones


class SesionLinea(ApiModel):
    sesion: SesionResumen
    entidades: list[EntidadRef]


# ---------------------------------------------------------------- conocimiento


class Creencia(ApiModel):
    tripleta: TripletaLegible
    estado: Literal["confirmado", "falso", "no_verificado"]
    canon: list[Termino] = Field(default_factory=list, description="Valor canónico si la creencia es falsa.")


class ConocimientoPersonaje(ApiModel):
    personaje: EntidadRef
    creencias: list[Creencia]


# ---------------------------------------------------------------- propuestas


class EntidadPropuesta(ApiModel):
    """Entidad nueva o existente dentro de una propuesta estructurada.

    ``ref``: id de una entidad existente, o una clave temporal (p. ej. ``nuevo:1``)
    para entidades nuevas a las que pueden referirse otros valores de la propuesta.
    """

    ref: str
    clases: list[str] = Field(default_factory=list)
    valores: dict[str, list[Any]] = Field(default_factory=dict)


class PropuestaEntrada(ApiModel):
    agente: str = Field(min_length=1)
    peticion: str = Field(min_length=1, description="Petición o instrucción que generó la propuesta.")
    resumen: str | None = None
    destino: str = Field(default="canon", description="'canon' o 'conocimiento/<id de personaje>'.")
    entidades: list[EntidadPropuesta] = Field(default_factory=list)
    anadir: list[TripletaEntrada] = Field(default_factory=list)
    eliminar: list[TripletaEntrada] = Field(default_factory=list)
    turtle: str | None = Field(default=None, description="Tripletas adicionales en Turtle.")


class PropuestaResumen(ApiModel):
    id: str
    iri: str
    estado: Literal["pendiente", "aprobada", "rechazada"]
    agente: str
    tipoAgente: str
    peticion: str
    resumen: str | None = None
    destino: str
    creada: str
    revisada: str | None = None
    notaRevision: str | None = None
    numAnadidas: int
    numEliminadas: int
    entidades: list[EntidadRef] = Field(default_factory=list)


class PropuestaDetalle(PropuestaResumen):
    anadidas: list[TripletaLegible]
    eliminadas: list[TripletaLegible]
    errores: list[ErrorValidacion] = Field(default_factory=list)


class ResultadoPropuesta(ApiModel):
    ok: bool
    propuesta: PropuestaResumen | None = None
    errores: list[ErrorValidacion] = Field(default_factory=list)


class RevisionEntrada(ApiModel):
    nota: str | None = None
    anadir: list[TripletaEntrada] | None = Field(
        default=None, description="Si se indica, sustituye las tripletas a añadir (editar antes de aprobar)."
    )
    eliminar: list[TripletaEntrada] | None = None


class LoteEntrada(ApiModel):
    ids: list[str] = Field(min_length=1)
    nota: str | None = None


class ResultadoLote(ApiModel):
    aprobadas: list[str]
    fallidas: dict[str, list[ErrorValidacion]]


Valor.model_rebuild()
