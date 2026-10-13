import { AlertTriangle, ArrowRight, Map as MapIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useIncoherencias, useMapasDeEntidad, type Entidad, type HechoTemporal } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink } from '@/components/common/EntityLink'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Aviso con las incoherencias activas que afectan a la entidad. */
export function EntityCoherenceAlert({ entidad }: { entidad: Entidad }) {
  const { t } = useTranslation('entidad')
  const camp = useCampaign()
  const informe = useIncoherencias(camp.cid, { entidad: entidad.iri })
  const activas = informe.data?.incoherencias.filter((i) => !i.ignorada) ?? []
  if (activas.length === 0) return null
  const hayErrores = activas.some((i) => i.severidad === 'error')
  return (
    <Alert
      className={
        hayErrores
          ? 'border-red-600/40 bg-red-500/5 text-red-800 dark:text-red-300'
          : 'border-amber-600/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
      }
    >
      <AlertTriangle />
      <AlertTitle>{t('coherencia.titulo', { count: activas.length })}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {activas.map((i) => (
            <li key={i.id}>
              <span className="font-medium text-foreground">{i.titulo}</span>
              {i.mensajes[0] && <span> — {i.mensajes[0]}</span>}
            </li>
          ))}
        </ul>
        <Link to={camp.path('coherencia')} className="mt-1 inline-flex items-center gap-1">
          {t('coherencia.ver')} <ArrowRight className="size-3.5" />
        </Link>
      </AlertDescription>
    </Alert>
  )
}

/** Mapas en los que aparece la entidad (como marcador o como el propio mapa). */
export function EntityMaps({ eid }: { eid: string }) {
  const { t } = useTranslation('entidad')
  const camp = useCampaign()
  const mapas = useMapasDeEntidad(camp.cid, eid)
  if (!mapas.data?.length) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapIcon className="size-4" /> {t('mapas.titulo')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {mapas.data.map((m) => (
            <li key={m.entidad.iri}>
              <Link
                to={camp.path(`mapas/${encodeURIComponent(m.entidad.id)}`)}
                className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                aria-label={t('mapas.ver', { nombre: m.entidad.etiqueta })}
              >
                <MapIcon className="size-3.5 text-muted-foreground" />
                {m.entidad.etiqueta}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Historia temporal: valores de cada propiedad entre sesiones. */
export function TemporalHistory({ hechos }: { hechos: HechoTemporal[] }) {
  const { t } = useTranslation('entidad')
  const grupos = new Map<string, { etiqueta: string; hechos: HechoTemporal[] }>()
  for (const h of hechos) {
    const g = grupos.get(h.propiedad.valor) ?? { etiqueta: h.propiedad.etiqueta, hechos: [] }
    g.hechos.push(h)
    grupos.set(h.propiedad.valor, g)
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t('historia.explicacion')}</p>
      {[...grupos.entries()].map(([clave, g]) => (
        <Card key={clave}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{g.etiqueta}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-3 border-l pl-4">
              {g.hechos.map((h, k) => (
                <li key={`${h.valor.valor}-${k}`} className="relative">
                  <span
                    className={
                      'absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full border-2 border-background ' +
                      (h.vigente ? 'bg-primary' : 'bg-muted-foreground/50')
                    }
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {h.valor.id ? (
                      <EntityLink id={h.valor.id} etiqueta={h.valor.etiqueta} />
                    ) : (
                      <span className="font-medium">{h.valor.etiqueta}</span>
                    )}
                    {h.vigente && <Badge variant="secondary">{t('historia.vigente')}</Badge>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    {h.desde ? (
                      <EntityLink id={h.desde.id} etiqueta={h.desde.etiqueta} showIcon={false} className="font-normal" />
                    ) : (
                      <span>{t('historia.inicio')}</span>
                    )}
                    <ArrowRight className="size-3" aria-hidden />
                    {h.hasta ? (
                      <EntityLink id={h.hasta.id} etiqueta={h.hasta.etiqueta} showIcon={false} className="font-normal" />
                    ) : (
                      <span>{t('historia.actual')}</span>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
