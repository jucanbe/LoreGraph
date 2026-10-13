/**
 * Cliente HTTP tipado, generado a partir del contrato OpenAPI del backend.
 * Los tipos (`schema.d.ts`) se regeneran con `make types`.
 */
import createClient, { type Middleware } from 'openapi-fetch'
import i18n from '@/i18n'
import type { components, paths } from './schema'

export type Schemas = components['schemas']
export type ErrorValidacion = Schemas['ErrorValidacion']

export const API_BASE = '/api'

/** Error de la API con los errores de validación (SHACL) adjuntos. */
export class ApiError extends Error {
  readonly status: number
  readonly errores: ErrorValidacion[]

  constructor(status: number, detalle: string, errores: ErrorValidacion[] = []) {
    super(detalle)
    this.name = 'ApiError'
    this.status = status
    this.errores = errores
  }
}

const languageMiddleware: Middleware = {
  onRequest({ request }) {
    request.headers.set('Accept-Language', i18n.language?.startsWith('en') ? 'en' : 'es')
    return request
  },
}

export const api = createClient<paths>({ baseUrl: API_BASE })
api.use(languageMiddleware)

interface FetchResult<T> {
  data?: T
  error?: unknown
  response: Response
}

/** Desenvuelve una respuesta de openapi-fetch: devuelve los datos o lanza `ApiError`. */
export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  let result: FetchResult<T>
  try {
    result = await promise
  } catch {
    throw new ApiError(0, i18n.t('errores.red'), [])
  }
  const { data, error, response } = result
  if (error !== undefined || !response.ok) {
    const body = (error ?? {}) as { detalle?: string; errores?: ErrorValidacion[]; detail?: unknown }
    const detalle = body.detalle ?? (typeof body.detail === 'string' ? body.detail : response.statusText)
    throw new ApiError(response.status, detalle || i18n.t('errores.desconocido'), body.errores ?? [])
  }
  return data as T
}

/** URL absoluta de un recurso estático de un módulo (fuentes, texturas…). */
export function assetUrl(base: string, path: string): string {
  return `${API_BASE}${base}${path}`
}

/** URL utilizable de una imagen subida: las rutas `/media/…` del backend van tras el prefijo de la API. */
export function mediaUrl(url: string): string {
  return url.startsWith('/media/') ? `${API_BASE}${url}` : url
}

/** Envío multipart (subida de archivos): openapi-fetch no serializa `FormData` con tipos. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  return unwrap<T>(
    fetch(`${API_BASE}${path}`, {
      method: 'POST',
      body: form,
      headers: { 'Accept-Language': i18n.language?.startsWith('en') ? 'en' : 'es' },
    }).then(async (response) => {
      const body: unknown = await response.json().catch(() => undefined)
      return response.ok ? { data: body as T, response } : { error: body ?? {}, response }
    }),
  )
}
