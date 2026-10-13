import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { CID, error502, estadoAgente, propuestaNuevoPnj, respuestaAgente } from '@/test/fixtures'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor, within } from '@/test/utils'
import { AssistantPage } from './AssistantPage'

function renderPage() {
  return renderWithProviders(<AssistantPage />, {
    route: `/c/${CID}/asistente`,
    path: '/c/:cid/asistente',
    campaign: true,
  })
}

describe('AssistantPage', () => {
  it('muestra la configuración del modelo local y que solo crea propuestas', async () => {
    renderPage()
    expect(await screen.findByText(estadoAgente.modelo)).toBeInTheDocument()
    expect(screen.getByText(estadoAgente.proveedor)).toBeInTheDocument()
    expect(screen.getByText(estadoAgente.url)).toBeInTheDocument()
    expect(screen.getByText(/8192 tokens|8\.192 tokens/)).toBeInTheDocument()
    expect(screen.getByText('Solo propone, nunca escribe')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a la bandeja de propuestas' })).toHaveAttribute('href', `/c/${CID}/propuestas`)
  })

  it('muestra el contexto del sistema que recibe el modelo, recortado a su tamaño', async () => {
    const { user } = renderPage()
    expect(await screen.findByText('Lo que sabe del sistema')).toBeInTheDocument()
    const resumen = await screen.findByText(/Ver el contexto/)
    expect(screen.getByText('recortado')).toBeInTheDocument()
    await user.click(resumen)
    expect(screen.getByText(/Horror personal en el mundo actual/)).toBeVisible()
    // Pide el contexto con el presupuesto del modelo: 8192 tokens × 3,5 × 30 %.
    await waitFor(() =>
      expect(lastRequest('GET', /contexto-llm/)?.query.get('max_caracteres')).toBe(String(Math.round(8192 * 3.5 * 0.3))),
    )
  })

  it('envía con Ctrl+Intro y muestra respuesta, herramientas y propuestas creadas', async () => {
    // Respuesta lenta para poder ver el estado de espera.
    server.use(
      http.post(apiPath('/campanas/:cid/agente'), async () => {
        await delay(300)
        return HttpResponse.json(respuestaAgente)
      }),
    )
    const { user } = renderPage()
    const caja = screen.getByLabelText('¿Qué quieres que haga el asistente?')
    const enviar = screen.getByRole('button', { name: 'Enviar' })
    expect(enviar).toBeDisabled()
    await user.type(caja, 'Crea un PNJ{Control>}{Enter}{/Control}')

    // Mensaje del usuario y espera.
    expect(await screen.findByText('Crea un PNJ')).toBeInTheDocument()
    expect(screen.getByText(/Pensando/)).toBeInTheDocument()
    expect(caja).toHaveValue('')

    expect(await screen.findByText(respuestaAgente.respuesta)).toBeInTheDocument()
    await waitFor(() => expect(lastRequest('POST', `/campanas/${CID}/agente`)?.body).toEqual({ peticion: 'Crea un PNJ' }))
    const herramientas = screen.getByRole('list', { name: 'Herramientas usadas' })
    expect(within(herramientas).getAllByRole('listitem').map((li) => li.textContent)).toEqual(respuestaAgente.herramientas)
    expect(screen.getByRole('link', { name: `Ver propuesta ${propuestaNuevoPnj.id}` })).toHaveAttribute(
      'href',
      `/c/${CID}/propuestas/${propuestaNuevoPnj.id}`,
    )
    expect(screen.queryByText(/Pensando/)).not.toBeInTheDocument()
    await waitFor(() => expect(caja).toHaveFocus())
  })

  it('explica cómo arrancar el modelo cuando el backend devuelve 502 y permite reintentar', async () => {
    server.use(http.post(apiPath('/campanas/:cid/agente'), () => HttpResponse.json(error502, { status: 502 })))
    const { user } = renderPage()
    await user.type(screen.getByLabelText('¿Qué quieres que haga el asistente?'), 'Hola')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('No se pudo contactar con el modelo')
    expect(alerta).toHaveTextContent('¿Está arrancado Ollama? Revisa LOREGRAPH_LLM_* en .env')
    expect(alerta).toHaveTextContent('Connection error')

    server.resetHandlers()
    await user.click(within(alerta).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText(respuestaAgente.respuesta)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('muestra otros errores sin la ayuda de Ollama', async () => {
    server.use(
      http.post(apiPath('/campanas/:cid/agente'), () =>
        HttpResponse.json({ detalle: 'Petición no válida', errores: [] }, { status: 422 }),
      ),
    )
    const { user } = renderPage()
    await user.type(screen.getByLabelText('¿Qué quieres que haga el asistente?'), 'x')
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('El asistente no pudo responder')
    expect(alerta).not.toHaveTextContent('Ollama')
  })

  it('rellena la caja con un ejemplo y limpia la conversación', async () => {
    const { user } = renderPage()
    const ejemplo = screen.getByRole('button', { name: /facciones principales/ })
    await user.click(ejemplo)
    const caja = screen.getByLabelText('¿Qué quieres que haga el asistente?')
    expect(caja).toHaveValue(ejemplo.textContent)
    await user.click(screen.getByRole('button', { name: 'Enviar' }))
    await screen.findByText(respuestaAgente.respuesta)
    await user.click(screen.getByRole('button', { name: 'Limpiar conversación' }))
    expect(screen.queryByText(respuestaAgente.respuesta)).not.toBeInTheDocument()
    expect(screen.getByText('Empieza una conversación')).toBeInTheDocument()
  })
})
