import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { AjustesCampana, AjustesCampanaEntrada } from '@/api/hooks'
import { CID } from '@/test/fixtures'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor, within } from '@/test/utils'
import { CampaignSettingsPage } from './CampaignSettingsPage'

const ajustesCampana: AjustesCampana = {
  lore: {
    resumen: 'La coterie investiga la muerte del Sheriff.',
    tono: 'horror personal',
    reglasCasa: ['Sin críticos automáticos'],
    evitar: [],
    notas: '',
  },
  asistente: { modelo: null, contextoTokens: null },
  sesionActual: null,
}

function ajuste(clave: string, valor: unknown) {
  return { clave, valor, origen: 'env', porDefecto: valor, secreto: false, configurado: true }
}

function setup() {
  server.use(
    http.get(apiPath('/campanas/:cid/ajustes'), () => HttpResponse.json(ajustesCampana)),
    http.put(apiPath('/campanas/:cid/ajustes'), async ({ request }) => {
      const body = (await request.json()) as AjustesCampanaEntrada
      return HttpResponse.json({ ...ajustesCampana, ...body })
    }),
    http.get(apiPath('/ajustes'), () =>
      HttpResponse.json({
        ajustes: { llm_model: ajuste('llm_model', 'qwen3:8b'), llm_context_tokens: ajuste('llm_context_tokens', 8192) },
      }),
    ),
    http.get(apiPath('/modulos'), () => HttpResponse.json([])),
    http.get(apiPath('/campanas/:cid/sesiones'), () => HttpResponse.json([])),
    http.delete(apiPath('/campanas/:cid'), () => new HttpResponse(null, { status: 204 })),
  )
  return renderWithProviders(<CampaignSettingsPage />, {
    route: `/c/${CID}/ajustes`,
    path: '/c/:cid/ajustes',
    campaign: true,
  })
}

describe('CampaignSettingsPage', () => {
  it('carga los datos generales, el lore y los ajustes globales como sugerencia', async () => {
    setup()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Noches de Madrid')
    expect(await screen.findByLabelText('Resumen')).toHaveValue('La coterie investiga la muerte del Sheriff.')
    expect(screen.getByDisplayValue('Sin críticos automáticos')).toBeInTheDocument()
    expect(await screen.findByPlaceholderText('Global: qwen3:8b')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar ZIP/ })).toHaveAttribute('href', `/api/campanas/${CID}/exportar`)
  })

  it('guarda lore, modelo y lista con un único PUT', async () => {
    const { user } = setup()
    const tono = await screen.findByLabelText('Tono')
    await user.clear(tono)
    await user.type(tono, 'noir')
    await user.type(screen.getByLabelText('Evitar'), 'Violencia contra niños{Enter}')
    await user.type(screen.getByLabelText('Modelo'), 'llama3:8b')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(lastRequest('PUT', `/campanas/${CID}/ajustes`)?.body).toBeTruthy())
    const body = lastRequest('PUT', `/campanas/${CID}/ajustes`)!.body as AjustesCampanaEntrada
    expect(body.lore).toEqual({
      resumen: 'La coterie investiga la muerte del Sheriff.',
      tono: 'noir',
      reglasCasa: ['Sin críticos automáticos'],
      evitar: ['Violencia contra niños'],
      notas: '',
    })
    expect(body.asistente).toEqual({ modelo: 'llama3:8b', contextoTokens: null })
    expect(body.sesionActual).toBeNull()
    expect(await screen.findByText('Ajustes de la campaña guardados')).toBeInTheDocument()
  })

  it('muestra los errores de validación de la API', async () => {
    const { user } = setup()
    server.use(
      http.put(apiPath('/campanas/:cid/ajustes'), () =>
        HttpResponse.json(
          {
            detalle: 'Datos no válidos',
            errores: [{ campo: 'asistente.contextoTokens', mensaje: 'Supera el contexto del modelo', severidad: 'violacion', foco: null, focoId: null, valor: null }],
          },
          { status: 422 },
        ),
      ),
    )
    await user.type(await screen.findByLabelText('Contexto (tokens)'), '999999')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Supera el contexto del modelo')).toBeInTheDocument()
  })

  it('edita los datos generales con PUT /campanas/{cid} conservando el id', async () => {
    const { user } = setup()
    server.use(http.put(apiPath('/campanas/:cid'), () => HttpResponse.json({})))
    const nombre = screen.getByLabelText('Nombre')
    await user.clear(nombre)
    await user.type(nombre, 'Noches de Madrid II')
    await user.click(screen.getByRole('button', { name: /Guardar datos generales/ }))
    await waitFor(() => expect(lastRequest('PUT', `/campanas/${CID}`)?.body).toBeTruthy())
    expect(lastRequest('PUT', `/campanas/${CID}`)!.body).toMatchObject({ id: CID, nombre: 'Noches de Madrid II', modulos: ['vtm5'] })
  })

  it('para borrar hay que escribir el id de la campaña', async () => {
    const { user, router } = setup()
    await user.click(screen.getByRole('button', { name: /Borrar campaña/ }))
    const dialog = await screen.findByRole('dialog')
    const borrar = within(dialog).getByRole('button', { name: 'Borrar' })
    expect(borrar).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'otra-cosa')
    expect(borrar).toBeDisabled()
    await user.clear(within(dialog).getByRole('textbox'))
    await user.type(within(dialog).getByRole('textbox'), CID)
    expect(borrar).toBeEnabled()
    await user.click(borrar)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(lastRequest('DELETE', `/campanas/${CID}`)).toBeTruthy()
  })
})
