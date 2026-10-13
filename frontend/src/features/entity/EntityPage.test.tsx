import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { entidadLucia, historiaLucia } from '@/test/fixtures'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'
import { fireEvent, renderWithProviders, screen, waitFor, within } from '@/test/utils'
import { EntityPage } from './EntityPage'

// Cytoscape no funciona en jsdom: el mini-grafo no es objeto de estas pruebas.
vi.mock('@/components/graph/MiniGraph', () => ({ MiniGraph: () => null }))

const render = () =>
  renderWithProviders(<EntityPage />, { route: '/c/noches-de-madrid/e/lucia-vega', path: '/c/:cid/e/:eid', campaign: true })

describe('EntityPage', () => {
  it('sube un retrato (multipart) al soltar o elegir una imagen', async () => {
    const { user } = render()
    await screen.findByRole('heading', { name: /Lucía Vega/ })
    const file = new File(['png'], 'lucia.png', { type: 'image/png' })
    await user.upload(screen.getByTestId('portrait-input'), file)
    await waitFor(() => expect(lastRequest('POST', '/campanas/noches-de-madrid/entidades/lucia-vega/retratos')).toBeDefined())
    expect(await screen.findByText('Retrato actualizado')).toBeInTheDocument()
  })

  it('rechaza formatos no admitidos sin llamar a la API', async () => {
    render()
    await screen.findByRole('heading', { name: /Lucía Vega/ })
    const input = screen.getByTestId('portrait-input')
    // `user.upload` respeta `accept`: simulamos el cambio directamente (como un arrastre con otro tipo).
    const file = new File(['x'], 'notas.txt', { type: 'text/plain' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(await screen.findByText(/Formato no admitido/)).toBeInTheDocument()
    expect(lastRequest('POST', /retratos$/)).toBeUndefined()
  })

  it('muestra el retrato existente y permite quitarlo', async () => {
    server.use(
      http.get(apiPath('/campanas/:cid/entidades/:eid'), () =>
        HttpResponse.json({ ...entidadLucia, imagenes: ['/media/noches-de-madrid/lucia.png'] }),
      ),
    )
    const { user } = render()
    const img = await screen.findByRole('img', { name: 'Retrato de Lucía Vega' })
    expect(img).toHaveAttribute('src', '/api/media/noches-de-madrid/lucia.png')
    await user.click(screen.getByRole('button', { name: /Quitar retrato/ }))
    await waitFor(() =>
      expect(lastRequest('DELETE', '/campanas/noches-de-madrid/entidades/lucia-vega/retratos')?.query.get('nodo')).toBe(
        '/media/noches-de-madrid/lucia.png',
      ),
    )
  })

  it('muestra la historia temporal agrupada por propiedad', async () => {
    server.use(http.get(apiPath('/campanas/:cid/entidades/:eid/historia-temporal'), () => HttpResponse.json(historiaLucia)))
    const { user } = render()
    await user.click(await screen.findByRole('tab', { name: /Historia/ }))
    const panel = await screen.findByRole('tabpanel')
    expect(within(panel).getByText('Miembro de')).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Anarquistas de Lavapiés/ })).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Camarilla de Madrid/ })).toBeInTheDocument()
    expect(within(panel).getByText('Vigente')).toBeInTheDocument()
    expect(within(panel).getByText('el principio')).toBeInTheDocument()
    expect(within(panel).getByText('actualidad')).toBeInTheDocument()
    expect(within(panel).getAllByRole('link', { name: /Sesión 2/ })).toHaveLength(2)
  })

  it('oculta la pestaña de historia si no hay datos', async () => {
    render()
    await screen.findByRole('heading', { name: /Lucía Vega/ })
    await waitFor(() => expect(lastRequest('GET', /historia-temporal$/)).toBeDefined())
    expect(screen.queryByRole('tab', { name: /Historia/ })).not.toBeInTheDocument()
  })

  it('avisa de las incoherencias de la entidad y enlaza con el informe', async () => {
    render()
    expect(await screen.findByText('1 incoherencia en esta entidad')).toBeInTheDocument()
    expect(screen.getByText('Miembro de facciones enfrentadas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver informe de coherencia/ })).toHaveAttribute(
      'href',
      '/c/noches-de-madrid/coherencia',
    )
    expect(lastRequest('GET', /incoherencias$/)?.query.get('entidad')).toBe(entidadLucia.iri)
  })

  it('enlaza los mapas en los que aparece', async () => {
    server.use(
      http.get(apiPath('/campanas/:cid/entidades/:eid/mapas'), () =>
        HttpResponse.json([
          {
            entidad: { ...entidadLucia, id: 'mapa-madrid', iri: 'x:mapa-madrid', etiqueta: 'Madrid nocturno' },
            imagen: null,
            marcadores: [],
          },
        ]),
      ),
    )
    render()
    expect(await screen.findByRole('link', { name: 'Abrir mapa Madrid nocturno' })).toHaveAttribute(
      'href',
      '/c/noches-de-madrid/mapas/mapa-madrid',
    )
  })
})
