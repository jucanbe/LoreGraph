import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Grafo } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { TypeIcon } from '@/components/common/TypeIcon'
import type { LineStyle } from '@/components/graph/graph-style'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { legendEntries } from './legend'

function ShapeSwatch({ color, forma, icono }: { color: string; forma: string; icono?: string | null }) {
  const round = forma === 'ellipse'
  const diamond = forma.includes('diamond')
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center text-white',
        round ? 'rounded-full' : 'rounded-[4px]',
        diamond && 'rotate-45 scale-90',
      )}
      style={{ backgroundColor: color }}
    >
      <TypeIcon name={icono} className={cn('size-3', diamond && '-rotate-45')} />
    </span>
  )
}

export function LineSwatch({ color, linea, className }: { color?: string | null; linea: LineStyle; className?: string }) {
  const dash = linea === 'dashed' ? '5 3' : linea === 'dotted' ? '1.5 2.5' : undefined
  return (
    <svg aria-hidden width="28" height="10" viewBox="0 0 28 10" className={cn('shrink-0', className)}>
      <line
        x1="1"
        y1="5"
        x2="22"
        y2="5"
        stroke={color || 'currentColor'}
        strokeWidth="2"
        strokeDasharray={dash}
        strokeLinecap="round"
        opacity={color ? 1 : 0.5}
      />
      <path d="M21 1.5 L27 5 L21 8.5 Z" fill={color || 'currentColor'} opacity={color ? 1 : 0.5} />
    </svg>
  )
}

/** Leyenda de la vista epistémica: qué significa cada estilo respecto al canon. */
function EpistemicLegend() {
  const { t } = useTranslation('grafo')
  return (
    <section aria-labelledby="leyenda-epistemica" className="space-y-1.5">
      <h3 id="leyenda-epistemica" className="text-xs font-semibold">
        {t('epistemico.leyenda')}
      </h3>
      <ul className="space-y-1 text-xs">
        <li className="flex items-center gap-2">
          <span className="inline-block size-3.5 rounded-full border-2 border-dashed border-destructive" aria-hidden />
          <span>
            <span className="font-medium text-destructive">✗ {t('epistemico.falso')}</span> — {t('epistemico.falsoDesc')}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3.5 rounded-full border-2 border-dotted border-amber-500" aria-hidden />
          <span>
            <span className="font-medium text-amber-600 dark:text-amber-400">? {t('epistemico.no_verificado')}</span> —{' '}
            {t('epistemico.noVerificadoDesc')}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3.5 rounded-full border-2 border-dashed border-muted-foreground opacity-50" aria-hidden />
          <span>
            <span className="font-medium">{t('epistemico.desconocido')}</span> — {t('epistemico.desconocidoDesc')}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block size-3.5 rounded-full bg-muted-foreground/60" aria-hidden />
          <span>
            <span className="font-medium">{t('epistemico.confirmado')}</span> — {t('epistemico.confirmadoDesc')}
          </span>
        </li>
      </ul>
    </section>
  )
}

/** Leyenda flotante (plegable) con los tipos y relaciones presentes. */
export function GraphLegend({ grafo, epistemica, className }: { grafo: Grafo; epistemica: boolean; className?: string }) {
  const { t } = useTranslation('grafo')
  const camp = useCampaign()
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerHeight >= 820)
  const { tipos, relaciones } = useMemo(
    () => legendEntries(grafo, (c) => camp.tipoPorClave.get(c)?.clase.etiqueta),
    [grafo, camp.tipoPorClave],
  )
  if (tipos.length === 0 && !epistemica) return null
  return (
    <div
      className={cn(
        'pointer-events-auto max-h-[60%] w-64 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border bg-background/90 shadow-sm backdrop-blur',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between rounded-b-none"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {t('leyenda.titulo')}
        {open ? <ChevronDown /> : <ChevronUp />}
      </Button>
      {open && (
        <div className="max-h-80 space-y-3 overflow-y-auto px-3 pt-1 pb-3">
          {epistemica && <EpistemicLegend />}
          {tipos.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold">{t('leyenda.tipos')}</h3>
              <ul className="space-y-1">
                {tipos.map((tp) => (
                  <li key={tp.clave} className="flex items-center gap-2 text-xs">
                    <ShapeSwatch color={tp.color} forma={tp.forma} icono={tp.icono} />
                    <span className="min-w-0 flex-1 truncate">{tp.etiqueta}</span>
                    <span className="text-muted-foreground tabular-nums">{tp.n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {relaciones.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold">{t('leyenda.relaciones')}</h3>
              <ul className="space-y-1">
                {relaciones.map((r) => (
                  <li key={r.clave} className="flex items-center gap-2 text-xs">
                    <LineSwatch color={r.color} linea={r.linea} className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{r.etiqueta}</span>
                    <span className="text-muted-foreground tabular-nums">{r.n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
