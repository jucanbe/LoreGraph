/**
 * Preparación común de Vitest (se ejecuta antes de cada fichero de test).
 *
 * - Matchers de jest-dom (`toBeInTheDocument`, `toHaveTextContent`…).
 * - Limpieza del DOM tras cada test.
 * - i18n inicializado en español.
 * - Polyfills que jsdom no trae y que necesitan Radix/shadcn (matchMedia,
 *   ResizeObserver, scrollIntoView, captura de puntero…).
 * - `Request` acepta URLs relativas (el cliente usa `/api` como base).
 * - Servidor MSW con los manejadores por defecto de `handlers.ts`.
 *
 * IMPORTANTE: `server.listen()` se llama al cargar este fichero (no en
 * `beforeAll`) porque `openapi-fetch` captura `globalThis.fetch` y
 * `globalThis.Request` al crear el cliente, es decir, al importar
 * `@/api/client` desde el fichero de test; MSW tiene que estar ya instalado.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, vi } from 'vitest'

// ------------------------------------------------------------------ polyfills
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

class ResizeObserverStub implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds: readonly number[] = []
  readonly scrollMargin = ''
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}
globalThis.IntersectionObserver ??= IntersectionObserverStub

Element.prototype.scrollIntoView ??= function scrollIntoView() {}
Element.prototype.scrollTo ??= function scrollTo() {}
window.scrollTo = () => undefined
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.setPointerCapture ??= () => undefined
Element.prototype.releasePointerCapture ??= () => undefined

globalThis.DOMRect ??= class DOMRectStub {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}
  get top() {
    return this.y
  }
  get left() {
    return this.x
  }
  get right() {
    return this.x + this.width
  }
  get bottom() {
    return this.y + this.height
  }
  toJSON() {
    return this
  }
  static fromRect(r?: DOMRectInit) {
    return new DOMRectStub(r?.x, r?.y, r?.width, r?.height)
  }
} as unknown as typeof DOMRect

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => 'blob:test')
  URL.revokeObjectURL = vi.fn()
}

// El fetch de Node no admite URLs relativas: las resolvemos contra la página de jsdom.
const NativeRequest = globalThis.Request
class RelativeRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const resolved = typeof input === 'string' && input.startsWith('/') ? new URL(input, window.location.origin).href : input
    super(resolved, init)
  }
}
globalThis.Request = RelativeRequest as typeof Request

// ----------------------------------------------------------------------- i18n
const { default: i18n } = await import('@/i18n')
await i18n.changeLanguage('es')

// ------------------------------------------------------------------------ MSW
const { server } = await import('./server')
const { resetMockDb } = await import('./handlers')
server.listen({ onUnhandledFrame: 'error' })

afterEach(async () => {
  cleanup()
  server.resetHandlers()
  resetMockDb()
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  if (i18n.language !== 'es') await i18n.changeLanguage('es')
})

afterAll(() => server.close())
