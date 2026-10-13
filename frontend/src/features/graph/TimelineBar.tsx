import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SesionLinea } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { puntosTemporales } from './timeline'

/**
 * Barra temporal: estado del mundo al final de la sesión N (relaciones
 * cualificadas con vigencia) o el estado actual. La última posición del
 * deslizador es «actual» (sin parámetro `sesion`).
 */
export function TimelineBar({
  sesiones,
  value,
  onChange,
  disabled,
  className,
}: {
  sesiones: SesionLinea[]
  value: number | undefined
  onChange: (sesion: number | undefined) => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation('grafo')
  const puntos = useMemo(() => puntosTemporales(sesiones), [sesiones])
  const actualIdx = puntos.length
  const committedIdx = useMemo(() => {
    if (value === undefined) return actualIdx
    const exact = puntos.findIndex((p) => p.numero === value)
    if (exact >= 0) return exact
    // Sesión inexistente: la más cercana anterior (o la primera).
    let best = 0
    puntos.forEach((p, i) => {
      if (p.numero <= value) best = i
    })
    return best
  }, [value, puntos, actualIdx])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const idx = dragIdx ?? committedIdx

  if (puntos.length === 0) {
    return (
      <p className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <History className="size-3.5" /> {t('tiempo.sinSesiones')}
      </p>
    )
  }

  const commit = (i: number) => {
    setDragIdx(null)
    onChange(i >= actualIdx ? undefined : puntos[i]?.numero)
  }
  const current = puntos[idx]
  const texto = current ? t('tiempo.enSesion', { n: current.numero, titulo: current.etiqueta }) : t('tiempo.actual')

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2', className)}>
      <div className="flex min-w-0 items-center gap-2 text-sm sm:w-64">
        <History className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">{t('tiempo.titulo')}</span>
        <span className="truncate font-medium" aria-live="polite" title={texto}>
          {texto}
        </span>
      </div>
      <div className="flex min-w-48 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('tiempo.anterior')}
          disabled={disabled || idx <= 0}
          onClick={() => commit(idx - 1)}
        >
          <ChevronLeft />
        </Button>
        <div className="relative flex-1 pt-1 pb-4">
          <Slider
            min={0}
            max={actualIdx}
            step={1}
            value={[idx]}
            disabled={disabled}
            aria-label={t('tiempo.titulo')}
            aria-valuetext={texto}
            onValueChange={(v) => setDragIdx(v[0] ?? actualIdx)}
            onValueCommit={(v) => commit(v[0] ?? actualIdx)}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3 text-[10px] text-muted-foreground" aria-hidden>
            {[...puntos.map((p) => String(p.numero)), t('tiempo.ahora')].map((label, i) =>
              puntos.length <= 24 || i % Math.ceil(puntos.length / 12) === 0 || i === actualIdx ? (
                <span
                  key={`${label}-${i}`}
                  className={cn('absolute -translate-x-1/2', i === idx && 'font-semibold text-foreground')}
                  style={{ left: `${(i / actualIdx) * 100}%` }}
                >
                  {label}
                </span>
              ) : null,
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('tiempo.siguiente')}
          disabled={disabled || idx >= actualIdx}
          onClick={() => commit(idx + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
      <Button
        variant={value === undefined ? 'secondary' : 'outline'}
        size="sm"
        disabled={disabled || value === undefined}
        onClick={() => commit(actualIdx)}
      >
        {t('tiempo.actual')}
      </Button>
    </div>
  )
}
