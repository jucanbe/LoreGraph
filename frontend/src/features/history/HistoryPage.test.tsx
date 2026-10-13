import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { CambioInfo, Termino, TripletaLegible } from '@/api/hooks'
import { CID, terminoEntidad } from '@/test/fixtures'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor, within } from '@/test/utils'
import { HistoryPage, POR_PAGINA } from './HistoryPage'

const literal = (valor: string): Termino => ({ tipo: 'literal', valor, etiqueta: valor, id: null, clave: null, datatype: null, idioma: null })
const predicado = (etiqueta: string): Termino => ({ tipo: 'iri', valor: `urn:p:${etiqueta}`, etiqueta, id: null, clave: null, datatype: null, idioma: null })
const tripleta = (o: string): TripletaLegible => ({
  sujeto: terminoEntidad('lucia-vega', 'Lucía Vega'),
  predicado: predicado('estado'),
  objeto: literal(o),
  grafo: null,
})

function cambio(over: Partial<CambioInfo>): CambioInfo {
  return {
    id: 'aaaaaaaaaaaa',
    fecha: '2026-10-13T12:00:00Z',
    agente: { tipo: 'humano', nombre: 'juan', peticion: null },
    peticion: null,
    propuesta: null,
    anadidas: [],
    eliminadas: [],
    deshace: null,
    deshechoPor: null,
    ...over,
  }
}

const cambios: CambioInfo[] = [
  cambio({
    id: 'c3c3c3c3c3c3',
    fecha: '2026-10-13T12:30:00Z',
    agente: { tipo: 'agente', nombre: 'asistente', peticion: 'Lucía cae en letargo' },
    peticion: 'Lucía cae en letargo',
    propuesta: 'p1',
    anadidas: [tripleta('letargo')],
    eliminadas: [tripleta('activa')],
  }),
  cambio({ id: 'b2b2b2b2b2b2', fecha: '2026-10-13T12:20:00Z', deshace: 'a1a1a1a1a1a1', anadidas: [tripleta('x')] }),
  cambio({ id: 'a1a1a1a1a1a1', fecha: '2026-10-13T12:10:00Z', deshechoPor: 'b2b2b2b2b2b2', eliminadas: [tripleta('x')] }),
]

function setup(lista: CambioInfo[] = cambios) {
  server.use(
    http.get(apiPath('/campanas/:cid/cambios'), () => HttpResponse.json(lista)),
    http.post(apiPath('/campanas/:cid/cambios/:chid/deshacer'), () => HttpResponse.json({ id: 'nuevo' })),
  )
  return renderWithProviders(<HistoryPage />, { route: `/c/${CID}/historial`, path: '/c/:cid/historial', campaign: true })
}

async function cambiosListados() {
  const lista = await screen.findByRole('list', { name: 'Historial' })
  return within(lista).getAllByRole('listitem')
}

describe('HistoryPage', () => {
  it('lista los cambios con agente, petición, propuesta y tripletas', async () => {
    const { user } = setup()
    const items = await cambiosListados()
    expect(items).toHaveLength(3)
    const primero = items[0]!
    expect(within(primero).getByText('asistente')).toBeInTheDocument()
    expect(within(primero).getByText('agente de IA')).toBeInTheDocument()
    expect(within(primero).getByText('«Lucía cae en letargo»')).toBeInTheDocument()
    expect(within(primero).getByRole('link', { name: 'ver propuesta' })).toHaveAttribute('href', `/c/${CID}/propuestas/p1`)
    await user.click(within(primero).getByText('1 añadidas · 1 eliminadas'))
    expect(within(primero).getByText('letargo')).toBeInTheDocument()
    expect(within(primero).getByText('activa')).toBeInTheDocument()
  })

  it('marca los cambios deshechos y los que revierten otro', async () => {
    setup()
    const items = await cambiosListados()
    expect(within(items[1]!).getByText(/Revierte el cambio/)).toBeInTheDocument()
    expect(within(items[1]!).getByRole('link', { name: 'a1a1a1a1a1' })).toHaveAttribute('href', '#cambio-a1a1a1a1a1a1')
    const deshecho = items[2]!
    expect(within(deshecho).getByText(/Deshecho por el cambio/)).toBeInTheDocument()
    expect(within(deshecho).getByRole('button', { name: /Deshacer/ })).toBeDisabled()
  })

  it('deshace un cambio tras confirmar', async () => {
    const { user } = setup()
    const items = await cambiosListados()
    await user.click(within(items[0]!).getByRole('button', { name: 'Deshacer' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Deshacer cambio/ }))
    await waitFor(() => expect(lastRequest('POST', `/campanas/${CID}/cambios/c3c3c3c3c3c3/deshacer`)).toBeTruthy())
    expect(await screen.findByText('Cambio deshecho')).toBeInTheDocument()
  })

  it('muestra el conflicto (409) al deshacer', async () => {
    const { user } = setup()
    server.use(
      http.post(apiPath('/campanas/:cid/cambios/:chid/deshacer'), () =>
        HttpResponse.json({ detalle: 'Un cambio posterior modificó los mismos datos', errores: [] }, { status: 409 }),
      ),
    )
    const items = await cambiosListados()
    await user.click(within(items[0]!).getByRole('button', { name: 'Deshacer' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Deshacer cambio/ }))
    expect(await within(dialog).findByText('Un cambio posterior modificó los mismos datos')).toBeInTheDocument()
    expect(within(dialog).getByText('No se puede deshacer')).toBeInTheDocument()
  })

  it('pagina de 50 en 50', async () => {
    const pagina = Array.from({ length: POR_PAGINA }, (_, i) => cambio({ id: `id${String(i).padStart(10, '0')}` }))
    const { user } = setup(pagina)
    expect((await screen.findAllByText('Cambios 1–50')).length).toBeGreaterThan(0)
    await user.click(screen.getAllByRole('button', { name: /Más antiguos/ })[0]!)
    await waitFor(() => expect(lastRequest('GET', `/campanas/${CID}/cambios`)?.query.get('desplazamiento')).toBe('50'))
  })

  it('muestra un estado vacío', async () => {
    setup([])
    expect(await screen.findByText('Todavía no hay cambios')).toBeInTheDocument()
  })
})
