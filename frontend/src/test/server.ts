/**
 * Servidor MSW para los tests (Node). Arranca en `setup.ts`.
 *
 * Para cambiar la respuesta de un endpoint en un test concreto:
 *
 * ```ts
 * import { http, HttpResponse } from 'msw'
 * import { server } from '@/test/server'
 * import { apiPath } from '@/test/handlers'
 *
 * server.use(http.post(apiPath('/campanas/:cid/agente'), () =>
 *   HttpResponse.json({ detalle: 'Connection error', errores: [] }, { status: 502 })))
 * ```
 *
 * Los manejadores añadidos con `server.use` se descartan tras cada test.
 */
import { setupServer } from 'msw/node'
import { handlers, logRequest } from './handlers'

export const server = setupServer(...handlers)

// Registro de peticiones (ver `requestLog` en handlers.ts).
server.events.on('request:start', ({ request }) => logRequest(request))
