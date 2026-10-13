import { ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { mediaUrl } from '@/api/client'
import { useQuitarRetrato, useSubirRetrato, type Entidad } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const FORMATOS = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** Retrato de la entidad (primera imagen). Si es editable, admite subir (clic o arrastrar) y quitar. */
export function PortraitPanel({ entidad }: { entidad: Entidad }) {
  const { t } = useTranslation('entidad')
  const camp = useCampaign()
  const subir = useSubirRetrato(camp.cid, entidad.id)
  const quitar = useQuitarRetrato(camp.cid, entidad.id)
  const input = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const src = entidad.imagenes[0]
  const editable = entidad.editable
  const ocupado = subir.isPending || quitar.isPending

  const upload = (file: File | undefined) => {
    if (!file) return
    if (!FORMATOS.includes(file.type)) {
      setError(t('retrato.formatoNoValido'))
      return
    }
    setError(null)
    subir.mutate(file, {
      onSuccess: () => toast.success(t('retrato.subido')),
      onError: (err) => setError(`${t('retrato.errorSubir')}: ${err.message}`),
    })
  }

  const remove = () => {
    if (!src) return
    setError(null)
    quitar.mutate(src, {
      onSuccess: () => toast.success(t('retrato.quitado')),
      onError: (err) => setError(err.message),
    })
  }

  const dragProps = editable
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault()
          setArrastrando(true)
        },
        onDragLeave: () => setArrastrando(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          setArrastrando(false)
          upload(e.dataTransfer.files[0])
        },
      }
    : {}

  return (
    <div className="space-y-2">
      <figure
        {...dragProps}
        className={cn(
          'relative overflow-hidden rounded-lg border bg-muted/40 transition-colors',
          arrastrando && 'border-primary ring-2 ring-primary/40',
        )}
      >
        {src ? (
          <img
            src={mediaUrl(src)}
            alt={t('retrato.alt', { nombre: entidad.etiqueta })}
            className="aspect-[4/5] w-full object-cover"
            loading="lazy"
          />
        ) : editable ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={ocupado}
            className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ImageIcon className="size-10 opacity-60" />
            <span className="text-sm">{t('retrato.vacio')}</span>
            <span className="text-xs opacity-80">{t('retrato.pistaSubir')}</span>
          </button>
        ) : (
          <div className="flex aspect-[4/5] flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
            <ImageIcon className="size-10 opacity-60" />
            <p className="text-sm">{t('retrato.vacio')}</p>
          </div>
        )}
        {(arrastrando || subir.isPending) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/80 text-sm" role="status">
            {subir.isPending ? (
              <>
                <Loader2 className="size-6 animate-spin" /> {t('retrato.subiendo')}
              </>
            ) : (
              <>
                <Upload className="size-6" /> {t('retrato.soltar')}
              </>
            )}
          </div>
        )}
      </figure>
      {editable && (
        <>
          <input
            ref={input}
            type="file"
            accept={FORMATOS.join(',')}
            className="sr-only"
            aria-label={t('retrato.subir')}
            data-testid="portrait-input"
            onChange={(e) => {
              upload(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={ocupado} onClick={() => input.current?.click()}>
              <Upload /> {src ? t('retrato.cambiar') : t('retrato.subir')}
            </Button>
            {src && (
              <Button size="sm" variant="ghost" disabled={ocupado} onClick={remove}>
                <Trash2 /> {t('retrato.quitar')}
              </Button>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
