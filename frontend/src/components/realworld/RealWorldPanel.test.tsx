import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { MundoReal } from '@/api/hooks'
import { hasCoords, relacionKey, thumbnailUrl } from './anchor'

const useMundoReal = vi.fn()
vi.mock('@/api/hooks', () => ({ useMundoReal: (cid: string, eid: string) => useMundoReal(cid, eid) }))
// Leaflet necesita un navegador real: el mapa se sustituye por un marcador.
vi.mock('./RealWorldMap', () => ({
  default: ({ etiqueta }: { etiqueta: string }) => <div data-testid="mapa">{etiqueta}</div>,
}))

const { RealWorldPanel } = await import('./RealWorldPanel')

const ancla: MundoReal = {
  iri: 'http://www.wikidata.org/entity/Q2807',
  fuente: 'wikidata',
  relacion: 'rpg:correspondsTo',
  etiqueta: 'Madrid',
  descripcion: 'capital de España',
  resumen: 'Madrid es la capital.',
  imagen: 'http://commons.wikimedia.org/wiki/Special:FilePath/Madrid.jpg',
  latitud: 40.4,
  longitud: -3.7,
  hechos: [{ propiedad: 'P1082', etiqueta: 'población', valores: ['3 300 000'] }],
  enlace: 'https://www.wikidata.org/wiki/Q2807',
  error: null,
}

const ok = (anclas: MundoReal[]) => ({
  data: { entidad: { id: 'madrid', iri: 'urn:m', etiqueta: 'Madrid', editable: true }, anclas },
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
})

describe('RealWorldPanel', () => {
  beforeEach(() => useMundoReal.mockReset())

  it('muestra las anclas separadas de la campaña, con imagen, mapa, hechos y enlace', async () => {
    useMundoReal.mockReturnValue(ok([ancla, { ...ancla, iri: 'http://dbpedia.org/resource/X', fuente: 'dbpedia', relacion: 'rpg:inspiredBy', latitud: null, longitud: null, imagen: null, error: 'timeout', hechos: [] }]))
    render(<RealWorldPanel cid="c1" eid="madrid" />)
    expect(screen.getByRole('heading', { name: /Mundo real — datos externos/ })).toBeInTheDocument()
    expect(screen.getByText(/No forma parte de la campaña/)).toBeInTheDocument()
    expect(screen.getByText('Corresponde a')).toBeInTheDocument()
    expect(screen.getByText('Inspirado en')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Imagen de Madrid' })).toHaveAttribute(
      'src',
      'http://commons.wikimedia.org/wiki/Special:FilePath/Madrid.jpg?width=480',
    )
    expect(await screen.findByTestId('mapa')).toHaveTextContent('Madrid')
    expect(screen.getByText('población')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Ver en Wikidata/ })[0]).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q2807')
    expect(screen.getByText(/timeout/)).toBeInTheDocument()
  })

  it('no pinta nada sin anclas', () => {
    useMundoReal.mockReturnValue(ok([]))
    const { container } = render(<RealWorldPanel cid="c1" eid="madrid" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('utilidades de anclas', () => {
  it('genera miniaturas de Wikimedia', () => {
    expect(thumbnailUrl('https://commons.wikimedia.org/wiki/Special:FilePath/A.jpg')).toBe(
      'https://commons.wikimedia.org/wiki/Special:FilePath/A.jpg?width=480',
    )
    expect(thumbnailUrl('https://x/Special:FilePath/A.jpg?a=1')).toBe('https://x/Special:FilePath/A.jpg?a=1&width=480')
    expect(thumbnailUrl('https://otra.org/a.png')).toBe('https://otra.org/a.png')
  })

  it('reconoce la relación de anclaje y las coordenadas', () => {
    expect(relacionKey('rpg:inspiredBy')).toBe('inspiradoEn')
    expect(relacionKey('https://loregraph.example.org/ont/core#correspondsTo')).toBe('correspondeA')
    expect(relacionKey('rpg:realWorldAnchor')).toBe('otra')
    expect(hasCoords({ latitud: 1, longitud: 2 })).toBe(true)
    expect(hasCoords({ latitud: null, longitud: 2 })).toBe(false)
  })
})
