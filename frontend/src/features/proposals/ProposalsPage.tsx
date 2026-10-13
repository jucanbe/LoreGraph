/**
 * Bandeja de propuestas: los agentes (MCP o el asistente local) solo PROPONEN
 * cambios; aquí una persona los revisa, los aprueba (también en lote o tras
 * editarlos) o los rechaza.
 *
 * Maestro/detalle: en pantallas anchas, lista y detalle a la vez; en
 * estrechas, el detalle sustituye a la lista. La propuesta abierta va en la
 * URL (`/propuestas/:pid`) y el filtro en `?estado=`.
 */
import { CheckCheck, Inbox, Loader2, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { Schemas } from '@/api/client'
import { useAprobarLote, usePropuestas } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { ListaErrores } from './parts'
import { ProposalDetail } from './ProposalDetail'
import { ProposalList } from './ProposalList'
import { FILTROS, parseFiltro, siguientePendiente, truncar, type FiltroEstado } from './utils'

interface ResumenLote {
  resultado: Schemas['ResultadoLote']
  /** Petición de cada propuesta enviada, para nombrarlas en el resumen. */
  nombres: Record<string, string>
}

export function ProposalsPage() {
  const { t } = useTranslation('propuestas')
  const camp = useCampaign()
  const { pid } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useSearchParams()
  const filtro = parseFiltro(search.get('estado'))

  const lista = usePropuestas(camp.cid, filtro === 'todas' ? undefined : filtro)
  const pendientes = usePropuestas(camp.cid, 'pendiente')
  const numPendientes = pendientes.data?.length

  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set())
  const [lote, setLote] = useState<ResumenLote | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const [verIris, setVerIris] = useState(false)
  const listaTituloRef = useRef<HTMLHeadingElement>(null)
  const todasId = useId()
  const aprobarLote = useAprobarLote(camp.cid)

  const qs = search.toString() ? `?${search.toString()}` : ''
  const hrefDe = (id?: string) => camp.path(id ? `propuestas/${encodeURIComponent(id)}` : 'propuestas') + qs

  const cambiarFiltro = (v: string) => {
    if (!v) return
    const f = parseFiltro(v)
    const next = new URLSearchParams(search)
    if (f === 'pendiente') next.delete('estado')
    else next.set('estado', f)
    setSearch(next, { replace: true })
    setMarcadas(new Set())
  }

  /** Tras revisar: a la siguiente pendiente, o a la lista si no quedan. */
  const trasRevisar = (revisada: string) => {
    const ids = (pendientes.data ?? []).map((p) => p.id)
    const siguiente = siguientePendiente(ids, revisada)
    setMarcadas((prev) => {
      const n = new Set(prev)
      n.delete(revisada)
      return n
    })
    if (siguiente) {
      navigate(hrefDe(siguiente))
      setFocusToken((n) => n + 1)
    } else {
      navigate(hrefDe())
      requestAnimationFrame(() => listaTituloRef.current?.focus())
    }
  }

  const marcar = (id: string, v: boolean) =>
    setMarcadas((prev) => {
      const n = new Set(prev)
      if (v) n.add(id)
      else n.delete(id)
      return n
    })

  const pendientesVisibles = (lista.data ?? []).filter((p) => p.estado === 'pendiente')
  const marcadasVisibles = pendientesVisibles.filter((p) => marcadas.has(p.id))
  const todasMarcadas = pendientesVisibles.length > 0 && marcadasVisibles.length === pendientesVisibles.length

  const aprobarMarcadas = () => {
    const ids = marcadasVisibles.map((p) => p.id)
    if (ids.length === 0) return
    const nombres = Object.fromEntries(marcadasVisibles.map((p) => [p.id, truncar(p.peticion, 80)]))
    aprobarLote.mutate(
      { ids },
      {
        onSuccess: (resultado) => {
          setLote({ resultado, nombres })
          setMarcadas((prev) => new Set([...prev].filter((id) => resultado.fallidas[id])))
        },
        onError: (error) =>
          setLote({
            resultado: {
              aprobadas: [],
              fallidas: Object.fromEntries(ids.map((id) => [id, [{ foco: null, focoId: null, campo: null, valor: null, mensaje: error.message, severidad: 'violacion' as const }]])),
            },
            nombres,
          }),
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titulo')}
        subtitle={t('subtitulo')}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
        actions={
          numPendientes !== undefined && (
            <Badge variant={numPendientes > 0 ? 'default' : 'secondary'} className="tabular-nums">
              {t('pendientesTotal', { count: numPendientes })}
            </Badge>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ------------------------------------------------------------ lista */}
        <section aria-labelledby="propuestas-lista" className={cn('min-w-0 space-y-3', pid && 'hidden lg:block')}>
          <h2 id="propuestas-lista" ref={listaTituloRef} tabIndex={-1} className="sr-only">
            {t('lista.titulo')}
          </h2>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={filtro}
            onValueChange={cambiarFiltro}
            aria-label={t('filtro.etiqueta')}
            className="flex-wrap"
          >
            {FILTROS.map((f) => (
              <ToggleGroupItem key={f} value={f} className="gap-1.5 px-2.5">
                {t(`filtro.${f}`)}
                {f === 'pendiente' && !!numPendientes && (
                  <span className="rounded-full bg-primary px-1.5 text-[0.7rem] text-primary-foreground tabular-nums">
                    {numPendientes}
                  </span>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {pendientesVisibles.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id={todasId}
                  checked={todasMarcadas ? true : marcadasVisibles.length > 0 ? 'indeterminate' : false}
                  onCheckedChange={(v) => setMarcadas(v === true ? new Set(pendientesVisibles.map((p) => p.id)) : new Set())}
                />
                <Label htmlFor={todasId} className="text-sm font-normal">
                  {t('lote.marcarTodas')}
                </Label>
              </div>
              <Button
                size="sm"
                className="ml-auto"
                onClick={aprobarMarcadas}
                disabled={marcadasVisibles.length === 0 || aprobarLote.isPending}
              >
                {aprobarLote.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
                {t('lote.aprobar', { count: marcadasVisibles.length })}
              </Button>
            </div>
          )}

          <div role="status" aria-live="polite" aria-atomic="false">
            {lote && <ResultadoLoteView lote={lote} onCerrar={() => setLote(null)} />}
          </div>

          {lista.isPending ? (
            <LoadingState rows={4} />
          ) : lista.isError ? (
            <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
          ) : lista.data.length === 0 ? (
            <ListaVacia filtro={filtro} />
          ) : (
            <ProposalList
              propuestas={lista.data}
              filtro={filtro}
              seleccionada={pid}
              hrefDe={hrefDe}
              onAbrir={() => setFocusToken((n) => n + 1)}
              marcadas={marcadas}
              onMarcar={marcar}
            />
          )}
        </section>

        {/* ---------------------------------------------------------- detalle */}
        <section
          aria-label={t('detalle.region')}
          className={cn('min-w-0 lg:sticky lg:top-20 lg:self-start', !pid && 'hidden lg:block')}
        >
          {pid ? (
            <ProposalDetail
              key={pid}
              pid={pid}
              backTo={hrefDe()}
              focusToken={focusToken}
              verIris={verIris}
              onVerIrisChange={setVerIris}
              onRevisada={trasRevisar}
            />
          ) : (
            <EmptyState
              className="min-h-64"
              icon={<Inbox className="size-8" />}
              title={t('detalle.ninguna')}
              description={t('detalle.ningunaAyuda')}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function ListaVacia({ filtro }: { filtro: FiltroEstado }) {
  const { t } = useTranslation('propuestas')
  const camp = useCampaign()
  if (filtro !== 'pendiente') return <EmptyState title={t(`vacio.${filtro}`)} />
  return (
    <EmptyState
      title={t('vacio.pendiente')}
      description={
        <Trans
          t={t}
          i18nKey="vacio.ayuda"
          components={{
            code: <code className="rounded bg-muted px-1 font-mono text-xs" />,
            enlace: <Link to={camp.path('asistente')} className="font-medium text-primary underline-offset-4 hover:underline" />,
          }}
        />
      }
    />
  )
}

function ResultadoLoteView({ lote, onCerrar }: { lote: ResumenLote; onCerrar: () => void }) {
  const { t } = useTranslation('propuestas')
  const { aprobadas, fallidas } = lote.resultado
  const ids = Object.keys(fallidas)
  const nombre = (id: string) => lote.nombres[id] ?? id
  return (
    <Alert variant={ids.length > 0 ? 'destructive' : 'default'} className="relative pr-10">
      {ids.length > 0 ? <X /> : <CheckCheck />}
      <AlertTitle>{t('lote.resultado', { aprobadas: aprobadas.length, fallidas: ids.length })}</AlertTitle>
      <AlertDescription className="space-y-2">
        {aprobadas.length > 0 && (
          <div>
            <p className="font-medium text-foreground">{t('lote.aprobadas', { count: aprobadas.length })}</p>
            <ul className="list-disc pl-5">
              {aprobadas.map((id) => (
                <li key={id}>{nombre(id)}</li>
              ))}
            </ul>
          </div>
        )}
        {ids.length > 0 && (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{t('lote.fallidas', { count: ids.length })}</p>
            <ul className="space-y-2">
              {ids.map((id) => (
                <li key={id} data-fallida={id}>
                  <p className="text-sm text-foreground">{nombre(id)}</p>
                  <ListaErrores errores={fallidas[id] ?? []} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1.5 right-1.5"
        onClick={onCerrar}
        aria-label={t('lote.cerrarResultado')}
      >
        <X />
      </Button>
    </Alert>
  )
}
