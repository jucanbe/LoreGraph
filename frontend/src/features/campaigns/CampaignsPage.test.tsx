import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPath } from '@/test/handlers'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor, within } from '@/test/utils'
import { CampaignsPage } from './CampaignsPage'

const zip = () => new File(['PK\u0003\u0004'], 'noches.zip', { type: 'application/zip' })

describe('CampaignsPage · importar', () => {
  beforeEach(() => server.use(http.get(apiPath('/modulos'), () => HttpResponse.json([]))))

  it('importa un ZIP con otro id y abre la campaña', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    server.use(
      http.post(apiPath('/campanas/importar'), () => {
        return HttpResponse.json({ id: 'copia', nombre: 'Copia', tripletas: 1234, imagenes: 5, avisos: ['Imagen rota.png omitida'] })
      }),
    )
    const { user, router } = renderWithProviders(<CampaignsPage />, { path: '/' })
    await user.click(await screen.findByRole('button', { name: /Importar campaña/ }))
    const dialog = await screen.findByRole('dialog')
    const enviar = within(dialog).getByRole('button', { name: 'Importar' })
    expect(enviar).toBeDisabled()
    await user.upload(within(dialog).getByLabelText('Archivo ZIP'), zip())
    await user.type(within(dialog).getByLabelText(/Nuevo identificador/), 'copia')
    await user.click(enviar)

    await waitFor(() => expect(router.state.location.pathname).toBe('/c/copia'))
    // Multipart: el archivo y el id nuevo; el nombre vacío no se envía.
    const llamada = fetchSpy.mock.calls.find(([url]) => String(url).endsWith('/campanas/importar'))
    const fd = llamada?.[1]?.body as FormData
    expect(fd.get('id')).toBe('copia')
    expect(fd.get('nombre')).toBeNull()
    expect((fd.get('archivo') as File).name).toBe('noches.zip')
    fetchSpy.mockRestore()
    expect(await screen.findByText('Campaña «Copia» importada')).toBeInTheDocument()
    expect(screen.getByText('1234 tripletas · 5 imágenes')).toBeInTheDocument()
    expect(screen.getByText('Imagen rota.png omitida')).toBeInTheDocument()
  })

  it('si el id ya existe (409) sugiere usar otro', async () => {
    server.use(
      http.post(apiPath('/campanas/importar'), () =>
        HttpResponse.json({ detalle: "Ya existe la campaña 'noches-de-madrid'", errores: [] }, { status: 409 }),
      ),
    )
    const { user, router } = renderWithProviders(<CampaignsPage />, { path: '/' })
    await user.click(await screen.findByRole('button', { name: /Importar campaña/ }))
    const dialog = await screen.findByRole('dialog')
    await user.upload(within(dialog).getByLabelText('Archivo ZIP'), zip())
    await user.click(within(dialog).getByRole('button', { name: 'Importar' }))
    expect(await within(dialog).findByText(/Escribe otro en «Nuevo identificador»/)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })
})
