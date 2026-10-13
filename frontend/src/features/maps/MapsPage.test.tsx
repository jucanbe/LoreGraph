import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { EntidadRef, Mapa } from '@/api/hooks'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'
import { fireEvent, renderWithProviders, screen, waitFor, within } from '@/test/utils'
import type { MapCanvasProps } from './MapCanvas'
import { MapsPage } from './MapsPage'

// Leaflet necesita un navegador real: el lienzo se sustituye por controles que
// simulan los gestos (clic en el mapa y arrastre de un marcador).
vi.mock('./MapCanvas', () => ({
  default: ({ marcadores, editando, onAnadir, onMover }: MapCanvasProps) => (
    <div data-testid="lienzo" data-editando={editando}>
      {marcadores.map((m) => (
        <a key={m.clave} href={m.href} data-x={m.x} data-y={m.y}>
          {m.etiqueta}
        </a>
      ))}
      <button type="button" onClick={() => onAnadir(0.25, 0.75)}>
        clic-mapa
      </button>
      <button type="button" onClick={() => marcadores[0] && onMover(marcadores[0].clave, 0.6, 0.4)}>
        arrastrar-primero
      </button>
    </div>
  ),
}))

const CID = 'noches-de-madrid'

const ref = (id: string, etiqueta: string): EntidadRef => ({
  id,
  iri: `https://loregraph.example/${id}`,
  etiqueta,
  tipo: null,
  descripcion: null,
  editable: true,
  modificada: null,
})

const plano: Mapa = {
  entidad: { ...ref('plano-centro', 'Plano del centro'), descripcion: 'Madrid, 1890' },
  imagen: { nodo: 'img1', url: '/media/plano.png', origen: null },
  marcadores: [
    { nodo: 'm1', entidad: ref('lucia-vega', 'Lucía Vega'), x: 0.1, y: 0.2 },
    { nodo: 'm2', entidad: ref('la-taberna', 'La Taberna'), x: 0.5, y: 0.5 },
  ],
}
const cripta: Mapa = { entidad: ref('cripta', 'Cripta'), imagen: null, marcadores: [] }

const paths = ['/c/:cid/mapas', '/c/:cid/mapas/:mid']

