/**
 * Manejadores MSW por defecto: una API falsa con estado en memoria.
 *
 * - Rutas con el prefijo del cliente (`/api`); usa `apiPath('/campanas/:cid')`
 *   para escribir tus propios manejadores con `server.use(...)`.
 * - `mockDb` guarda las propuestas: aprobar/rechazar cambian su estado y el
 *   listado lo refleja (como en el backend). Se reinicia tras cada test
 *   (`resetMockDb` en `setup.ts`).
 * - `requestLog` registra cada petición (método, ruta, query y cuerpo JSON)
 *   para comprobar en los tests qué se envió: `lastRequest('POST', /aprobar$/)`.
 */
import { delay, http, HttpResponse } from 'msw'
import type { Schemas } from '@/api/client'
import type { PropuestaDetalle } from '@/api/hooks'
import {
  CID,
  editableDe,
  entidadLucia,
  errorValidacion,
  estadoAgente,
  incoherencias,
  informeDe,
  infoCampana,
  panelCampana,
  personajesConConocimiento,
  propuestas,
  respuestaAgente,
  resultadoGeneracion,
  toResumen,
} from './fixtures'

/** Patrón de ruta MSW para un camino de la API (coincide con cualquier origen). */
export function apiPath(path: string): string {
  return `*/api${path}`
}

// ------------------------------------------------------------- base en memoria
interface MockDb {
  propuestas: PropuestaDetalle[]
  incoherencias: Schemas['Incoherencia'][]
}

export const mockDb: MockDb = { propuestas: [], incoherencias: [] }

export function resetMockDb(): void {
  mockDb.propuestas = structuredClone(propuestas)
  mockDb.incoherencias = structuredClone(incoherencias)
  requestLog.length = 0
}

// --------------------------------------------------------- registro de peticiones
export interface LoggedRequest {
  method: string
  /** Ruta sin el prefijo `/api` (p. ej. `/campanas/x/propuestas/y/aprobar`). */
  path: string
  query: URLSearchParams
  body: unknown
}

export const requestLog: LoggedRequest[] = []

/** Última petición que coincide con el método y la ruta (texto exacto o expresión regular). */
export function lastRequest(method: string, path: string | RegExp): LoggedRequest | undefined {
  return [...requestLog]
    .reverse()
    .find((r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)))
}

/**
 * Registra una petición (lo llama `server.ts` en el evento `request:start`, así
 * que también quedan registradas las que atienden manejadores de `server.use`).
 * El cuerpo se lee de forma asíncrona: en los tests, compruébalo dentro de `waitFor`.
 */
export function logRequest(request: Request): void {
  const url = new URL(request.url)
  const entry: LoggedRequest = {
    method: request.method,
    path: url.pathname.replace(/^\/api/, ''),
    query: url.searchParams,
    body: undefined,
  }
  requestLog.push(entry)
  if (request.method === 'GET' || request.method === 'HEAD') return
  void request
    .clone()
    .text()
    .then((text) => {
      try {
        entry.body = text ? JSON.parse(text) : undefined
      } catch {
        entry.body = text
      }
    })
    // Cuerpos en flujo (multipart) pueden cerrarse al terminar el test: no es un fallo de la prueba.
    .catch(() => undefined)
}

resetMockDb()

// ------------------------------------------------------------------ utilidades
function notFound(detalle: string) {
  return HttpResponse.json({ detalle, errores: [] }, { status: 404 })
}

function conflict(detalle: string) {
  return HttpResponse.json({ detalle, errores: [] }, { status: 409 })
}

function findPropuesta(pid: string): PropuestaDetalle | undefined {
  return mockDb.propuestas.find((p) => p.id === pid)
}

const AHORA = '2026-10-13T13:00:00Z'

function revisar(p: PropuestaDetalle, estado: 'aprobada' | 'rechazada', nota: string | null | undefined): void {
  p.estado = estado
  p.revisada = AHORA
  p.notaRevision = nota ?? null
  p.errores = []
}

