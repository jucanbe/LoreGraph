import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { Ajustes } from '@/api/hooks'
import { apiPath, lastRequest } from '@/test/handlers'
import { server } from '@/test/server'
import { renderWithProviders, screen, waitFor } from '@/test/utils'
import { SettingsPage } from './SettingsPage'

function ajuste(clave: string, valor: unknown, origen: 'env' | 'ajustes' = 'env', secreto = false) {
  return { clave, valor: secreto ? null : valor, origen, porDefecto: secreto ? null : valor, secreto, configurado: secreto ? !!valor : true }
}

const datos: Ajustes = {
  ajustes: {
    llm_provider: ajuste('llm_provider', 'ollama'),
    llm_base_url: ajuste('llm_base_url', 'http://localhost:11434/v1'),
    llm_model: ajuste('llm_model', 'qwen3:8b', 'ajustes'),
    llm_api_key: ajuste('llm_api_key', 'x', 'ajustes', true),
    llm_context_tokens: ajuste('llm_context_tokens', 8192),
    llm_timeout_s: ajuste('llm_timeout_s', 120),
    llm_max_retries: ajuste('llm_max_retries', 3),
    llm_output_mode: ajuste('llm_output_mode', 'tool'),
    user_name: ajuste('user_name', 'dm'),
    federation_enabled: ajuste('federation_enabled', true),
    federation_user_agent: ajuste('federation_user_agent', 'LoreGraph/0.1 (https://x)'),
    federation_timeout_s: ajuste('federation_timeout_s', 15),
    sparql_max_results: ajuste('sparql_max_results', 1000),
    sparql_timeout_s: ajuste('sparql_timeout_s', 20),
  },
} as unknown as Ajustes

function setup() {
  server.use(
    http.get(apiPath('/ajustes'), () => HttpResponse.json(datos)),
    http.put(apiPath('/ajustes'), () => HttpResponse.json(datos)),
    http.post(apiPath('/ajustes/llm/probar'), () =>
      HttpResponse.json({ ok: true, modelos: ['llama3:8b', 'qwen3:8b'], modeloDisponible: true, error: null }),
    ),
  )
  return renderWithProviders(<SettingsPage />, { route: '/ajustes', path: '/ajustes' })
}

describe('SettingsPage', () => {
  it('muestra los ajustes con su origen y nunca la clave', async () => {
    setup()
    expect(await screen.findByDisplayValue('qwen3:8b')).toBeInTheDocument()
    expect(screen.getByLabelText(/Clave de API/)).toHaveValue('')
    expect(screen.getByPlaceholderText(/guardada/)).toBeInTheDocument()
    expect(screen.getAllByText('personalizado').length).toBeGreaterThan(0)
  })

  it('envía solo lo cambiado y las claves a restablecer', async () => {
    const { user } = setup()
    const modelo = await screen.findByDisplayValue('qwen3:8b')
    await user.clear(modelo)
    await user.type(modelo, 'llama3:8b')
    await user.click(screen.getAllByRole('button', { name: /Restablecer/ })[0]!)
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(lastRequest('PUT', '/ajustes')?.body).toBeTruthy())
    const body = lastRequest('PUT', '/ajustes')!.body as { llm_model?: string; restablecer: string[] }
    expect(body.restablecer).toContain('llm_model')
    expect(body.llm_model).toBeUndefined()
  })

  it('permite elegir el modo de salida estructurada', async () => {
    const { user } = setup()
    const modo = await screen.findByRole('combobox', { name: /Modo de salida estructurada/ })
    expect(modo).toHaveTextContent('Herramienta (tool calling)')
    await user.click(modo)
    await user.click(await screen.findByRole('option', { name: /En el prompt/ }))
    expect(screen.getByText(/El esquema va en las instrucciones/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(lastRequest('PUT', '/ajustes')?.body).toBeTruthy())
    expect((lastRequest('PUT', '/ajustes')!.body as { llm_output_mode?: string }).llm_output_mode).toBe('prompted')
  })

  it('prueba la conexión y lista los modelos', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Probar conexión/ }))
    expect(await screen.findByText(/Conectado: 2 modelos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'llama3:8b' })).toBeInTheDocument()
  })
})
