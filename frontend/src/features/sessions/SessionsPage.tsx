/** Línea temporal de las sesiones de juego de la campaña. */
import { ArrowDownUp, CalendarDays, Globe2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useSesiones, type SesionLinea } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink, TypeBadge } from '@/components/common/EntityLink'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, QueryState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { groupByType, isLongText } from './group'

function Notas({ texto }: { texto: string }) {
  const { t } = useTranslation('sesiones')
  const [abierto, setAbierto] = useState(false)
  const largo = isLongText(texto)
  return (
    <div className="space-y-1">
      <p className={cn('text-sm whitespace-pre-line text-muted-foreground', largo && !abierto && 'line-clamp-4')}>{texto}</p>
      {largo && (
        <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
          {abierto ? t('verMenos') : t('verMas')}
        </Button>
      )}
    </div>
  )
}

function SessionCard({ linea }: { linea: SesionLinea }) {
  const { t, i18n } = useTranslation('sesiones')
  const { sesion, entidades } = linea
  const grupos = useMemo(() => groupByType(entidades), [entidades])
  const numero = sesion.numero
  return (
    <li className="relative pb-8 pl-12 last:pb-0 sm:pl-16">
      {/* Línea vertical y marcador con el número de sesión */}
      <span aria-hidden className="absolute top-10 bottom-0 left-[1.1rem] w-px bg-border sm:left-[1.6rem]" />
      <span
        aria-hidden
        className="absolute top-0 left-0 flex size-9 items-center justify-center rounded-full border-2 border-primary bg-background text-sm font-semibold tabular-nums sm:left-1 sm:size-11"
      >
        {numero ?? '·'}
      </span>
      <article className="space-y-3 rounded-lg border bg-card p-4 shadow-xs" aria-labelledby={`sesion-${sesion.entidad.id}`}>
        <header className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {numero !== null && numero !== undefined ? t('numero', { n: numero }) : t('sinNumero')}
          </p>
          <h2 id={`sesion-${sesion.entidad.id}`} className="text-lg leading-tight font-semibold">
            <EntityLink id={sesion.entidad.id} etiqueta={sesion.entidad.etiqueta} tipo={sesion.entidad.tipo} showIcon={false} />
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {sesion.fecha && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                <span className="sr-only">{t('fechaReal')}: </span>
                <time dateTime={sesion.fecha}>{formatDate(sesion.fecha, i18n.language)}</time>
              </span>
            )}
            {sesion.fechaMundo && (
              <span className="inline-flex items-center gap-1.5">
                <Globe2 className="size-3.5" aria-hidden />
                <span className="sr-only">{t('fechaMundo')}: </span>
                {sesion.fechaMundo}
              </span>
            )}
          </div>
        </header>

        {sesion.notas && <Notas texto={sesion.notas} />}

        {grupos.length > 0 ? (
          <section className="space-y-2" aria-label={t('aparecen')}>
            <h3 className="text-xs font-semibold text-muted-foreground">{t('aparecen')}</h3>
            <dl className="space-y-1.5">
              {grupos.map((g) => (
                <div key={g.clave} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <dt className="shrink-0">
                    {g.tipo ? <TypeBadge tipo={g.tipo} /> : <span className="text-xs text-muted-foreground">{t('otros')}</span>}
                  </dt>
                  <dd className="flex min-w-0 flex-wrap gap-1.5">
                    {g.entidades.map((e) => (
                      <EntityLink
                        key={e.id}
                        id={e.id}
                        etiqueta={e.etiqueta}
                        tipo={e.tipo}
                        className="rounded-md border bg-background px-1.5 py-0.5 text-sm"
                      />
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ) : (
          <p className="text-xs text-muted-foreground italic">{t('sinEntidades')}</p>
        )}
      </article>
    </li>
  )
}

export function SessionsPage() {
  const { t } = useTranslation('sesiones')
  const camp = useCampaign()
  const query = useSesiones(camp.cid)
  const [recientesPrimero, setRecientesPrimero] = useState(true)
  const nueva = camp.path('nueva/rpg%3ASession')

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titulo')}
        subtitle={query.data ? t('total', { count: query.data.length }) : undefined}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
        actions={
          <>
            {query.data && query.data.length > 1 && (
              <Button variant="outline" size="sm" onClick={() => setRecientesPrimero((v) => !v)} aria-pressed={recientesPrimero}>
                <ArrowDownUp /> {recientesPrimero ? t('orden.recientes') : t('orden.antiguas')}
              </Button>
            )}
            <Button asChild size="sm">
              <Link to={nueva}>
                <Plus /> {t('nueva')}
              </Link>
            </Button>
          </>
        }
      />
      <QueryState
        query={query}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title={t('vacio.titulo')}
            description={t('vacio.desc')}
            action={
              <Button asChild size="sm">
                <Link to={nueva}>
                  <Plus /> {t('nueva')}
                </Link>
              </Button>
            }
          />
        }
      >
        {(sesiones) => {
          const lista = recientesPrimero ? [...sesiones].reverse() : sesiones
          return (
            <ol className="mx-auto max-w-3xl" aria-label={t('titulo')}>
              {lista.map((s) => (
                <SessionCard key={s.sesion.entidad.id} linea={s} />
              ))}
            </ol>
          )
        }}
      </QueryState>
    </div>
  )
}