// ------------------------------------------------------------------ manejadores
export const handlers = [
  http.get(apiPath('/campanas'), () => HttpResponse.json([infoCampana.campana])),

  http.get(apiPath('/campanas/:cid'), ({ params }) =>
    params.cid === CID ? HttpResponse.json(infoCampana) : notFound(`No existe la campaña '${String(params.cid)}'`),
  ),

  http.get(apiPath('/campanas/:cid/panel'), () =>
    HttpResponse.json({
      ...panelCampana,
      propuestasPendientes: mockDb.propuestas.filter((p) => p.estado === 'pendiente').length,
    }),
  ),

  http.get(apiPath('/campanas/:cid/conocimiento'), () => HttpResponse.json(personajesConConocimiento)),

  // ------------------------------------------------------------- propuestas
  http.get(apiPath('/campanas/:cid/propuestas'), ({ request }) => {
    const estado = new URL(request.url).searchParams.get('estado')
    const lista = mockDb.propuestas.filter((p) => !estado || p.estado === estado).map(toResumen)
    return HttpResponse.json(lista)
  }),

  http.post(apiPath('/campanas/:cid/propuestas/aprobar-lote'), async ({ request }) => {
    const body = (await request.json()) as Schemas['LoteEntrada']
    const res: Schemas['ResultadoLote'] = { aprobadas: [], fallidas: {} }
    for (const pid of body.ids) {
      const p = findPropuesta(pid)
      if (!p) res.fallidas[pid] = [errorValidacion({ mensaje: `No existe la propuesta '${pid}'` })]
      else if (p.estado !== 'pendiente')
        res.fallidas[pid] = [errorValidacion({ mensaje: `La propuesta ya está ${p.estado}` })]
      else {
        revisar(p, 'aprobada', body.nota)
        res.aprobadas.push(pid)
      }
    }
    return HttpResponse.json(res)
  }),

  http.get(apiPath('/campanas/:cid/propuestas/:pid'), ({ params }) => {
    const p = findPropuesta(String(params.pid))
    return p ? HttpResponse.json(p) : notFound(`No existe la propuesta '${String(params.pid)}'`)
  }),

  http.get(apiPath('/campanas/:cid/propuestas/:pid/editable'), ({ params }) => {
    const p = findPropuesta(String(params.pid))
    return p ? HttpResponse.json(editableDe(p)) : notFound(`No existe la propuesta '${String(params.pid)}'`)
  }),

  http.post(apiPath('/campanas/:cid/propuestas/:pid/:accion'), async ({ params, request }) => {
    const accion = String(params.accion)
    if (accion !== 'aprobar' && accion !== 'rechazar') return undefined
    const p = findPropuesta(String(params.pid))
    if (!p) return notFound(`No existe la propuesta '${String(params.pid)}'`)
    if (p.estado !== 'pendiente') return conflict(`La propuesta ya está ${p.estado}`)
    const body = (await request.json()) as Schemas['RevisionEntrada']
    revisar(p, accion === 'aprobar' ? 'aprobada' : 'rechazada', body.nota)
    return HttpResponse.json(toResumen(p))
  }),

  // ------------------------------------------------------------- entidades
  http.get(apiPath('/campanas/:cid/entidades/:eid'), ({ params }) =>
    params.eid === entidadLucia.id ? HttpResponse.json(entidadLucia) : notFound(`No existe la entidad '${String(params.eid)}'`),
  ),

  http.get(apiPath('/campanas/:cid/entidades/:eid/historia-temporal'), () =>
    HttpResponse.json([] satisfies Schemas['HechoTemporal'][]),
  ),

  http.get(apiPath('/campanas/:cid/entidades/:eid/mapas'), () => HttpResponse.json([] satisfies Schemas['Mapa'][])),

  http.post(apiPath('/campanas/:cid/entidades/:eid/retratos'), ({ params }) =>
    HttpResponse.json(
      {
        nodo: `https://loregraph.example.org/data/campaign/${CID}/entity/${String(params.eid)}/img/1`,
        url: `/media/${CID}/${String(params.eid)}-1.png`,
        origen: 'subida',
      } satisfies Schemas['Imagen'],
      { status: 201 },
    ),
  ),

  http.delete(apiPath('/campanas/:cid/entidades/:eid/retratos'), () => new HttpResponse(null, { status: 204 })),

  // ------------------------------------------------------------ coherencia
  http.get(apiPath('/campanas/:cid/incoherencias'), ({ request }) => {
    const q = new URL(request.url).searchParams
    const entidad = q.get('entidad')
    const lista = mockDb.incoherencias.filter(
      (i) => !entidad || i.entidad.iri === entidad || i.entidad.id === entidad || i.relacionadas.some((r) => r.iri === entidad),
    )
    return HttpResponse.json(informeDe(lista, q.get('incluir_ignoradas') === 'true'))
  }),

  http.put(apiPath('/campanas/:cid/incoherencias/:iid'), async ({ params, request }) => {
    const i = mockDb.incoherencias.find((x) => x.id === params.iid)
    if (!i) return notFound(`No existe la incoherencia '${String(params.iid)}'`)
    const body = (await request.json()) as Schemas['MarcaIncoherencia']
    i.ignorada = body.ignorada
    return new HttpResponse(null, { status: 204 })
  }),

  // -------------------------------------------------------------- generador
  http.post(apiPath('/campanas/:cid/generar'), async () => {
    await delay(20)
    return HttpResponse.json(resultadoGeneracion, { status: 201 })
  }),

  // ----------------------------------------------------------------- agente
  http.get(apiPath('/campanas/:cid/agente'), () => HttpResponse.json(estadoAgente)),

  http.get(apiPath('/campanas/:cid/contexto-llm'), () =>
    HttpResponse.json({
      campana: 'Noches de Madrid',
      descripcion: 'Crónica de ejemplo.',
      modulos: [],
      texto: '# Campaña: Noches de Madrid\n\n## Sistema: Vampiro\nHorror personal en el mundo actual.\n',
      recortado: true,
    }),
  ),

  http.post(apiPath('/campanas/:cid/agente'), async () => {
    await delay(20)
    return HttpResponse.json(respuestaAgente)
  }),
]
