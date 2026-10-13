import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { apiPath, lastRequest, mockDb } from '@/test/handlers'
import { informeDe } from '@/test/fixtures'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor, within } from '@/test/utils'
import { CoherencePage } from './CoherencePage'

const render = () =>
  renderWithProviders(<CoherencePage />, { route: '/c/noches-de-madrid/coherencia', path: '/c/:cid/coherencia', campaign: true })

describe('CoherencePage', () => {
  it('lista las incoherencias activas con su resumen y enlaces a las entidades', async () => {
    render()
    const item = await screen.findByRole('listitem', { name: 'Personaje muerto que sigue actuando' })
    expect(within(item).getByText('Error')).toBeInTheDocument()
    expect(within(item).getByText(/murió en la sesión 1/)).toBeInTheDocument()
    expect(within(item).getByRole('link', { name: /Bruno Calvo/ })).toHaveAttribute('href', '/c/noches-de-madrid/e/bruno-calvo')
    expect(within(item).getByRole('link', { name: /Sesión 3/ })).toBeInTheDocument()

    expect(screen.getByRole('listitem', { name: 'Miembro de facciones enfrentadas' })).toBeInTheDocument()
    // La ignorada no aparece por defecto.
    expect(screen.queryByRole('listitem', { name: 'Vástago sin sire' })).not.toBeInTheDocument()

    const resumen = screen.getByRole('region', { name: 'Resumen' })
    expect(within(resumen).getByText('1 error')).toBeInTheDocument()
    expect(within(resumen).getByText('1 aviso')).toBeInTheDocument()
    expect(within(resumen).getByText('1 ignorada')).toBeInTheDocument()
    expect(within(resumen).getByText('12 reglas comprobadas')).toBeInTheDocument()
  })

  it('filtra por gravedad', async () => {
    const { user } = render()
    await screen.findByRole('listitem', { name: 'Personaje muerto que sigue actuando' })
    await user.click(screen.getByRole('radio', { name: 'Avisos' }))
    expect(screen.queryByRole('listitem', { name: 'Personaje muerto que sigue actuando' })).not.toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Miembro de facciones enfrentadas' })).toBeInTheDocument()
  })

  it('ignora una incoherencia con PUT {ignorada: true}', async () => {
    const { user } = render()
    const item = await screen.findByRole('listitem', { name: 'Personaje muerto que sigue actuando' })
    await user.click(within(item).getByRole('button', { name: /Ignorar/ }))
    await waitFor(() =>
      expect(lastRequest('PUT', '/campanas/noches-de-madrid/incoherencias/muerto-activo-1')?.body).toEqual({ ignorada: true }),
    )
    expect(mockDb.incoherencias[0]!.ignorada).toBe(true)
    await waitFor(() =>
      expect(screen.queryByRole('listitem', { name: 'Personaje muerto que sigue actuando' })).not.toBeInTheDocument(),
    )
  })

  it('muestra las ignoradas y permite restaurarlas', async () => {
    const { user } = render()
    await screen.findByRole('listitem', { name: 'Personaje muerto que sigue actuando' })
    await user.click(screen.getByRole('switch', { name: 'Mostrar ignoradas' }))
    const item = await screen.findByRole('listitem', { name: 'Vástago sin sire' })
    await waitFor(() => expect(lastRequest('GET', '/campanas/noches-de-madrid/incoherencias')?.query.get('incluir_ignoradas')).toBe('true'))
    await user.click(within(item).getByRole('button', { name: /Restaurar/ }))
    await waitFor(() =>
      expect(lastRequest('PUT', '/campanas/noches-de-madrid/incoherencias/sin-sire-3')?.body).toEqual({ ignorada: false }),
    )
  })

  it('celebra un mundo coherente', async () => {
    server.use(http.get(apiPath('/campanas/:cid/incoherencias'), () => HttpResponse.json(informeDe([], false))))
    render()
    expect(await screen.findByText('El mundo es coherente')).toBeInTheDocument()
  })
})