describe('MapsPage · lista', () => {
  it('muestra las tarjetas con miniatura y número de marcadores', async () => {
    server.use(http.get(apiPath('/campanas/:cid/mapas'), () => HttpResponse.json([plano, cripta])))
    renderWithProviders(<MapsPage />, { route: `/c/${CID}/mapas`, path: paths, campaign: true })
    const lista = await screen.findByRole('list', { name: 'Mapas' })
    const tarjetas = within(lista).getAllByRole('link')
    expect(tarjetas).toHaveLength(2)
    expect(tarjetas[0]).toHaveAttribute('href', `/c/${CID}/mapas/plano-centro`)
    expect(within(tarjetas[0]!).getByText('2 marcadores')).toBeInTheDocument()
    expect(within(tarjetas[1]!).getByText('0 marcadores')).toBeInTheDocument()
    expect(tarjetas[0]!.querySelector('img')).toHaveAttribute('src', '/api/media/plano.png')
  })

  it('muestra un estado vacío que explica la función', async () => {
    server.use(http.get(apiPath('/campanas/:cid/mapas'), () => HttpResponse.json([])))
    renderWithProviders(<MapsPage />, { route: `/c/${CID}/mapas`, path: paths, campaign: true })
    expect(await screen.findByText('Aún no hay mapas')).toBeInTheDocument()
    expect(screen.getByText(/plano de ciudad/)).toBeInTheDocument()
  })

  it('crea un mapa subiendo una imagen y navega a él', async () => {
    // jsdom no serializa su `FormData` en el `fetch` de Node: se registran los campos al añadirlos.
    const campos: Record<string, unknown> = {}
    const append = vi.spyOn(FormData.prototype, 'append').mockImplementation(function (name: string, value: string | Blob) {
      campos[name] = value instanceof File ? value.name : value
    })
    const nuevo: Mapa = { entidad: ref('mazmorra', 'Mazmorra'), imagen: { nodo: 'i', url: '/media/m.png', origen: null }, marcadores: [] }
    let posts = 0
    server.use(
      http.get(apiPath('/campanas/:cid/mapas'), () => HttpResponse.json([])),
      http.post(apiPath('/campanas/:cid/mapas'), () => {
        posts += 1
        return HttpResponse.json(nuevo, { status: 201 })
      }),
      http.get(apiPath('/campanas/:cid/mapas/:eid'), () => HttpResponse.json(nuevo)),
    )
    const { user, router } = renderWithProviders(<MapsPage />, { route: `/c/${CID}/mapas`, path: paths, campaign: true })
    await user.click(await screen.findByRole('button', { name: 'Nuevo mapa' }))
    const dialogo = await screen.findByRole('dialog')
    const file = new File(['png'], 'mazmorra.png', { type: 'image/png' })
    await user.upload(within(dialogo).getByLabelText('Imagen'), file)
    expect(within(dialogo).getByLabelText('Nombre')).toHaveValue('mazmorra')
    await user.clear(within(dialogo).getByLabelText('Nombre'))
    await user.type(within(dialogo).getByLabelText('Nombre'), 'Mazmorra')
    await user.type(within(dialogo).getByLabelText('Descripción (opcional)'), 'Nivel 1')
    await user.click(within(dialogo).getByRole('button', { name: 'Crear' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/c/${CID}/mapas/mazmorra`))
    expect(posts).toBe(1)
    expect(campos).toEqual({ nombre: 'Mazmorra', descripcion: 'Nivel 1', archivo: 'mazmorra.png' })
    append.mockRestore()
  })

  it('rechaza formatos de imagen no admitidos', async () => {
    server.use(http.get(apiPath('/campanas/:cid/mapas'), () => HttpResponse.json([])))
    const { user } = renderWithProviders(<MapsPage />, { route: `/c/${CID}/mapas`, path: paths, campaign: true })
    await user.click(await screen.findByRole('button', { name: 'Nuevo mapa' }))
    const dialogo = await screen.findByRole('dialog')
    const input = within(dialogo).getByLabelText('Imagen')
    fireEvent.change(input, { target: { files: [new File(['x'], 'mapa.svg', { type: 'image/svg+xml' })] } })
    expect(within(dialogo).getByRole('alert')).toHaveTextContent(/Formato no admitido/)
  })
})

describe('MapsPage · vista', () => {
  function setup() {
    server.use(
      http.get(apiPath('/campanas/:cid/mapas/:eid'), () => HttpResponse.json(plano)),
      http.get(apiPath('/campanas/:cid/entidades'), () =>
        HttpResponse.json({
          elementos: [plano.entidad, ref('rastro', 'El Rastro')],
          pagina: { total: 2, limite: 25, desplazamiento: 0 },
        }),
      ),
      http.put(apiPath('/campanas/:cid/mapas/:eid/marcadores'), () => HttpResponse.json(plano)),
    )
    return renderWithProviders(<MapsPage />, { route: `/c/${CID}/mapas/plano-centro`, path: paths, campaign: true })
  }

  it('muestra cabecera, enlace a la ficha y lista de marcadores', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Plano del centro' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mapas' })).toHaveAttribute('href', `/c/${CID}/mapas`)
    expect(screen.getByRole('link', { name: /Ver ficha/ })).toHaveAttribute('href', `/c/${CID}/e/plano-centro`)
    const panel = screen.getByRole('complementary')
    expect(within(panel).getByRole('link', { name: 'Lucía Vega' })).toHaveAttribute('href', `/c/${CID}/e/lucia-vega`)
    expect(await screen.findByTestId('lienzo')).toHaveAttribute('data-editando', 'false')
  })

  it('edita los marcadores y envía el conjunto completo al guardar', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Editar marcadores/ }))
    const lienzo = await screen.findByTestId('lienzo')
    expect(lienzo).toHaveAttribute('data-editando', 'true')

    // Mover el primero, quitar el segundo y añadir uno nuevo.
    await user.click(within(lienzo).getByRole('button', { name: 'arrastrar-primero' }))
    await user.click(screen.getByRole('button', { name: 'Quitar marcador de La Taberna' }))
    await user.click(within(lienzo).getByRole('button', { name: 'clic-mapa' }))
    const picker = await screen.findByRole('dialog')
    // El propio mapa no se ofrece como destino de un marcador.
    expect(await within(picker).findByText('El Rastro')).toBeInTheDocument()
    expect(within(picker).queryByText('Plano del centro')).not.toBeInTheDocument()
    await user.click(within(picker).getByText('El Rastro'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(lastRequest('PUT', `/campanas/${CID}/mapas/plano-centro/marcadores`)?.body).toBeTruthy())
    expect(lastRequest('PUT', `/campanas/${CID}/mapas/plano-centro/marcadores`)!.body).toEqual([
      { entidad: 'lucia-vega', x: 0.6, y: 0.4 },
      { entidad: 'rastro', x: 0.25, y: 0.75 },
    ])
    await waitFor(() => expect(screen.getByTestId('lienzo')).toHaveAttribute('data-editando', 'false'))
  })

  it('cancelar descarta los cambios', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Editar marcadores/ }))
    await user.click(screen.getByRole('button', { name: 'Quitar marcador de La Taberna' }))
    expect(screen.queryByText('La Taberna', { selector: 'a' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(within(screen.getByTestId('lienzo')).getByText('La Taberna')).toBeInTheDocument()
    expect(lastRequest('PUT', /marcadores$/)).toBeUndefined()
  })
})
