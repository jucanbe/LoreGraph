/** Detalle de una propuesta: cabecera, errores de validación, acciones y diff. */
import { AlertTriangle, ArrowLeft, Check, MessageSquareText, Pencil, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { usePropuesta, type PropuestaDetalle } from '@/api/hooks'
import { EntityLink } from '@/components/common/EntityLink'
import { ErrorState, LoadingState } from '@/components/common/States'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useCampaign } from '@/app/campaign-context'
import { EditApproveDialog } from './EditApproveDialog'
import { AgentLabel, Conteos, Destino, EstadoBadge, Fecha, ListaErrores } from './parts'
import { ReviewDialog, type AccionRevision } from './ReviewDialog'
import { TripleDiff } from './TripleDiff'

export function ProposalDetail({
  pid,
  backTo,
  focusToken,
  verIris,
  onVerIrisChange,
  onRevisada,
}: {
  pid: string
  /** Enlace de vuelta a la lista (pantallas estrechas). */
  backTo: string
  /** Cambia cuando hay que llevar el foco al título (selección o tras revisar). */
  focusToken: number
  verIris: boolean
  onVerIrisChange: (v: boolean) => void
  /** Tras aprobar o rechazar con éxito. */
  onRevisada: (pid: string) => void
}) {
  const { t } = useTranslation('propuestas')
  const camp = useCampaign()
  const query = usePropuesta(camp.cid, pid)

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 lg:hidden">
        <Link to={backTo}>
          <ArrowLeft /> {t('detalle.volver')}
        </Link>
      </Button>
      {query.isPending ? (
        <LoadingState rows={5} label={t('detalle.cargando')} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Contenido
          propuesta={query.data}
          focusToken={focusToken}
          verIris={verIris}
          onVerIrisChange={onVerIrisChange}
          onRevisada={onRevisada}
        />
      )}
    </div>
  )
}

function Contenido({
  propuesta: p,
  focusToken,
  verIris,
  onVerIrisChange,
  onRevisada,
}: {
  propuesta: PropuestaDetalle
  focusToken: number
  verIris: boolean
  onVerIrisChange: (v: boolean) => void
  onRevisada: (pid: string) => void
}) {
  const { t } = useTranslation('propuestas')
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const [dialogo, setDialogo] = useState<'revisar' | 'editar' | null>(null)
  // Se conserva al cerrar para que el título no cambie durante la animación de salida.
  const [accion, setAccion] = useState<AccionRevision>('aprobar')
  const abrirRevision = (a: AccionRevision) => {
    setAccion(a)
    setDialogo('revisar')
  }
  const switchId = useId()
  const tituloId = useId()

  // Gestión del foco: al seleccionar otra propuesta o tras revisar, el foco va al título.
  useEffect(() => {
    if (focusToken > 0) tituloRef.current?.focus()
  }, [focusToken, p.id])

  const pendiente = p.estado === 'pendiente'
  const errores = p.errores ?? []
  const violaciones = errores.filter((e) => e.severidad === 'violacion')
  const titulo = p.resumen?.trim() || t('detalle.tituloSinResumen', { id: p.id })

  return (
    <article aria-labelledby={tituloId} className="space-y-5" data-propuesta={p.id}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <EstadoBadge estado={p.estado} />
          <AgentLabel agente={p.agente} tipoAgente={p.tipoAgente} />
          <Fecha iso={p.creada} />
        </div>
        <h2
          id={tituloId}
          ref={tituloRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight break-words focus-visible:outline-none"
        >
          {titulo}
        </h2>
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('detalle.peticion')}</p>
          <blockquote className="border-l-2 pl-3 text-sm break-words whitespace-pre-wrap italic">{p.peticion}</blockquote>
        </div>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t('detalle.destino')}</dt>
          <dd className="min-w-0">
            <Destino destino={p.destino} enlazar />
          </dd>
          <dt className="text-muted-foreground">{t('detalle.cambios')}</dt>
          <dd>
            <Conteos anadidas={p.numAnadidas} eliminadas={p.numEliminadas} />
          </dd>
          {(p.entidades?.length ?? 0) > 0 && (
            <>
              <dt className="text-muted-foreground">{t('detalle.entidades')}</dt>
              <dd className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                {p.entidades?.map((e) => (
                  <EntityLink key={e.iri} id={e.id} etiqueta={e.etiqueta} tipo={e.tipo} className="text-sm" />
                ))}
              </dd>
            </>
          )}
          {!pendiente && p.revisada && (
            <>
              <dt className="text-muted-foreground">{t('detalle.revisada')}</dt>
              <dd>
                <Fecha iso={p.revisada} />
              </dd>
            </>
          )}
        </dl>
        {!pendiente && p.notaRevision && (
          <div className="flex gap-2 rounded-md border bg-muted/40 p-3 text-sm">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t('detalle.notaRevision')}</p>
              <p className="break-words whitespace-pre-wrap">{p.notaRevision}</p>
            </div>
          </div>
        )}
      </header>

      {pendiente && errores.length > 0 && (
        <Alert variant={violaciones.length > 0 ? 'destructive' : 'default'}>
          <AlertTriangle />
          <AlertTitle>{t('errores.tituloPendiente', { count: errores.length })}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{t('errores.ayudaPendiente')}</p>
            <ListaErrores errores={errores} />
          </AlertDescription>
        </Alert>
      )}

      {pendiente && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('acciones.grupo')}>
          <Button onClick={() => abrirRevision('aprobar')} disabled={violaciones.length > 0}>
            <Check /> {t('acciones.aprobar')}
          </Button>
          <Button variant="outline" onClick={() => setDialogo('editar')}>
            <Pencil /> {t('acciones.editarAprobar')}
          </Button>
          <Button variant="destructive" onClick={() => abrirRevision('rechazar')}>
            <X /> {t('acciones.rechazar')}
          </Button>
          {violaciones.length > 0 && (
            <p className="basis-full text-xs text-muted-foreground">{t('acciones.aprobarBloqueado')}</p>
          )}
        </div>
      )}

      <Separator />

      <section className="space-y-3" aria-label={t('diff.titulo')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{t('diff.titulo')}</h3>
          <div className="flex items-center gap-2">
            <Switch id={switchId} checked={verIris} onCheckedChange={onVerIrisChange} />
            <Label htmlFor={switchId} className="text-sm font-normal">
              {t('diff.verIris')}
            </Label>
          </div>
        </div>
        <TripleDiff anadidas={p.anadidas} eliminadas={p.eliminadas} verIris={verIris} />
      </section>

      {pendiente && (
        <>
          <ReviewDialog
            pid={p.id}
            accion={accion}
            open={dialogo === 'revisar'}
            onOpenChange={(o) => !o && setDialogo(null)}
            onDone={() => onRevisada(p.id)}
          />
          <EditApproveDialog
            propuesta={p}
            open={dialogo === 'editar'}
            onOpenChange={(o) => !o && setDialogo(null)}
            onDone={() => onRevisada(p.id)}
          />
        </>
      )}
    </article>
  )
}
