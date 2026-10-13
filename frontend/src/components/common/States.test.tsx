import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { render, renderWithProviders, screen } from '@/test/utils'
import { EmptyState, ErrorState, LoadingState, QueryState } from './States'

type Q<T> = { data: T | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }

function query<T>(over: Partial<Q<T>>): Q<T> {
  return { data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn(), ...over }
}

describe('States', () => {
  it('LoadingState anuncia la carga', () => {
    render(<LoadingState rows={2} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
  })

  it('EmptyState muestra título por defecto, descripción y acción', () => {
    render(<EmptyState description="Nada por aquí" action={<button>Crear</button>} />)
    expect(screen.getByText('No hay nada todavía')).toBeInTheDocument()
    expect(screen.getByText('Nada por aquí')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument()
  })

  it('ErrorState muestra el mensaje y permite reintentar', async () => {
    const onRetry = vi.fn()
    const { user } = renderWithProviders(<ErrorState error={new ApiError(500, 'Fallo del almacén')} onRetry={onRetry} />)
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Algo ha fallado')
    expect(alerta).toHaveTextContent('Fallo del almacén')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('ErrorState trata el 404 como «No encontrado» sin reintento', () => {
    render(<ErrorState error={new ApiError(404, 'No existe')} onRetry={() => undefined} />)
    expect(screen.getByText('No encontrado')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('ErrorState con un error que no es Error usa el mensaje genérico', () => {
    render(<ErrorState error="raro" />)
    expect(screen.getByText('Error desconocido')).toBeInTheDocument()
  })

  it('QueryState elige carga, error, vacío o datos', () => {
    const hijo = (d: string[]) => <p>{d.join(',')}</p>
    const { rerender } = render(<QueryState query={query<string[]>({ isPending: true })}>{hijo}</QueryState>)
    expect(screen.getByRole('status')).toBeInTheDocument()

    rerender(<QueryState query={query<string[]>({ isError: true, error: new Error('roto') })}>{hijo}</QueryState>)
    expect(screen.getByRole('alert')).toHaveTextContent('roto')

    rerender(
      <QueryState query={query<string[]>({ data: [] })} isEmpty={(d) => d.length === 0} empty={<p>vacío</p>}>
        {hijo}
      </QueryState>,
    )
    expect(screen.getByText('vacío')).toBeInTheDocument()

    rerender(<QueryState query={query<string[]>({ data: ['a', 'b'] })}>{hijo}</QueryState>)
    expect(screen.getByText('a,b')).toBeInTheDocument()
  })
})
