import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { SesionLinea } from '@/api/hooks'
import { groupByType, isLongText } from './group'

const useSesiones = vi.fn()
vi.mock('@/api/hooks', () => ({ useSesiones: (cid: string) => useSesiones(cid) }))

const camp = {
  cid: 'c1',
  info: { campana: { nombre: 'Noches' }, tipos: [], relaciones: [], prefijos: {} },
  tipoPorClave: new Map(),
  estilo: () => ({ color: null, forma: null, icono: null }),
  path: (sub?: string) => (sub ? `/c/c1/${sub}` : '/c/c1'),
  entityPath: (id: string) => `/c/c1/e/${id}`,
}
vi.mock('@/app/campaign-context', () => ({
  useCampaign: () => camp,
  useOptionalCampaign: () => camp,
}))

const { SessionsPage } = await import('./SessionsPage')

const ref = (id: string, etiqueta: string, tipo?: { clave: string; etiqueta: string }) => ({
  id,
  iri: `urn:${id}`,
  etiqueta,
  editable: true,
  descripcion: null,
  modificada: null,
  tipo: tipo ? { iri: `urn:${tipo.clave}`, ...tipo } : null,
})

const PNJ = { clave: 'rpg:NonPlayerCharacter', etiqueta: 'PNJ' }
const LUGAR = { clave: 'rpg:Place', etiqueta: 'Lugar' }

const sesiones = [
  {
    sesion: { entidad: ref('s1', 'La llegada'), numero: 1, fecha: '2026-01-10', fechaMundo: 'Otoño de 1890', notas: 'Corto' },
    entidades: [ref('ana', 'Ana', PNJ), ref('prado', 'El Prado', LUGAR), ref('bea', 'Bea', PNJ)],
  },
  {
    sesion: { entidad: ref('s2', 'La traición'), numero: 2, fecha: null, fechaMundo: null, notas: 'x'.repeat(400) },
    entidades: [],
  },
] as unknown as SesionLinea[]

function renderPage() {
  return render(
    <MemoryRouter>
      <SessionsPage />
    </MemoryRouter>,
  )
}

describe('SessionsPage', () => {
  beforeEach(() => useSesiones.mockReset())

  it('muestra la línea temporal con fechas, notas plegables y entidades agrupadas por tipo', async () => {
    useSesiones.mockReturnValue({ data: sesiones, isPending: false, isError: false, error: null, refetch: vi.fn() })
    renderPage()
    const items = within(screen.getByRole('list', { name: 'Sesiones' })).getAllByRole('listitem')
    // Más recientes primero por defecto
    expect(within(items[0]!).getByRole('heading', { name: 'La traición' })).toBeInTheDocument()
    const primera = items[1]!
    expect(within(primera).getByRole('link', { name: /La llegada/ })).toHaveAttribute('href', '/c/c1/e/s1')
    expect(within(primera).getByText('Otoño de 1890')).toBeInTheDocument()
    expect(within(primera).getByText('PNJ')).toBeInTheDocument()
    expect(within(primera).getByRole('link', { name: /Ana/ })).toHaveAttribute('href', '/c/c1/e/ana')
    expect(screen.getByRole('link', { name: /Nueva sesión/ })).toHaveAttribute('href', '/c/c1/nueva/rpg%3ASession')

    const verMas = within(items[0]!).getByRole('button', { name: 'Ver más' })
    await userEvent.click(verMas)
    expect(within(items[0]!).getByRole('button', { name: 'Ver menos' })).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(screen.getByRole('button', { name: /Más recientes primero/ }))
    expect(within(within(screen.getByRole('list', { name: 'Sesiones' })).getAllByRole('listitem')[0]!).getByRole('heading', { name: 'La llegada' })).toBeInTheDocument()
  })

  it('muestra el estado vacío', () => {
    useSesiones.mockReturnValue({ data: [], isPending: false, isError: false, error: null, refetch: vi.fn() })
    renderPage()
    expect(screen.getByText('Aún no hay sesiones')).toBeInTheDocument()
  })
})

describe('agrupación', () => {
  it('agrupa por tipo y ordena por etiqueta', () => {
    const grupos = groupByType(sesiones[0]!.entidades)
    expect(grupos.map((g) => [g.clave, g.entidades.map((e) => e.etiqueta)])).toEqual([
      ['rpg:NonPlayerCharacter', ['Ana', 'Bea']],
      ['rpg:Place', ['El Prado']],
    ])
    expect(isLongText('a\nb\nc\nd\ne')).toBe(true)
    expect(isLongText('corto')).toBe(false)
  })
})
