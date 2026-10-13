import { ArrowLeft, ArrowRight, Crosshair, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useEntidad, type NodoGrafo } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink, TypeBadge } from '@/components/common/EntityLink'
import { ErrorState } from '@/components/common/States'
import { TypeIcon } from '@/components/common/TypeIcon'
import { formatIntensidad } from '@/components/graph/graph-style'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const MAX_RELACIONES = 8

function EstadoBadge({ estado }: { estado: NonNullable<NodoGrafo['estadoEpistemico']> }) {
  const { t } = useTranslation('grafo')
  const cls = {
    confirmado: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400',
    falso: 'border-destructive/60 text-destructive',
    no_verificado: 'border-amber-500/60 text-amber-700 dark:text-amber-400',
    desconocido: 'border-muted-foreground/50 text-muted-foreground',
  }[estado]
  return (
    <Badge variant="outline" className={cn('font-normal', cls)}>
      {estado === 'falso' ? '✗ ' : estado === 'no_verificado' ? '? ' : ''}
      {t(`epistemico.${estado}`)}
    </Badge>
  )
}

/** Resumen de la entidad seleccionada en el grafo (panel lateral u hoja inferior). */
export function NodeSummary({ nodo, onCenter }: { nodo: NodoGrafo; onCenter?: (id: string) => void }) {
  const { t } = useTranslation('grafo')
  const camp = useCampaign()
  const esEntidad = !nodo.id.startsWith('http')
  const q = useEntidad(camp.cid, esEntidad ? nodo.id : undefined)
  const estilo = camp.estilo(nodo.tipo)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <TypeIcon name={nodo.icono ?? estilo.icono} color={nodo.color ?? estilo.color} className="mt-1 size-5" />
          <h2 className="min-w-0 text-lg leading-tight font-semibold break-words">{q.data?.etiqueta ?? nodo.etiqueta}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {q.data?.tipo ? (
            <TypeBadge tipo={q.data.tipo} />
          ) : nodo.tipo ? (
            <Badge variant="outline" className="font-normal">
              {camp.tipoPorClave.get(nodo.tipo)?.clase.etiqueta ?? nodo.tipo}
            </Badge>
          ) : null}
          {nodo.estadoEpistemico && <EstadoBadge estado={nodo.estadoEpistemico} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {esEntidad && (
          <Button asChild size="sm">
            <Link to={camp.entityPath(nodo.id)}>
              <ExternalLink /> {t('common:acciones.verFicha')}
            </Link>
          </Button>
        )}
        {esEntidad && onCenter && (
          <Button size="sm" variant="outline" onClick={() => onCenter(nodo.id)}>
            <Crosshair /> {t('panel.centrar')}
          </Button>
        )}
      </div>

      {!esEntidad ? (
        <p className="text-sm text-muted-foreground">{t('panel.noEntidad')}</p>
      ) : q.isPending ? (
        <div className="space-y-2" role="status" aria-label={t('common:estado.cargando')}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} className="p-4" />
      ) : (
        <>
          {q.data.descripcion ? (
            <p className="line-clamp-6 text-sm whitespace-pre-line text-muted-foreground">{q.data.descripcion}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t('panel.sinDescripcion')}</p>
          )}
          {q.data.relaciones.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t('panel.relaciones')}</h3>
              <ul className="space-y-1.5 text-sm">
                {q.data.relaciones.slice(0, MAX_RELACIONES).map((r, i) => {
                  const etiqueta = r.cualificada && r.tipoRelacion ? r.tipoRelacion.etiqueta : r.propiedad.etiqueta
                  const Dir = r.direccion === 'saliente' ? ArrowRight : ArrowLeft
                  return (
                    <li key={`${r.propiedad.valor}-${r.otra.id}-${i}`} className="flex min-w-0 items-center gap-1.5">
                      <Dir className="size-3.5 shrink-0 text-muted-foreground" aria-label={t(`panel.${r.direccion}`)} />
                      <span className="shrink-0 text-muted-foreground">
                        {etiqueta}
                        {r.intensidad !== null && r.intensidad !== undefined && ` (${formatIntensidad(r.intensidad)})`}
                      </span>
                      <EntityLink id={r.otra.id} etiqueta={r.otra.etiqueta} tipo={r.otra.tipo} className="min-w-0" />
                    </li>
                  )
                })}
              </ul>
              {q.data.relaciones.length > MAX_RELACIONES && (
                <p className="text-xs text-muted-foreground">
                  {t('panel.masRelaciones', { count: q.data.relaciones.length - MAX_RELACIONES })}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
