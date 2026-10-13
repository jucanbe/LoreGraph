import { Loader2, Upload } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useImportarCampana, type ResultadoImportacion } from '@/api/hooks'
import { Alert, AlertDescription } from '@/components/ui/alert'
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

/** Diálogo para importar una campaña desde un ZIP exportado por LoreGraph. */
export function ImportCampaignDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation('campanas')
  const importar = useImportarCampana()
  const navigate = useNavigate()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [id, setId] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setArchivo(null)
    setId('')
    setNombre('')
    setError(null)
    importar.reset()
  }

  const resultado = (r: ResultadoImportacion) => (
    <div className="space-y-1">
      <p>{t('importar.resultado', { tripletas: r.tripletas, imagenes: r.imagenes })}</p>
      {r.avisos.length > 0 && (
        <>
          <p className="font-medium">{t('importar.avisos')}</p>
          <ul className="list-disc pl-4">
            {r.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!archivo) return
    setError(null)
    importar.mutate(
      { archivo, id: id.trim() || undefined, nombre: nombre.trim() || undefined },
      {
        onSuccess: (r) => {
          const opciones = { description: resultado(r), duration: r.avisos.length > 0 ? 15_000 : undefined }
          if (r.avisos.length > 0) toast.warning(t('importar.hecho', { nombre: r.nombre }), opciones)
          else toast.success(t('importar.hecho', { nombre: r.nombre }), opciones)
          onOpenChange(false)
          reset()
          void navigate(`/c/${encodeURIComponent(r.id)}`)
        },
        onError: (err) => setError(err instanceof ApiError && err.status === 409 ? `${err.message} — ${t('importar.conflicto')}` : err.message),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('importar.titulo')}</DialogTitle>
            <DialogDescription>{t('importar.descripcion')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="importar-archivo">{t('importar.archivo')}</Label>
            <Input
              id="importar-archivo"
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="importar-id">{t('importar.id')}</Label>
              <Input
                id="importar-id"
                className="font-mono"
                value={id}
                onChange={(e) => setId(e.target.value)}
                aria-invalid={importar.error instanceof ApiError && importar.error.status === 409 ? true : undefined}
              />
              <p className="text-xs text-muted-foreground">{t('importar.idAyuda')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="importar-nombre">{t('importar.nombre')}</Label>
              <Input id="importar-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
          </div>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onOpenChange(false)
              }}
            >
              {t('common:acciones.cancelar')}
            </Button>
            <Button type="submit" disabled={!archivo || importar.isPending}>
              {importar.isPending ? <Loader2 className="animate-spin" /> : <Upload />} {t('importar.enviar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
