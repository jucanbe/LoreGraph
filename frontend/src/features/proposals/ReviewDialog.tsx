/** Diálogo para aprobar (nota opcional) o rechazar (motivo) una propuesta. */
import { Check, Loader2, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useRevisarPropuesta } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ListaErrores } from './parts'

export type AccionRevision = 'aprobar' | 'rechazar'

export function ReviewDialog({
  pid,
  accion,
  open,
  onOpenChange,
  onDone,
}: {
  pid: string
  accion: AccionRevision
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Tras revisar con éxito (el diálogo ya se ha cerrado). */
  onDone: () => void
}) {
  const { t } = useTranslation('propuestas')
  const camp = useCampaign()
  const revisar = useRevisarPropuesta(camp.cid)
  const [nota, setNota] = useState('')
  const notaId = useId()

  const cambiarApertura = (o: boolean) => {
    if (revisar.isPending) return
    if (!o) {
      revisar.reset()
      setNota('')
    }
    onOpenChange(o)
  }

  const enviar = () => {
    revisar.mutate(
      { pid, accion, body: { nota: nota.trim() || null } },
      {
        onSuccess: () => {
          toast.success(accion === 'aprobar' ? t('avisos.aprobada') : t('avisos.rechazada'))
          setNota('')
          revisar.reset()
          onOpenChange(false)
          onDone()
        },
      },
    )
  }

  const error = revisar.error
  const aprobar = accion === 'aprobar'
  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{aprobar ? t('revision.tituloAprobar') : t('revision.tituloRechazar')}</DialogTitle>
          <DialogDescription>{aprobar ? t('revision.ayudaAprobar') : t('revision.ayudaRechazar')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            enviar()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={notaId}>{aprobar ? t('revision.nota') : t('revision.motivo')}</Label>
            <Textarea
              id={notaId}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={aprobar ? t('revision.notaPlaceholder') : t('revision.motivoPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  enviar()
                }
              }}
            />
          </div>
          {error && <ErrorRevision error={error} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cambiarApertura(false)} disabled={revisar.isPending}>
              {t('acciones.cancelar', { ns: 'common' })}
            </Button>
            <Button type="submit" variant={aprobar ? 'default' : 'destructive'} disabled={revisar.isPending}>
              {revisar.isPending ? <Loader2 className="animate-spin" /> : aprobar ? <Check /> : <X />}
              {aprobar ? t('acciones.aprobar') : t('acciones.rechazar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Error de una revisión: mensaje y, si los hay, los errores de validación (422). */
export function ErrorRevision({ error }: { error: unknown }) {
  const { t } = useTranslation('propuestas')
  const errores = error instanceof ApiError ? error.errores : []
  const mensaje = error instanceof Error ? error.message : t('errores.desconocido', { ns: 'common' })
  return (
    <Alert variant="destructive">
      <AlertTitle>{error instanceof ApiError && error.status === 422 ? t('errores.tituloValidacion') : t('errores.tituloRevision')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{mensaje}</p>
        {errores.length > 0 && <ListaErrores errores={errores} />}
      </AlertDescription>
    </Alert>
  )
}
