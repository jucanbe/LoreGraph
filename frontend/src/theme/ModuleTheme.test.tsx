import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TemaActivo } from '@/api/hooks'
import { infoCampana } from '@/test/fixtures'
import { buildThemeCss, ModuleTheme } from './ModuleTheme'

const tema: TemaActivo = {
  modulo: 'demo',
  urlBaseAssets: '/modulos/demo/assets',
  tema: {
    claro: { primary: '#8b0a1a', background: 'oklch(0.98 0 0)', inventado: '#fff', ring: 'red; } body { x: y' },
    oscuro: { primary: '#ff5566' },
    fuentes: {
      texto: "'Inter', sans-serif",
      titulos: "'Cinzel', serif",
      google: ['Cinzel:wght@400;700'],
      archivos: [{ familia: 'Gotica', archivo: '/fuentes/gotica.woff2', peso: '400', estilo: 'normal' }],
    },
    radio: '0.25rem',
  },
} as TemaActivo

describe('buildThemeCss', () => {
  it('filtra tokens desconocidos y valores peligrosos', () => {
    const css = buildThemeCss(tema)
    expect(css).toContain('--primary: #8b0a1a;')
    expect(css).toContain('--background: oklch(0.98 0 0);')
    expect(css).not.toContain('inventado')
    expect(css).not.toContain('body')
    expect(css).not.toContain('--ring')
  })

  it('incluye fuentes, radio, bloque oscuro y @font-face con la URL de la API', () => {
    const css = buildThemeCss(tema)
    expect(css).toContain("--app-font-sans: 'Inter', sans-serif;")
    expect(css).toContain("--app-font-heading: 'Cinzel', serif;")
    expect(css).toContain('--radius: 0.25rem;')
    expect(css).toMatch(/:root\.dark \{ --primary: #ff5566; \}/)
    expect(css).toContain("@font-face { font-family: 'Gotica'; src: url('/api/modulos/demo/assets/fuentes/gotica.woff2');")
  })

  it('funciona con el tema real de un módulo', () => {
    const css = buildThemeCss(infoCampana.tema!)
    expect(css.startsWith(':root {')).toBe(true)
    expect(css).toContain(':root.dark {')
  })
})

describe('<ModuleTheme>', () => {
  it('inyecta y retira la hoja de estilos, las fuentes y el atributo del módulo', () => {
    const { unmount } = render(<ModuleTheme tema={tema} />)
    const style = document.getElementById('loregraph-module-theme')
    expect(style?.tagName).toBe('STYLE')
    expect(style?.textContent).toBe(buildThemeCss(tema))
    const link = document.getElementById('loregraph-module-fonts') as HTMLLinkElement | null
    expect(link?.href).toContain('family=Cinzel:wght@400;700')
    expect(document.documentElement.dataset.modulo).toBe('demo')
    unmount()
    expect(document.getElementById('loregraph-module-theme')).toBeNull()
    expect(document.getElementById('loregraph-module-fonts')).toBeNull()
    expect(document.documentElement.dataset.modulo).toBeUndefined()
  })

  it('no hace nada sin tema', () => {
    render(<ModuleTheme tema={null} />)
    expect(document.getElementById('loregraph-module-theme')).toBeNull()
  })
})
