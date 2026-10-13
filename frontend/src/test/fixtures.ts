/**
 * Datos de prueba con la forma REAL de la API.
 *
 * Los objetos `raw*` de `fixtures-data.ts` se capturaron de un backend real
 * (`loregraph seed` + `loregraph-api`). Aquí se exponen con nombres estables y se
 * derivan casos adicionales (aprobada, rechazada, humano…) sin inventar
 * campos que la API no devuelve.
 *
 * Todos los fixtures son inmutables: clónalos con `structuredClone` antes de
 * modificarlos (los manejadores de MSW ya lo hacen en `resetMockDb`).
 */
import type { Schemas } from '@/api/client'
import type {
  InfoCampana,
  PropuestaDetalle,
  PropuestaResumen,
  Termino,
  TripletaEntradaSalida,
  TripletaLegible,
} from '@/api/hooks'
import {
  rawDetalleConocimiento,
  rawDetalleNuevoPnj,
  rawError422,
  rawError502,
  rawEstadoAgente,
  rawInfoCampana,
  rawPanel,
  rawPersonajesConConocimiento,
  rawPropuestaAprobada,
  rawResultadoLoteFallido,
} from './fixtures-data'

export type ErrorValidacion = Schemas['ErrorValidacion']
export type EstadoAgente = Schemas['EstadoAgente']
export type RespuestaAgente = Schemas['RespuestaAgente']
export type ResultadoLote = Schemas['ResultadoLote']
export type PanelCampana = Schemas['PanelCampana']

/** Campaña de los fixtures. */
export const CID = 'noches-de-madrid'

// ------------------------------------------------------------------- campaña
/** `GET /campanas/{cid}`: tipos con estilos, prefijos y tema de módulo. */
export const infoCampana: InfoCampana = rawInfoCampana
/** `GET /campanas/{cid}/panel`. `propuestasPendientes` lo recalculan los manejadores. */
export const panelCampana: PanelCampana = rawPanel
/** `GET /campanas/{cid}/conocimiento`: personajes con grafo de conocimiento propio. */
export const personajesConConocimiento: Schemas['EntidadRef'][] = rawPersonajesConConocimiento

// ---------------------------------------------------------------- propuestas
/**
 * Propuesta pendiente de un agente MCP que crea un PNJ completo (22 tripletas):
 * tipos, literales con datatype, enlaces a entidades, conceptos y dos nodos
 * cualificados anidados (`…/n/<hash>`).
 */
export const propuestaNuevoPnj: PropuestaDetalle = rawDetalleNuevoPnj
/** Propuesta pendiente de un modelo local con destino `conocimiento/lucia-vega` (1 tripleta). */
export const propuestaConocimiento: PropuestaDetalle = rawDetalleConocimiento

/** Propuesta aprobada (derivada de una aprobación real) con nota de revisión. */
export const propuestaAprobada: PropuestaDetalle = {
  ...rawPropuestaAprobada,
  id: 'c0ffee0001',
  iri: rawPropuestaAprobada.iri.replace(rawPropuestaAprobada.id, 'c0ffee0001'),
  notaRevision: 'Encaja con lo jugado en la sesión 3.',
  anadidas: rawDetalleConocimiento.anadidas,
  eliminadas: [],
  errores: [],
}

/** Propuesta humana rechazada que eliminaba una tripleta del canon. */
export const propuestaRechazada: PropuestaDetalle = {
  ...rawPropuestaAprobada,
  id: 'deadbeef02',
  iri: rawPropuestaAprobada.iri.replace(rawPropuestaAprobada.id, 'deadbeef02'),
  estado: 'rechazada',
  agente: 'juan',
  tipoAgente: 'humano',
  peticion: 'Bruno Calvo ya no conoce al padre Larra.',
  resumen: null,
  destino: 'canon',
  creada: '2026-10-12T20:10:00Z',
  revisada: '2026-10-12T21:00:00Z',
  notaRevision: 'Contradice la sesión 2.',
  numAnadidas: 0,
  numEliminadas: 1,
  anadidas: [],
  eliminadas: rawDetalleConocimiento.anadidas,
  errores: [],
}

/** Todas las propuestas, en el orden en que las devuelve la API (más recientes primero). */
export const propuestas: PropuestaDetalle[] = [
  propuestaConocimiento,
  propuestaNuevoPnj,
  propuestaAprobada,
  propuestaRechazada,
]

