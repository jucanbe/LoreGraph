/** Diálogo para subir una imagen y crear un mapa de campaña. */
import { ImagePlus, Loader2 } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useCrearMapa } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { Button } from '@/components/ui/button'
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

const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** URL de previsualización de un archivo local (o `null` si el entorno no lo permite). */
function urlPreview(archivo: File | null): string | null {
  return archivo && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(archivo) : null
}

export function NewMapDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation('mapas')
  const { t: tc } = useTranslation()
  const camp = useCampaign()
  const navigate = useNavigate()
  const crear = useCrearMapa(camp.cid)
  const ids = useId()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  // Libera la URL anterior al cambiar de archivo y al desmontar.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])
  const fijarArchivo = (f: File | null) => {
    setArchivo(f)
    setPreview(urlPreview(f))
  }

  const reset = () => {
    setNombre('')
    setDescripcion('')
    fijarArchivo(null)
    setError(null)
  }

  const cambiar = (o: boolean) => {
    if (!o) reset()
    onOpenChange(o)
  }

  const elegir = (f: File | undefined) => {
    if (!f) {
      fijarArchivo(null)
      return
    }
    if (!TIPOS_IMAGEN.includes(f.type)) {
      fijarArchivo(null)
      setError(t('nuevo.tipoInvalido'))
      return
    }
    setError(null)
    fijarArchivo(f)
    if (!nombre.trim()) setNombre(f.name.replace(/\.[^.]+$/, ''))
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!archivo || !nombre.trim()) {
      setError(t('nuevo.faltan'))
      return
    }
    crear.mutate(
      { archivo, nombre: nombre.trim(), descripcion: descripcion.trim() || undefined },
      {
        onSuccess: (mapa) => {
          toast.success(t('nuevo.creado', { nombre: mapa.entidad.etiqueta }))
          cambiar(false)
          void navigate(camp.path(`mapas/${encodeURIComponent(mapa.entidad.id)}`))
        },
        onError: (err) => setError(err.message),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t('nuevo.titulo')}</DialogTitle>
            <DialogDescription>{t('nuevo.desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-nombre`}>{t('nuevo.nombre')}</Label>
            <Input id={`${ids}-nombre`} value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-desc`}>{t('nuevo.descripcion')}</Label>
            <Textarea id={`${ids}-desc`} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-img`}>{t('nuevo.imagen')}</Label>
            <Input
              id={`${ids}-img`}
              type="file"
              accept={TIPOS_IMAGEN.join(',')}
              onChange={(e) => elegir(e.target.files?.[0])}
              aria-describedby={`${ids}-img-ayuda`}
            />
            <p id={`${ids}-img-ayuda`} className="text-xs text-muted-foreground">
              {t('nuevo.imagenAyuda')}
            </p>
          </div>
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-md border bg-muted/40">
            {preview ? (
              <img src={preview} alt={t('nuevo.preview')} className="size-full object-contain" />
            ) : (
              <ImagePlus className="size-8 text-muted-foreground" aria-hidden />
            )}
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => cambiar(false)}>
              {tc('acciones.cancelar')}
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending && <Loader2 className="animate-spin" />}
              {tc('acciones.crear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
