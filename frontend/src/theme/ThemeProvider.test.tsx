import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider, useTheme } from './ThemeProvider'

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

function Selector() {
  const { mode, resolved, setMode } = useTheme()
  return (
    <div>
      <p>
        {mode}/{resolved}
      </p>
      <button onClick={() => setMode('dark')}>oscuro</button>
      <button onClick={() => setMode('light')}>claro</button>
      <button onClick={() => setMode('system')}>sistema</button>
    </div>
  )
}

/** Simula `prefers-color-scheme` con un MediaQueryList controlable. */
function mockSystemDark(initial: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
  }
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList)
  return {
    spy,
    change: (dark: boolean) => {
      mql.matches = dark
      listeners.forEach((l) => l({ matches: dark } as MediaQueryListEvent))
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('ThemeProvider', () => {
  it('añade y quita la clase `dark` en <html> y recuerda la elección', async () => {
    const user = userEvent.setup()
    render(<Selector />, { wrapper })
    expect(screen.getByText('system/light')).toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('dark')

    await user.click(screen.getByRole('button', { name: 'oscuro' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(localStorage.getItem('loregraph.tema')).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'claro' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(screen.getByText('light/light')).toBeInTheDocument()
  })

  it('lee el modo guardado al arrancar', () => {
    localStorage.setItem('loregraph.tema', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.mode).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('en modo sistema sigue a prefers-color-scheme', () => {
    const media = mockSystemDark(true)
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.resolved).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
    act(() => media.change(false))
    expect(result.current.resolved).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('useTheme fuera del provider lanza un error claro', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/)
  })
})