/** Resumen de una propuesta (lo que devuelve el listado) a partir de su detalle. */
export function toResumen(d: PropuestaDetalle): PropuestaResumen {
  const { anadidas: _a, eliminadas: _e, errores: _r, ...resumen } = d
  return resumen
}

/** Tripleta en formato editable (`GET …/editable`) a partir de su forma legible. */
export function toEntrada(t: TripletaLegible): TripletaEntradaSalida {
  const o = t.objeto
  return {
    s: t.sujeto.valor,
    p: t.predicado.valor,
    o: o.valor,
    literal: o.tipo === 'literal',
    datatype: o.tipo === 'literal' ? (o.datatype ?? null) : null,
    idioma: o.tipo === 'literal' ? (o.idioma ?? null) : null,
  }
}

/** `GET …/editable` de una propuesta. */
export function editableDe(d: PropuestaDetalle): Schemas['PropuestaEditable'] {
  return { anadir: d.anadidas.map(toEntrada), eliminar: d.eliminadas.map(toEntrada) }
}

/** Busca una tripleta añadida por la clave compacta del predicado (y opcionalmente el sujeto). */
export function tripletaPorPredicado(d: PropuestaDetalle, clave: string, sujetoId?: string): TripletaLegible {
  const t = d.anadidas.find((x) => x.predicado.clave === clave && (!sujetoId || x.sujeto.id === sujetoId))
  if (!t) throw new Error(`No hay tripleta con predicado ${clave}`)
  return t
}

// -------------------------------------------------------------------- errores
/** Cuerpo real de un 422 (`ValidationFailed`). */
export const error422: Schemas['ErrorRespuesta'] = rawError422
/** Cuerpo real de un 502 cuando el servidor del modelo (Ollama) no está arrancado. */
export const error502: Schemas['ErrorRespuesta'] = rawError502
/** Resultado real de `aprobar-lote` con una propuesta inexistente. */
export const resultadoLoteFallido: ResultadoLote = rawResultadoLoteFallido

/** Construye un error de validación con valores por defecto realistas. */
export function errorValidacion(over: Partial<ErrorValidacion> = {}): ErrorValidacion {
  return {
    foco: null,
    focoId: null,
    campo: null,
    mensaje: 'Los datos no son válidos',
    severidad: 'violacion',
    valor: null,
    ...over,
  }
}

// --------------------------------------------------------------------- agente
/** `GET /campanas/{cid}/agente`. */
export const estadoAgente: EstadoAgente = rawEstadoAgente

/** `POST /campanas/{cid}/agente` con éxito (crea una propuesta). */
export const respuestaAgente: RespuestaAgente = {
  respuesta: 'He creado una propuesta con el nuevo PNJ. Revísala en la bandeja de propuestas.',
  propuestas: [propuestaNuevoPnj.id],
  herramientas: ['buscar_entidades', 'describir_clase', 'proponer_triples'],
  modelo: rawEstadoAgente.modelo,
}

// ----------------------------------------------------------------- entidades
const ENT = `https://loregraph.example.org/data/campaign/${CID}/entity/`
const PNJ: Schemas['ClaseRef'] = {
  iri: 'https://loregraph.example.org/ont/core#NonPlayerCharacter',
  clave: 'rpg:NonPlayerCharacter',
  etiqueta: 'PNJ',
}
const SESION: Schemas['ClaseRef'] = {
  iri: 'https://loregraph.example.org/ont/core#Session',
  clave: 'rpg:Session',
  etiqueta: 'Sesión',
}

/** Referencia a una entidad de la campaña. */
export function refEntidad(id: string, etiqueta: string, tipo: Schemas['ClaseRef'] | null = PNJ): Schemas['EntidadRef'] {
  return { id, iri: ENT + id, etiqueta, tipo, descripcion: null, editable: true, modificada: null }
}

/** `GET /campanas/{cid}/entidades/{eid}`: ficha mínima de un PNJ editable, sin retrato. */
export const entidadLucia: Schemas['Entidad'] = {
  id: 'lucia-vega',
  iri: ENT + 'lucia-vega',
  campana: CID,
  etiqueta: 'Lucía Vega',
  descripcion: 'Periodista que investiga desapariciones en Lavapiés.',
  tipo: PNJ,
  clases: [PNJ],
  editable: true,
  origen: 'campana',
  grupos: [],
  valores: {},
  relaciones: [],
  imagenes: [],
  anclasReales: [],
  creada: null,
  modificada: null,
}

