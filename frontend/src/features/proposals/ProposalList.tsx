/** Lista de propuestas (columna maestra) con casillas para aprobar en lote. */
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { PropuestaResumen } from '@/api/hooks'
import { EntityLink } from '@/components/common/EntityLink'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { AgentLabel, Conteos, Destino, EstadoBadge, Fecha } from './parts'
import { truncar, type FiltroEstado } from './utils'

const MAX_ENTIDADES = 4

export function ProposalList({
  propuestas,
  filtro,
  seleccionada,
  hrefDe,
  onAbrir,
  marcadas,
  onMarcar,
}: {
  propuestas: PropuestaResumen[]
  filtro: FiltroEstado
  /** Id de la propuesta abierta en el detalle. */
  seleccionada?: string
  hrefDe: (pid: string) => string
  onAbrir: (pid: string) => void
  marcadas: Set<string>
  onMarcar: (pid: string, marcada: boolean) => void
}) {
  const { t } = useTranslation('propuestas')
  return (
    <ul className="space-y-2" aria-label={t('lista.titulo')}>
      {propuestas.map((p) => {
        const activa = p.id === seleccionada
        const pendiente = p.estado === 'pendiente'
        const entidades = p.entidades ?? []
        const resto = entidades.length - MAX_ENTIDADES
        const peticionCorta = truncar(p.peticion, 140)
        return (
          <li
            key={p.id}
            data-propuesta={p.id}
            className={cn(
              'relative flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50',
              activa && 'border-primary/60 bg-muted/60 ring-1 ring-primary/30',
            )}
          >
            {pendiente && (
              <Checkbox
                className="relative z-10 mt-1"
                checked={marcadas.has(p.id)}
                onCheckedChange={(v) => onMarcar(p.id, v === true)}
                aria-label={t('lista.marcar', { peticion: truncar(p.peticion, 60) })}
              />
            )}
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AgentLabel agente={p.agente} tipoAgente={p.tipoAgente} className="max-w-full" />
                <Fecha iso={p.creada} />
                {filtro === 'todas' && <EstadoBadge estado={p.estado} className="relative z-10" />}
              </div>
              <Link
                to={hrefDe(p.id)}
                onClick={() => onAbrir(p.id)}
                aria-current={activa ? 'true' : undefined}
                title={p.peticion}
                // El enlace cubre toda la tarjeta (after:inset-0); los controles internos van por encima (z-10).
                className="block text-sm font-medium break-words after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {peticionCorta}
              </Link>
              {p.resumen && <p className="line-clamp-2 text-xs text-muted-foreground">{p.resumen}</p>}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Destino destino={p.destino} />
                <Conteos anadidas={p.numAnadidas} eliminadas={p.numEliminadas} />
              </div>
              {entidades.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {entidades.slice(0, MAX_ENTIDADES).map((e) => (
                    <EntityLink
                      key={e.iri}
                      id={e.id}
                      etiqueta={e.etiqueta}
                      tipo={e.tipo}
                      className="relative z-10 max-w-48 rounded-md border bg-background px-1.5 py-0.5 text-xs font-normal"
                    />
                  ))}
                  {resto > 0 && (
                    <span className="text-xs text-muted-foreground">{t('lista.masEntidades', { count: resto })}</span>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
