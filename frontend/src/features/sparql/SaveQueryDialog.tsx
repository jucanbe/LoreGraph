import { Loader2, Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useGuardarConsulta } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Diálogo «Guardar consulta» (título y descripción). */
export function SaveQueryDialog({ cid, consulta, disabled }: { cid: string; consulta: string; disabled?: boolean }) {
  const { t } = useTranslation('sparql')
  const guardar = useGuardarConsulta(cid)
  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return
    guardar.mutate(
      { titulo: titulo.trim(), descripcion: descripcion.trim(), consulta },
      {
        onSuccess: () => {
          toast.success(t('guardar.hecho'))
          setOpen(false)
          setTitulo('')
          setDescripcion('')
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) guardar.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Save /> {t('guardar.boton')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('guardar.titulo')}</DialogTitle>
            <DialogDescription>{t('guardar.desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sparql-titulo">{t('guardar.campoTitulo')}</Label>
            <Input
              id="sparql-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sparql-descripcion">{t('guardar.campoDescripcion')}</Label>
            <Textarea
              id="sparql-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={3}
            />
          </div>
          {guardar.isError && (
            <p className="text-sm text-destructive" role="alert">
              {guardar.error.message}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t('common:acciones.cancelar')}
            </Button>
            <Button type="submit" disabled={!titulo.trim() || guardar.isPending}>
              {guardar.isPending ? <Loader2 className="animate-spin" /> : <Save />} {t('common:acciones.guardar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
