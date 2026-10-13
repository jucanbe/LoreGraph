/**
 * Panel «Mundo real»: datos externos (Wikidata/DBpedia) enlazados a una
 * entidad mediante rpg:inspiredBy / rpg:correspondsTo. Visualmente separado
 * de los datos de la campaña: no forman parte de ella.
 */
import { ExternalLink, Globe, Info, MapPin } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMundoReal, type MundoReal } from '@/api/hooks'
import { ErrorState } from '@/components/common/States'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { hasCoords, relacionKey, thumbnailUrl } from './anchor'

const RealWorldMap = lazy(() => import('./RealWorldMap'))

function Resumen({ texto }: { texto: string }) {
  const { t } = useTranslation('mundoReal')
  const [abierto, setAbierto] = useState(false)
  const largo = texto.length > 320
  return (
    <div className="space-y-1">
      <p className={cn('text-sm leading-relaxed', largo && !abierto && 'line-clamp-4')}>{texto}</p>
      {largo && (
        <Button variant="link" size="xs" className="h-auto px-0" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto}>
          {abierto ? t('verMenos') : t('verMas')}
        </Button>
      )}
    </div>
  )
}

function Imagen({ src, alt }: { src: string; alt: string }) {
  const [fallo, setFallo] = useState(false)
  if (fallo) return null
  return (
    <img
      src={thumbnailUrl(src)}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFallo(true)}
      className="max-h-64 w-full rounded-md border bg-muted object-cover sm:w-48"
    />
  )
}

function Ancla({ a }: { a: MundoReal }) {
  const { t } = useTranslation('mundoReal')
  const titulo = a.etiqueta || a.iri
  const enlace = a.enlace || a.iri
  const hechos = a.hechos ?? []
  return (
    <article className="space-y-3 rounded-md border bg-background p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{t(`fuente.${a.fuente}`)}</Badge>
            <Badge variant="outline" className="font-normal">
              {relacionKey(a.relacion) === 'otra' ? a.relacion : t(`relacion.${relacionKey(a.relacion)}`)}
            </Badge>
          </div>
          <h3 className="text-base font-semibold break-words">{titulo}</h3>
          {a.descripcion && <p className="text-sm text-muted-foreground">{a.descripcion}</p>}
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={enlace} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> {t('verEn', { fuente: t(`fuente.${a.fuente}`) })}
            <span className="sr-only"> ({t('nuevaPestana')})</span>
          </a>
        </Button>
      </header>

      {a.error && (
        <Alert className="border-dashed text-muted-foreground">
          <Info />
          <AlertDescription>{t('error', { detalle: a.error })}</AlertDescription>
        </Alert>
      )}

      {(a.imagen || a.resumen) && (
        <div className="flex flex-col gap-4 sm:flex-row">
          {a.imagen && <Imagen src={a.imagen} alt={t('imagenAlt', { nombre: titulo })} />}
          {a.resumen && (
            <div className="min-w-0 flex-1">
              <Resumen texto={a.resumen} />
            </div>
          )}
        </div>
      )}

      {hasCoords(a) && (
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3.5" aria-hidden />
            {a.latitud.toFixed(4)}, {a.longitud.toFixed(4)}
          </p>
          <Suspense fallback={<Skeleton className="h-56 w-full" />}>
            <RealWorldMap lat={a.latitud} lng={a.longitud} etiqueta={titulo} ariaLabel={t('mapa', { nombre: titulo })} />
          </Suspense>
        </div>
      )}

      {hechos.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground">{t('hechos')}</h4>
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
            {hechos.map((h) => (
              <div key={h.propiedad} className="contents">
                <dt className="text-muted-foreground">{h.etiqueta}</dt>
                <dd className="min-w-0 break-words">{h.valores.join(', ')}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </article>
  )
}

export function RealWorldPanel({ cid, eid }: { cid: string; eid: string }) {
  const { t } = useTranslation('mundoReal')
  const q = useMundoReal(cid, eid)

  if (q.isPending) {
    return (
      <div className="space-y-2" role="status" aria-label={t('cargando')}>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} className="p-4" />
  if (q.data.anclas.length === 0) return null

  return (
    <section
      aria-labelledby={`mundo-real-${eid}`}
      className="space-y-3 rounded-lg border-2 border-dashed border-sky-500/40 bg-sky-500/5 p-4 dark:border-sky-400/30 dark:bg-sky-400/5"
    >
      <header className="space-y-1">
        <h2 id={`mundo-real-${eid}`} className="flex items-center gap-2 text-base font-semibold">
          <Globe className="size-4 text-sky-600 dark:text-sky-400" aria-hidden /> {t('titulo')}
        </h2>
        <p className="text-xs text-muted-foreground">{t('aviso')}</p>
      </header>
      <div className="space-y-3">
        {q.data.anclas.map((a) => (
          <Ancla key={`${a.relacion}-${a.iri}`} a={a} />
        ))}
      </div>
    </section>
  )
}