/** `GET …/historia-temporal`: la afiliación de Lucía cambió en la sesión 2. */
export const historiaLucia: Schemas['HechoTemporal'][] = [
  {
    propiedad: { ...terminoEntidad('x', 'Miembro de'), valor: 'https://loregraph.example.org/ont/core#memberOf', id: null, clave: 'rpg:memberOf' },
    valor: terminoEntidad('anarquistas-lavapies', 'Anarquistas de Lavapiés'),
    desde: null,
    hasta: refEntidad('sesion-2', 'Sesión 2: Sangre en el Rastro', SESION),
    vigente: false,
  },
  {
    propiedad: { ...terminoEntidad('x', 'Miembro de'), valor: 'https://loregraph.example.org/ont/core#memberOf', id: null, clave: 'rpg:memberOf' },
    valor: terminoEntidad('camarilla-madrid', 'Camarilla de Madrid'),
    desde: refEntidad('sesion-2', 'Sesión 2: Sangre en el Rastro', SESION),
    hasta: null,
    vigente: true,
  },
]

// -------------------------------------------------------------- coherencia
/** Incoherencias de ejemplo: un error, un aviso y un aviso ya ignorado. */
export const incoherencias: Schemas['Incoherencia'][] = [
  {
    id: 'muerto-activo-1',
    regla: 'core:muerto-activo',
    titulo: 'Personaje muerto que sigue actuando',
    descripcion: 'Un personaje destruido aparece en sesiones posteriores a su muerte.',
    severidad: 'error',
    mensajes: ['Bruno Calvo murió en la sesión 1 pero participa en la sesión 3.'],
    entidad: refEntidad('bruno-calvo', 'Bruno Calvo'),
    relacionadas: [refEntidad('sesion-3', 'Sesión 3: La capilla bajo el templo', SESION)],
    ignorada: false,
  },
  {
    id: 'faccion-doble-2',
    regla: 'core:faccion-doble',
    titulo: 'Miembro de facciones enfrentadas',
    descripcion: 'Una entidad pertenece a la vez a dos facciones enemigas.',
    severidad: 'aviso',
    mensajes: ['Lucía Vega es miembro de la Camarilla y de los Anarquistas.'],
    entidad: refEntidad('lucia-vega', 'Lucía Vega'),
    relacionadas: [],
    ignorada: false,
  },
  {
    id: 'sin-sire-3',
    regla: 'vtm:sin-sire',
    titulo: 'Vástago sin sire',
    descripcion: 'Un vástago no tiene sire registrado.',
    severidad: 'aviso',
    mensajes: [],
    entidad: refEntidad('padre-larra', 'Padre Larra'),
    relacionadas: [],
    ignorada: true,
  },
]

/** Informe de coherencia como lo calcula el backend a partir de una lista. */
export function informeDe(lista: Schemas['Incoherencia'][], incluirIgnoradas: boolean): Schemas['InformeCoherencia'] {
  const activas = lista.filter((i) => !i.ignorada)
  return {
    incoherencias: incluirIgnoradas ? lista : activas,
    errores: activas.filter((i) => i.severidad === 'error').length,
    avisos: activas.filter((i) => i.severidad === 'aviso').length,
    ignoradas: lista.length - activas.length,
    reglas: 12,
  }
}

// --------------------------------------------------------------- generador
/** `POST /campanas/{cid}/generar` con éxito. */
export const resultadoGeneracion: Schemas['ResultadoGeneracion'] = {
  propuesta: { ...toResumen(propuestaNuevoPnj), id: 'gen0000001' },
  entidades: [
    {
      nombre: 'Marta Ibáñez',
      valores: {
        'rdfs:label': ['Marta Ibáñez'],
        'schema:description': ['Forense del Anatómico que vende sangre a la Camarilla.'],
        'rpg:backstory': ['Creció en Vallecas…'],
      },
    },
  ],
  modelo: 'ollama:qwen3:14b',
  reintentos: 1,
}

// -------------------------------------------------------------- utilidades
/** Término IRI de entidad de la campaña (para construir tripletas a mano). */
export function terminoEntidad(id: string, etiqueta: string): Termino {
  return {
    tipo: 'iri',
    valor: `https://loregraph.example.org/data/campaign/${CID}/entity/${id}`,
    etiqueta,
    id,
    clave: null,
    datatype: null,
    idioma: null,
  }
}
