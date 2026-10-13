import { describe, expect, it } from 'vitest'
import { CID, infoCampana } from '@/test/fixtures'
import { renderWithProviders, screen } from '@/test/utils'
import { EntityLink, TypeBadge } from './EntityLink'
import { PageHeader } from './PageHeader'

const pnj = infoCampana.tipos.find((t) => t.clase.clave === 'rpg:NonPlayerCharacter')!

describe('EntityLink', () => {
  it('enlaza a la ficha dentro de la ruta de la campaña', () => {
    renderWithProviders(<EntityLink id="ignacio-larra" etiqueta="Padre Ignacio Larra" tipo={pnj.clase} />, {
      campaign: true,
    })
    const link = screen.getByRole('link', { name: 'Padre Ignacio Larra' })
    expect(link).toHaveAttribute('href', `/c/${CID}/e/ignacio-larra`)
    expect(link).toHaveAttribute('title', 'Padre Ignacio Larra · PNJ')
  })

  it('codifica los ids con caracteres especiales', () => {
    renderWithProviders(<EntityLink id="a b/n/c" etiqueta="Nodo" />, { campaign: true })
    expect(screen.getByRole('link', { name: 'Nodo' })).toHaveAttribute('href', `/c/${CID}/e/a%20b%2Fn%2Fc`)
  })

  it('sin id, fuera de una campaña o con IRI externa no enlaza', () => {
    const { unmount } = renderWithProviders(<EntityLink id={null} etiqueta="Suelto" />, { campaign: true })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Suelto')).toBeInTheDocument()
    unmount()
    renderWithProviders(<EntityLink id="x" etiqueta="Sin campaña" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('no enlaza IRIs externas', () => {
    renderWithProviders(<EntityLink id="https://www.wikidata.org/wiki/Q2807" etiqueta="Madrid" />, { campaign: true })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('TypeBadge', () => {
  it('muestra la etiqueta del tipo con el color del manifiesto', () => {
    renderWithProviders(<TypeBadge tipo={pnj.clase} />, { campaign: true })
    const badge = screen.getByText('PNJ')
    expect(badge).toHaveStyle({ color: pnj.estilo?.color ?? '' })
  })

  it('no pinta nada sin tipo', () => {
    const { container } = renderWithProviders(<TypeBadge tipo={null} />, { campaign: true, withToaster: false })
    expect(container.querySelector('[data-slot="badge"]')).toBeNull()
  })
})

describe('PageHeader', () => {
  it('pinta migas enlazadas salvo la última, título y acciones', () => {
    renderWithProviders(
      <PageHeader
        title="Propuestas"
        subtitle="Sub"
        migas={[{ label: 'Campaña', to: '/c/x' }, { label: 'Propuestas', to: '/c/x/propuestas' }]}
        actions={<button>Acción</button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Propuestas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Campaña' })).toHaveAttribute('href', '/c/x')
    // La última miga es la página actual: no es un enlace navegable.
    expect(screen.getByText('Propuestas', { selector: '[aria-current="page"]' })).not.toHaveAttribute('href')
    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument()
  })
})
