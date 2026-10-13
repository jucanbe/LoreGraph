/**
 * Un cambio del historial (PROV-O): quién, cuándo, con qué petición, qué
 * tripletas añadió o eliminó y el botón para deshacerlo. Lo usan el historial
 * de la campaña y la pestaña «Procedencia» de las fichas.
 */
import { Bot, Loader2, Minus, Plus, Undo2, User } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useDeshacer, type CambioInfo, type TripletaLegible } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink } from '@/components/common/EntityLink'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Id corto de un cambio para mostrarlo (los ids son hashes largos). */
function idCorto(id: string): string {
  return id.length > 10 ? id.slice(0, 10) : id
}

/** Referencia a otro cambio: enlace a su ancla si está en la misma página. */
function RefCambio({ id, anclas }: { id: string; anclas: boolean }) {
  const texto = <code className="rounded bg-muted px-1 font-mono text-xs">{idCorto(id)}</code>
  return anclas ? (
    <a href={`#cambio-${id}`} className="underline-offset-4 hover:underline">
      {texto}
    </a>
  ) : (
    texto
  )
}

/**
 * Elemento de una línea temporal de cambios (`<li>`).
 * `anclas`: los ids de otros cambios enlazan a `#cambio-<id>` en la misma página.
 */
export function ChangeEntry({ cambio: c, anclas = false }: { cambio: CambioInfo; anclas?: boolean }) {
  const { t, i18n } = useTranslation('historial')
  const camp = useCampaign()
  const deshecho = !!c.deshechoPor
  return (
    <li id={`cambio-${c.id}`} className="relative scroll-mt-20">
      <span className="absolute top-1 -left-[31px] flex size-5 items-center justify-center rounded-full border bg-background">
        {c.agente.tipo === 'agente' ? <Bot className="size-3" /> : <User className="size-3" />}
      </span>
      <div className={cn('flex flex-wrap items-start justify-between gap-2', deshecho && 'opacity-70')}>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{c.agente.nombre}</span>
            <Badge variant={c.agente.tipo === 'agente' ? 'secondary' : 'outline'}>
              {c.agente.tipo === 'agente' ? t('agente') : t('humano')}
            </Badge>
            <time className="text-muted-foreground" dateTime={c.fecha}>
              {formatDate(c.fecha, i18n.language, true)}
            </time>
            {c.propuesta && (
              <Link className="text-xs underline" to={camp.path(`propuestas/${c.propuesta}`)}>
                {t('propuesta')}
              </Link>
            )}
            {deshecho && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                {t('deshecho')}
              </Badge>
            )}
          </div>
          {c.deshace && (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Undo2 className="size-3" /> {t('deshace')}
              <RefCambio id={c.deshace} anclas={anclas} />
            </p>
          )}
          {c.deshechoPor && (
            <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {t('deshechoPor')}
              <RefCambio id={c.deshechoPor} anclas={anclas} />
            </p>
          )}
          {c.peticion && <p className="text-sm text-muted-foreground italic">«{c.peticion}»</p>}
        </div>
        <UndoChangeButton cambio={c} />
      </div>
      <ChangeTriples cambio={c} />
    </li>
  )
}

/** Lista desplegable de las tripletas añadidas y eliminadas por un cambio. */
export function ChangeTriples({ cambio: c }: { cambio: CambioInfo }) {
  const { t } = useTranslation('historial')
  if (c.anadidas.length === 0 && c.eliminadas.length === 0) return null
  return (
    <Collapsible>
      <CollapsibleTrigger className="mt-1 text-xs text-primary underline-offset-4 hover:underline">
        {t('detalle', { a: c.anadidas.length, e: c.eliminadas.length })}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1">
        {c.anadidas.map((tr, i) => (
          <TripleLine key={`a${i}`} tripleta={tr} kind="add" />
        ))}
        {c.eliminadas.map((tr, i) => (
          <TripleLine key={`e${i}`} tripleta={tr} kind="remove" />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Botón «Deshacer» con confirmación. Si el cambio ya se deshizo, queda desactivado. */
export function UndoChangeButton({ cambio: c }: { cambio: CambioInfo }) {
  const { t } = useTranslation('historial')
  const camp = useCampaign()
  const deshacer = useDeshacer(camp.cid)
  const [abierto, setAbierto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (c.deshechoPor) {
    return (
      <Button variant="ghost" size="sm" disabled aria-label={`${t('deshacer.accion')} (${t('deshecho')})`}>
        <Undo2 /> {t('deshecho')}
      </Button>
    )
  }

  const confirmar = () => {
    setError(null)
    deshacer.mutate(c.id, {
      onSuccess: () => {
        toast.success(t('deshacer.hecho'))
        setAbierto(false)
      },
      onError: (err) => {
        // 409: un cambio posterior tocó los mismos datos o ya se deshizo.
        setError(err.message)
        if (!(err instanceof ApiError && err.status === 409)) toast.error(err.message)
      },
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null)
          setAbierto(true)
        }}
      >
        <Undo2 /> {t('deshacer.accion')}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deshacer.titulo')}</DialogTitle>
            <DialogDescription>
              {t('deshacer.aviso', { a: c.anadidas.length, e: c.eliminadas.length })}
            </DialogDescription>
          </DialogHeader>
          {c.peticion && <p className="text-sm text-muted-foreground italic">«{c.peticion}»</p>}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('deshacer.conflicto')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              {t('common:acciones.cancelar')}
            </Button>
            <Button variant="destructive" disabled={deshacer.isPending} onClick={confirmar}>
              {deshacer.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />} {t('deshacer.confirmar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Una tripleta en lenguaje legible: sujeto · predicado → objeto. */
export function TripleLine({ tripleta, kind }: { tripleta: TripletaLegible; kind?: 'add' | 'remove' }) {
  const { sujeto, predicado, objeto } = tripleta
  return (
    <div
      className={
        kind === 'add'
          ? 'flex flex-wrap items-center gap-1.5 rounded bg-emerald-500/10 px-2 py-1 text-sm'
          : kind === 'remove'
            ? 'flex flex-wrap items-center gap-1.5 rounded bg-red-500/10 px-2 py-1 text-sm line-through decoration-red-500/60'
            : 'flex flex-wrap items-center gap-1.5 text-sm'
      }
    >
      {kind === 'add' && <Plus className="size-3 text-emerald-600" />}
      {kind === 'remove' && <Minus className="size-3 text-red-600" />}
      <EntityLink id={sujeto.id} etiqueta={sujeto.etiqueta} showIcon={false} />
      <span className="text-muted-foreground">· {predicado.etiqueta} →</span>
      {objeto.tipo === 'literal' ? (
        <span className="font-medium">{objeto.etiqueta}</span>
      ) : (
        <EntityLink id={objeto.id} etiqueta={objeto.etiqueta} showIcon={false} />
      )}
    </div>
  )
}
