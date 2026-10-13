import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useCrearCampana, useModulos } from '@/api/hooks'
import { LoadingState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Diálogo para crear una campaña eligiendo sus módulos de juego. */
export function NewCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation('campanas')
  const modulos = useModulos()
  const crear = useCrearCampana()
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [elegidos, setElegidos] = useState<string[]>([])

  const seleccionables = (modulos.data ?? []).filter((m) => m.categoria !== 'nucleo')

  const toggle = (id: string, on: boolean) =>
    setElegidos((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    crear.mutate(
      { nombre: nombre.trim(), descripcion: descripcion.trim(), modulos: elegidos },
      {
        onSuccess: (c) => {
          toast.success(t('crear.hecho', { nombre: c.nombre }))
          onOpenChange(false)
          setNombre('')
          setDescripcion('')
          setElegidos([])
          void navigate(`/c/${encodeURIComponent(c.id)}`)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('crear.titulo')}</DialogTitle>
            <DialogDescription>{t('crear.descripcion')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="camp-nombre">{t('crear.nombre')}</Label>
            <Input id="camp-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="camp-desc">{t('crear.resumen')}</Label>
            <Textarea id="camp-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('crear.modulos')}</legend>
            {modulos.isPending ? (
              <LoadingState rows={2} />
            ) : seleccionables.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('crear.sinModulos')}</p>
            ) : (
              <ul className="space-y-2">
                {seleccionables.map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50">
                      <Checkbox
                        checked={elegidos.includes(m.id)}
                        onCheckedChange={(v) => toggle(m.id, v === true)}
                        className="mt-0.5"
                      />
                      <span className="space-y-1">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {m.nombre}
                          <Badge variant="outline">v{m.version}</Badge>
                          {m.categoria === 'extension' && <Badge variant="secondary">{t('crear.extension')}</Badge>}
                        </span>
                        {m.descripcion && <span className="block text-xs text-muted-foreground">{m.descripcion}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t('crear.nucleo')}</p>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:acciones.cancelar')}
            </Button>
            <Button type="submit" disabled={!nombre.trim() || crear.isPending}>
              {t('common:acciones.crear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
