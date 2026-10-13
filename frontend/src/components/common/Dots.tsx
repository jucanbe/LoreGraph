import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** Fila de puntos (●●●○○) para valores enteros pequeños, como en muchos sistemas de rol. */
export function Dots({ value, max = 5, className }: { value: number; max?: number; className?: string }) {
  const total = Math.max(max, value)
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label={`${value} / ${total}`} role="img">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'size-3 rounded-full border border-foreground/50',
            i < value ? 'bg-primary border-primary' : 'bg-transparent',
          )}
        />
      ))}
    </span>
  )
}

/** Editor de puntos: pulsa un punto para fijar el valor; pulsar el actual lo reduce en uno. */
export function DotsInput({
  value,
  onChange,
  min = 0,
  max = 5,
  id,
  invalid,
  label,
}: {
  value: number | null
  onChange: (v: number | null) => void
  min?: number
  max?: number
  id?: string
  invalid?: boolean
  label: string
}) {
  const { t } = useTranslation('formulario')
  const current = value ?? 0
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        aria-invalid={invalid || undefined}
        className="inline-flex items-center gap-1.5"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault()
            onChange(Math.min(max, current + 1))
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault()
            onChange(Math.max(min, current - 1))
          }
        }}
      >
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1
          const filled = n <= current
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === current}
              aria-label={String(n)}
              tabIndex={n === Math.max(1, current) ? 0 : -1}
              onClick={() => onChange(n === current ? Math.max(min, n - 1) : n)}
              className={cn(
                'size-5 rounded-full border-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                filled ? 'border-primary bg-primary' : 'border-foreground/40 hover:border-primary',
                invalid && 'border-destructive',
              )}
            />
          )
        })}
      </div>
      <span className="text-sm tabular-nums text-muted-foreground">
        {value ?? '—'} / {max}
      </span>
      {value !== null && (
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onChange(null)}>
          {t('vaciar')}
        </button>
      )}
    </div>
  )
}
