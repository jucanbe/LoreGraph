import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { api, ApiError, assetUrl, unwrap } from '@/api/client'
import { CID, error422, infoCampana } from '@/test/fixtures'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'

describe('unwrap', () => {
  it('devuelve los datos de una respuesta correcta', async () => {
    const data = await unwrap(api.GET('/campanas/{cid}', { params: { path: { cid: CID } } }))
    expect(data.campana.nombre).toBe(infoCampana.campana.nombre)
  })

  it('envía Accept-Language según el idioma de la interfaz', async () => {
    let lang: string | null = null
    server.use(
      http.get(apiPath('/campanas'), ({ request }) => {
        lang = request.headers.get('Accept-Language')
        return HttpResponse.json([])
      }),
    )
    await unwrap(api.GET('/campanas'))
    expect(lang).toBe('es')
  })

  it('convierte un 422 en ApiError con los errores de validación', async () => {
    server.use(
      http.post(apiPath('/campanas/:cid/propuestas/:pid/aprobar'), () => HttpResponse.json(error422, { status: 422 })),
    )
    const promise = unwrap(
      api.POST('/campanas/{cid}/propuestas/{pid}/aprobar', {
        params: { path: { cid: CID, pid: 'x' } },
        body: { nota: 'ok' },
      }),
    )
    await expect(promise).rejects.toBeInstanceOf(ApiError)
    const err = (await promise.catch((e: unknown) => e)) as ApiError
    expect(err.status).toBe(422)
    expect(err.message).toBe('Los datos no son válidos')
    expect(err.errores).toHaveLength(1)
    expect(err.errores[0]?.mensaje).toMatch(/Solo se pueden afirmar hechos/)
    expect(lastRequest('POST', '/campanas/noches-de-madrid/propuestas/x/aprobar')).toBeDefined()
  })

  it('usa `detail` (FastAPI) si no hay `detalle`, y el texto de estado como último recurso', async () => {
    server.use(
      http.get(apiPath('/campanas'), () => HttpResponse.json({ detail: 'Prohibido' }, { status: 403 })),
      http.get(apiPath('/modulos'), () => new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' })),
    )
    const e1 = (await unwrap(api.GET('/campanas')).catch((e: unknown) => e)) as ApiError
    expect(e1.status).toBe(403)
    expect(e1.message).toBe('Prohibido')
    expect(e1.errores).toEqual([])
    const e2 = (await unwrap(api.GET('/modulos')).catch((e: unknown) => e)) as ApiError
    expect(e2.status).toBe(500)
    expect(e2.message).toBeTruthy()
  })

  it('convierte un fallo de red en ApiError con estado 0', async () => {
    server.use(http.get(apiPath('/campanas'), () => HttpResponse.error()))
    const err = (await unwrap(api.GET('/campanas')).catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.message).toMatch(/servidor/)
  })
})

describe('assetUrl', () => {
  it('antepone el prefijo de la API', () => {
    expect(assetUrl('/modulos/vtm5/assets', '/fuentes/a.woff2')).toBe('/api/modulos/vtm5/assets/fuentes/a.woff2')
  })
})
