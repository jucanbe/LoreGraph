import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { error502, resultadoGeneracion } from '@/test/fixtures'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor } from '@/test/utils'
import { GenerateButton } from './GeneratorDialog'

const render = (clase?: string) =>
  renderWithProviders(<GenerateButton clase={clase} />, {
    route: '/c/noches-de-madrid/explorar',
    path: '/c/:cid/explorar',
    campaign: true,
  })

describe('GeneratorDialog', () => {
  it('envía la petición y muestra el resultado con enlace a la propuesta', async () => {
    // La respuesta llega cuando el test lo decide: así el estado de espera es observable.
    let responder!: () => void
    const listo = new Promise<void>((r) => (responder = r))
    server.use(
      http.post(apiPath('/campanas/:cid/generar'), async () => {
        await listo
        return HttpResponse.json(resultadoGeneracion, { status: 201 })
      }),
    )
    const { user } = render('rpg:NonPlayerCharacter')
    await user.click(screen.getByRole('button', { name: 'Generar con IA' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('PNJ')

    await user.type(screen.getByLabelText('¿Qué quieres?'), 'Una forense que trafica con sangre')
    const cantidad = screen.getByLabelText('Cantidad')
    await user.clear(cantidad)
    await user.type(cantidad, '3')
    await user.click(screen.getByRole('checkbox', { name: 'Escribir una historia propia' }))
    await user.click(screen.getByRole('button', { name: 'Generar' }))

    expect(await screen.findByText('Generando con el modelo local…')).toBeInTheDocument()
    await waitFor(() =>
      expect(lastRequest('POST', '/campanas/noches-de-madrid/generar')?.body).toEqual({
        clase: 'rpg:NonPlayerCharacter',
        variantes: [],
        peticion: 'Una forense que trafica con sangre',
        cantidad: 3,
        historia: false,
      }),
    )
    responder()

    expect(await screen.findByText('Marta Ibáñez')).toBeInTheDocument()
    expect(screen.getByText(/Forense del Anatómico/)).toBeInTheDocument()
    expect(screen.getByText('Modelo: ollama:qwen3:14b')).toBeInTheDocument()
    expect(screen.getByText('Hubo que corregir la salida del modelo 1 vez')).toBeInTheDocument()
    expect(screen.getByText(/Revísala y apruébala/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Revisar la propuesta/ })).toHaveAttribute(
      'href',
      '/c/noches-de-madrid/propuestas/gen0000001',
    )
  })

  it('muestra el error del modelo (502) con la pista de ajustes', async () => {
    server.use(http.post(apiPath('/campanas/:cid/generar'), () => HttpResponse.json(error502, { status: 502 })))
    const { user } = render()
    await user.click(screen.getByRole('button', { name: 'Generar con IA' }))
    await user.click(await screen.findByRole('button', { name: 'Generar' }))
    expect(await screen.findByText('No se pudo generar')).toBeInTheDocument()
    expect(screen.getByText(error502.detalle)).toBeInTheDocument()
    expect(screen.getByText(/llm_output_mode/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir ajustes/ })).toHaveAttribute('href', '/ajustes')
  })
})
