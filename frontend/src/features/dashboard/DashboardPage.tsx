import { Calendar, Clock, Inbox, Plus, ScrollText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { usePanel } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink, TypeBadge } from '@/components/common/EntityLink'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, QueryState } from '@/components/common/States'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GenerateButton } from '@/features/generator/GeneratorDialog'
import { formatDate, relativeTime } from '@/lib/format'

/** Panel de campaña: recuentos, entidades recientes, tramas abiertas, propuestas y última sesión. */
export function DashboardPage() {
  const { t, i18n } = useTranslation('panel')
  const camp = useCampaign()
  const panel = usePanel(camp.cid)

  return (
    <div className="space-y-6">
      <PageHeader
        title={camp.info.campana.nombre}
        subtitle={camp.info.campana.descripcion}
        migas={[{ label: t('common:nav.campanas'), to: '/' }, { label: camp.info.campana.nombre }]}
        actions={
          <>
            <GenerateButton />
            <Button asChild variant="outline">
              <Link to={camp.path('grafo')}>{t('common:nav.grafo')}</Link>
            </Button>
          </>
        }
      />
      <QueryState query={panel}>
        {(p) => (
          <>
            <section aria-label={t('recuentos')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {camp.info.tipos.map((tipo) => (
                <Link
                  key={tipo.clase.clave}
                  to={camp.path(`explorar/${encodeURIComponent(tipo.clase.clave)}`)}
                  className="group rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TypeIcon name={tipo.estilo.icono} color={tipo.estilo.color} />
                    <span className="truncate">{tipo.clase.etiqueta}</span>
                  </div>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{p.recuentos[tipo.clase.clave] ?? 0}</p>
                </Link>
              ))}
            </section>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <ScrollText className="size-5" /> {t('tramas')}
                  </CardTitle>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={camp.path('nueva/rpg%3APlot')}>
                      <Plus /> {t('nuevaTrama')}
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {p.tramasAbiertas.length === 0 ? (
                    <EmptyState title={t('sinTramas')} className="p-6" />
                  ) : (
                    <ul className="divide-y">
                      {p.tramasAbiertas.map((tr) => (
                        <li key={tr.entidad.iri} className="space-y-1 py-3 first:pt-0 last:pb-0">
                          <EntityLink id={tr.entidad.id} etiqueta={tr.entidad.etiqueta} tipo={tr.entidad.tipo} />
                          {tr.entidad.descripcion && (
                            <p className="text-sm text-muted-foreground">{tr.entidad.descripcion}</p>
                          )}
                          {tr.implicados.length > 0 && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                              {tr.implicados.map((x) => (
                                <EntityLink key={x.iri} id={x.id} etiqueta={x.etiqueta} tipo={x.tipo} className="font-normal" />
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Inbox className="size-5" /> {t('propuestas')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <p className="text-4xl font-semibold tabular-nums">{p.propuestasPendientes}</p>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{t('pendientes', { count: p.propuestasPendientes })}</p>
                      <Button asChild size="sm" variant={p.propuestasPendientes ? 'default' : 'outline'} className="mt-2">
                        <Link to={camp.path('propuestas')}>{t('revisar')}</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="size-5" /> {t('ultimaSesion')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {p.ultimaSesion ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {p.ultimaSesion.numero != null && <Badge>{p.ultimaSesion.numero}</Badge>}
                          <EntityLink
                            id={p.ultimaSesion.entidad.id}
                            etiqueta={p.ultimaSesion.entidad.etiqueta}
                            tipo={p.ultimaSesion.entidad.tipo}
                            showIcon={false}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.ultimaSesion.fecha, i18n.language)}
                          {p.ultimaSesion.fechaMundo && ` · ${p.ultimaSesion.fechaMundo}`}
                        </p>
                        {p.ultimaSesion.notas && <p className="line-clamp-5 text-sm">{p.ultimaSesion.notas}</p>}
                        <Button asChild size="sm" variant="ghost" className="px-0">
                          <Link to={camp.path('sesiones')}>{t('verSesiones')}</Link>
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('sinSesiones')}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="size-5" /> {t('recientes')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {p.recientes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('sinRecientes')}</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {p.recientes.map((e) => (
                      <li key={e.iri} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <EntityLink id={e.id} etiqueta={e.etiqueta} tipo={e.tipo} />
                        <span className="flex shrink-0 items-center gap-2">
                          <TypeBadge tipo={e.tipo} className="hidden sm:inline-flex" />
                          <span className="text-xs text-muted-foreground">
                            {relativeTime(e.modificada, i18n.language)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </QueryState>
    </div>
  )
}
