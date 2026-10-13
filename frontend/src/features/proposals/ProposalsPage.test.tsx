import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  CID,
  error422,
  errorValidacion,
  propuestaConocimiento,
  propuestaNuevoPnj,
} from '@/test/fixtures'
import { apiPath, lastRequest, mockDb } from '@/test/handlers'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor, within } from '@/test/utils'
import { ProposalsPage } from './ProposalsPage'

const PATHS = ['/c/:cid/propuestas', '/c/:cid/propuestas/:pid']
const base = `/c/${CID}/propuestas`

function renderPage(route = base) {
  return renderWithProviders(<ProposalsPage />, { route, path: PATHS, campaign: true })
}

/** Lista de propuestas (columna maestra). */
async function lista() {
  return screen.findByRole('list', { name: 'Lista de propuestas' })
}

describe('ProposalsPage · lista', () => {
  it('muestra las pendientes por defecto con agente, petición, destino, recuentos y entidades', async () => {
    renderPage()
    const ul = await lista()
    const items = within(ul).getAllByRole('listitem').filter((li) => li.hasAttribute('data-propuesta'))
    expect(items).toHaveLength(2)

    const pnj = items.find((li) => li.dataset.propuesta === propuestaNuevoPnj.id)!
    expect(within(pnj).getByText('mcp:claude-code')).toBeInTheDocument()
    expect(within(pnj).getByText('Agente IA · MCP')).toBeInTheDocument()
    expect(within(pnj).getByRole('link', { name: /Crea un PNJ Nosferatu/ })).toHaveAttribute(
      'href',
      `${base}/${propuestaNuevoPnj.id}`,
    )
    expect(within(pnj).getByText(propuestaNuevoPnj.resumen!)).toBeInTheDocument()
    expect(within(pnj).getByText('Canon')).toBeInTheDocument()
    expect(within(pnj).getByText('22 tripletas añadidas')).toBeInTheDocument()
    expect(within(pnj).getByRole('link', { name: /Remedios Ortiz/ })).toHaveAttribute(
      'href',
      `/c/${CID}/e/remedios-ortiz-la-topo-a1fa`,
    )

    const conoc = items.find((li) => li.dataset.propuesta === propuestaConocimiento.id)!
    expect(within(conoc).getByText('Agente IA · modelo local')).toBeInTheDocument()
    // Destino «conocimiento/lucia-vega» con el nombre del personaje.
    expect(await within(conoc).findByText(/Lucía Vega/)).toBeInTheDocument()
    expect(within(conoc).getByText(/Conocimiento de/)).toBeInTheDocument()

    // Recuento de pendientes visible.
    expect(screen.getByText('2 pendientes')).toBeInTheDocument()
  })

  it('cambia de filtro y lo refleja en la URL', async () => {
    const { user, router } = renderPage()
    await lista()
    await user.click(screen.getByRole('radio', { name: 'Aprobadas' }))
    await waitFor(() => expect(router.state.location.search).toBe('?estado=aprobada'))
    const ul = await screen.findByRole('list', { name: 'Lista de propuestas' })
    await waitFor(() => expect(within(ul).getAllByRole('link', { name: /Añade a lo que sabe/ })).toHaveLength(1))
    expect(lastRequest('GET', `/campanas/${CID}/propuestas`)?.query.get('estado')).toBe('aprobada')
    // Las aprobadas no se pueden marcar para el lote.
    expect(within(ul).queryByRole('checkbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Todas' }))
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Lista de propuestas' })).getAllByText(/^(Pendiente|Aprobada|Rechazada)$/)).toHaveLength(4))
    expect(screen.getByText('Persona')).toBeInTheDocument()
  })

  it('muestra el estado vacío con la ayuda para crear propuestas', async () => {
    mockDb.propuestas = mockDb.propuestas.filter((p) => p.estado !== 'pendiente')
    renderPage()
    expect(await screen.findByText('No hay propuestas pendientes')).toBeInTheDocument()
    expect(screen.getByText('proponer_triples')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Asistente' })).toHaveAttribute('href', `/c/${CID}/asistente`)
  })

  it('muestra un error si falla el listado', async () => {
    server.use(
      http.get(apiPath('/campanas/:cid/propuestas'), () =>
        HttpResponse.json({ detalle: 'Fallo del almacén', errores: [] }, { status: 500 }),
      ),
    )
    renderPage()
    expect((await screen.findAllByText('Fallo del almacén')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Reintentar' }).length).toBeGreaterThan(0)
  })
})

describe('ProposalsPage · detalle y diff', () => {
  it('muestra el diff en lenguaje legible con marcas + y nodos anidados', async () => {
    renderPage(`${base}/${propuestaNuevoPnj.id}`)
    const articulo = await screen.findByRole('article')
    expect(within(articulo).getByRole('heading', { level: 2, name: propuestaNuevoPnj.resumen! })).toBeInTheDocument()
    expect(within(articulo).getByText(propuestaNuevoPnj.peticion)).toBeInTheDocument()

    const anadidas = within(articulo).getByRole('region', { name: /Se añaden 22 tripletas/ })
    // Encabezado del sujeto (entidad nueva: sin enlace) con sus tipos como insignias.
    expect(within(anadidas).getAllByText('Remedios Ortiz «la Topo»').length).toBeGreaterThan(0)
    expect(within(anadidas).getByText('Nueva')).toBeInTheDocument()
    expect(within(anadidas).getByText('Vástago')).toBeInTheDocument()
    expect(within(anadidas).getByText('PNJ')).toBeInTheDocument()
    // «predicado → objeto»: entidades enlazadas, conceptos y literales.
    expect(within(anadidas).getByRole('link', { name: 'Núria Sanz' })).toHaveAttribute('href', `/c/${CID}/e/nuria-sanz`)
    expect(within(anadidas).getByText('conoce a')).toBeInTheDocument()
    expect(within(anadidas).getByText('Nosferatu')).toBeInTheDocument()
    expect(within(anadidas).getByText('10')).toBeInTheDocument()
    expect(within(anadidas).getAllByText('xsd:integer')).toHaveLength(3)
    // Marcas «+» (visibles) y texto accesible.
    expect(within(anadidas).getAllByText('+').length).toBeGreaterThanOrEqual(20)
    expect(within(anadidas).getAllByText('(se añade)').length).toBeGreaterThanOrEqual(20)
    // Nodos cualificados anidados bajo la línea «disciplinas».
    const nodos = anadidas.querySelectorAll('[data-sujeto*="/n/"]')
    expect(nodos).toHaveLength(2)
    expect(within(anadidas).getAllByText('Nivel de disciplina')).toHaveLength(2)
    const textos = [...nodos].map((n) => n.textContent ?? '')
    expect(textos.some((x) => x.includes('Animalismo') && x.includes('2'))).toBe(true)
    expect(textos.some((x) => x.includes('Ofuscación') && x.includes('4'))).toBe(true)
    // No hay IRIs a la vista por defecto.
    expect(within(articulo).queryByText(/^https:\/\/loregraph/)).not.toBeInTheDocument()
  })

  it('el interruptor «Ver IRIs» muestra IRIs y claves compactas', async () => {
    const { user } = renderPage(`${base}/${propuestaNuevoPnj.id}`)
    const articulo = await screen.findByRole('article')
    await user.click(within(articulo).getByRole('switch', { name: 'Ver IRIs' }))
    expect(within(articulo).getAllByText('rpg:knows').length).toBeGreaterThan(0)
    expect(within(articulo).getAllByText(/entity\/remedios-ortiz-la-topo-a1fa$/).length).toBeGreaterThan(0)
    expect(within(articulo).getByText('"10"^^xsd:integer')).toBeInTheDocument()
  })

  it('pinta las tripletas eliminadas en rojo con «−»', async () => {
    renderPage(`${base}/deadbeef02?estado=rechazada`)
    const articulo = await screen.findByRole('article')
    const eliminadas = within(articulo).getByRole('region', { name: /Se elimina 1 tripleta/ })
    expect(eliminadas).toHaveAttribute('data-diff', 'eliminada')
    // Una marca en el título de la sección y otra en la línea.
    expect(within(eliminadas).getAllByText('−')).toHaveLength(2)
    expect(within(eliminadas).getByText('(se elimina)')).toBeInTheDocument()
    expect(within(eliminadas).getByRole('link', { name: 'Padre Ignacio Larra' })).toBeInTheDocument()
    expect(within(eliminadas).getByRole('link', { name: 'Bruno Calvo' })).toBeInTheDocument()
    // Revisada: nota de revisión y sin acciones.
    expect(within(articulo).getByText('Contradice la sesión 2.')).toBeInTheDocument()
    expect(within(articulo).queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
  })

  it('muestra los errores de validación de una pendiente y bloquea «Aprobar»', async () => {
    const p = mockDb.propuestas.find((x) => x.id === propuestaConocimiento.id)!
    p.errores = [errorValidacion({ mensaje: 'Bruno Calvo ya no existe en el canon', campo: 'rpg:knows' })]
    renderPage(`${base}/${p.id}`)
    const articulo = await screen.findByRole('article')
    const alerta = within(articulo).getByRole('alert')
    expect(alerta).toHaveTextContent('Esta propuesta tiene 1 problema con el canon actual')
    expect(alerta).toHaveTextContent('Bruno Calvo ya no existe en el canon')
    expect(within(articulo).getByRole('button', { name: 'Aprobar' })).toBeDisabled()
    expect(within(articulo).getByRole('button', { name: 'Editar y aprobar' })).toBeEnabled()
  })

  it('muestra un error si la propuesta no existe', async () => {
    renderPage(`${base}/noexiste`)
    expect(await screen.findByText('No encontrado')).toBeInTheDocument()
  })
})

describe('ProposalsPage · revisión', () => {
  it('aprueba con nota, avisa y pasa a la siguiente pendiente', async () => {
    const { user, router } = renderPage(`${base}/${propuestaConocimiento.id}`)
    const articulo = await screen.findByRole('article')
    await lista()
    await user.click(within(articulo).getByRole('button', { name: 'Aprobar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Aprobar propuesta' })
    await user.type(within(dialogo).getByLabelText('Nota (opcional)'), 'Encaja')
    await user.click(within(dialogo).getByRole('button', { name: 'Aprobar' }))

    await waitFor(() =>
      expect(lastRequest('POST', `/campanas/${CID}/propuestas/${propuestaConocimiento.id}/aprobar`)?.body).toEqual({
        nota: 'Encaja',
      }),
    )
    expect(await screen.findByText('Propuesta aprobada')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe(`${base}/${propuestaNuevoPnj.id}`))
    // El foco va al título de la siguiente propuesta.
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 2, name: propuestaNuevoPnj.resumen! })).toHaveFocus(),
    )
    // La lista se refresca: ya solo queda una pendiente.
    await waitFor(() => expect(screen.getByText('1 pendiente')).toBeInTheDocument())
  })

  it('rechaza con motivo y vuelve a la lista cuando no quedan pendientes', async () => {
    mockDb.propuestas = mockDb.propuestas.filter((p) => p.id !== propuestaConocimiento.id)
    const { user, router } = renderPage(`${base}/${propuestaNuevoPnj.id}`)
    await lista()
    const articulo = await screen.findByRole('article')
    await user.click(within(articulo).getByRole('button', { name: 'Rechazar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Rechazar propuesta' })
    await user.type(within(dialogo).getByLabelText('Motivo'), 'No encaja con el tono')
    await user.click(within(dialogo).getByRole('button', { name: 'Rechazar' }))

    await waitFor(() =>
      expect(lastRequest('POST', `/campanas/${CID}/propuestas/${propuestaNuevoPnj.id}/rechazar`)?.body).toEqual({
        nota: 'No encaja con el tono',
      }),
    )
    expect(await screen.findByText('Propuesta rechazada')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe(base))
    expect(await screen.findByText('No hay propuestas pendientes')).toBeInTheDocument()
  })

  it('muestra los errores 422 dentro del diálogo y no lo cierra', async () => {
    server.use(
      http.post(apiPath('/campanas/:cid/propuestas/:pid/aprobar'), () => HttpResponse.json(error422, { status: 422 })),
    )
    const { user } = renderPage(`${base}/${propuestaNuevoPnj.id}`)
    const articulo = await screen.findByRole('article')
    await user.click(within(articulo).getByRole('button', { name: 'Aprobar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Aprobar propuesta' })
    await user.click(within(dialogo).getByRole('button', { name: 'Aprobar' }))
    const alerta = await within(dialogo).findByRole('alert')
    expect(alerta).toHaveTextContent('Los cambios no son válidos')
    expect(alerta).toHaveTextContent('Solo se pueden afirmar hechos sobre entidades de esta campaña')
    expect(alerta).toHaveTextContent('rpg:knows')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('edita y aprueba: quita una tripleta y corrige un literal', async () => {
    const { user, router } = renderPage(`${base}/${propuestaNuevoPnj.id}`)
    await lista()
    const articulo = await screen.findByRole('article')
    await user.click(within(articulo).getByRole('button', { name: 'Editar y aprobar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar y aprobar' })
    // Etiquetas legibles en el editor.
    const generacion = await within(dialogo).findByLabelText('Valor de Remedios Ortiz «la Topo» · generación')
    expect(generacion).toHaveValue('10')
    await user.clear(generacion)
    await user.type(generacion, '9')
    await user.click(within(dialogo).getByRole('button', { name: /^Quitar: Remedios Ortiz «la Topo» · conoce a → Núria Sanz$/ }))
    expect(within(dialogo).getByRole('button', { name: /^Restaurar: .* conoce a → Núria Sanz$/ })).toBeInTheDocument()
    // Los nodos anidados se nombran por su dueño y su tipo.
    expect(within(dialogo).getAllByText(/Remedios Ortiz «la Topo» › Nivel de disciplina/).length).toBeGreaterThan(0)
    await user.type(within(dialogo).getByLabelText('Nota (opcional)'), 'Ajustada')
    await user.click(within(dialogo).getByRole('button', { name: 'Aprobar 21 cambios' }))

    await waitFor(() => {
      const body = lastRequest('POST', `/campanas/${CID}/propuestas/${propuestaNuevoPnj.id}/aprobar`)?.body as {
        nota: string
        anadir: { s: string; p: string; o: unknown; literal: boolean }[]
        eliminar: unknown[]
      }
      expect(body).toBeDefined()
      expect(body.nota).toBe('Ajustada')
      expect(body.anadir).toHaveLength(21)
      expect(body.eliminar).toEqual([])
      expect(body.anadir.some((t) => t.p.endsWith('#knows'))).toBe(false)
      const gen = body.anadir.find((t) => t.p.endsWith('#generation'))
      expect(gen).toMatchObject({ o: '9', literal: true, datatype: 'http://www.w3.org/2001/XMLSchema#integer' })
    })
    expect(await screen.findByText('Propuesta editada y aprobada')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe(`${base}/${propuestaConocimiento.id}`))
  })

  it('edita y aprueba: muestra los errores 422 del editor', async () => {
    server.use(
      http.post(apiPath('/campanas/:cid/propuestas/:pid/aprobar'), () =>
        HttpResponse.json(
          {
            detalle: 'Los datos no son válidos',
            errores: [
              errorValidacion({
                foco: 'https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa',
                campo: 'vtm:generation',
                mensaje: 'La generación debe estar entre 4 y 16',
              }),
            ],
          },
          { status: 422 },
        ),
      ),
    )
    const { user } = renderPage(`${base}/${propuestaNuevoPnj.id}`)
    const articulo = await screen.findByRole('article')
    await user.click(within(articulo).getByRole('button', { name: 'Editar y aprobar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar y aprobar' })
    await within(dialogo).findByLabelText('Valor de Remedios Ortiz «la Topo» · generación')
    await user.click(within(dialogo).getByRole('button', { name: 'Aprobar 22 cambios' }))
    expect(await within(dialogo).findByText('La generación debe estar entre 4 y 16')).toBeInTheDocument()
    expect(within(dialogo).getByLabelText('Valor de Remedios Ortiz «la Topo» · generación')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })
})

describe('ProposalsPage · aprobación en lote', () => {
  it('aprueba las seleccionadas y resume aprobadas y fallidas con sus errores', async () => {
    server.use(
      http.post(apiPath('/campanas/:cid/propuestas/aprobar-lote'), async ({ request }) => {
        const body = (await request.json()) as { ids: string[] }
        return HttpResponse.json({
          aprobadas: body.ids.filter((id) => id === propuestaConocimiento.id),
          fallidas: Object.fromEntries(
            body.ids
              .filter((id) => id !== propuestaConocimiento.id)
              .map((id) => [id, [errorValidacion({ mensaje: 'Falta la propiedad obligatoria «clan»' })]]),
          ),
        })
      }),
    )
    const { user } = renderPage()
    const ul = await lista()
    const boton = screen.getByRole('button', { name: 'Aprobar seleccionadas (0)' })
    expect(boton).toBeDisabled()
    await user.click(within(ul).getByRole('checkbox', { name: /Crea un PNJ Nosferatu/ }))
    await user.click(within(ul).getByRole('checkbox', { name: /Añade a lo que sabe Lucía/ }))
    await user.click(screen.getByRole('button', { name: 'Aprobar seleccionadas (2)' }))

    await waitFor(() =>
      expect(lastRequest('POST', `/campanas/${CID}/propuestas/aprobar-lote`)?.body).toEqual({
        ids: [propuestaConocimiento.id, propuestaNuevoPnj.id],
      }),
    )
    const resumen = await screen.findByText('Lote revisado: 1 aprobadas, 1 con errores')
    const alerta = resumen.closest('[role="alert"]') as HTMLElement
    expect(within(alerta).getByText(/Añade a lo que sabe Lucía/)).toBeInTheDocument()
    const fallida = alerta.querySelector(`[data-fallida="${propuestaNuevoPnj.id}"]`) as HTMLElement
    expect(within(fallida).getByText(/Crea un PNJ Nosferatu/)).toBeInTheDocument()
    expect(within(fallida).getByText('Falta la propiedad obligatoria «clan»')).toBeInTheDocument()
    // La fallida sigue marcada para reintentar.
    expect(screen.getByRole('button', { name: 'Aprobar seleccionada (1)' })).toBeEnabled()
    // Región viva para lectores de pantalla.
    expect(alerta.closest('[aria-live="polite"]')).not.toBeNull()
  })

  it('«Seleccionar todas» marca todas las pendientes', async () => {
    const { user } = renderPage()
    await lista()
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar todas las pendientes' }))
    expect(screen.getByRole('button', { name: 'Aprobar seleccionadas (2)' })).toBeEnabled()
  })
})
