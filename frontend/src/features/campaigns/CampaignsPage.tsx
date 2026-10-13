import { BookOpen, Plus, Swords, Trash2, Upload, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useBorrarCampana, useCampanas, type CampanaResumen } from '@/api/hooks'
import { Preferences } from '@/components/common/Preferences'
import { SettingsButton } from '@/components/common/SettingsButton'
import { EmptyState, QueryState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/format'
import { ImportCampaignDialog } from './ImportCampaignDialog'
import { NewCampaignDialog } from './NewCampaignDialog'

/** Selector de campañas: listado con su sistema de juego y creación de campañas nuevas. */
export function CampaignsPage() {
  const { t, i18n } = useTranslation('campanas')
  const campanas = useCampanas()
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<CampanaResumen | null>(null)
  const borrar = useBorrarCampana()

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Swords className="size-6" />
          <div className="flex-1">
            <p className="font-heading text-lg font-semibold leading-tight">{t('common:app.nombre')}</p>
            <p className="text-xs text-muted-foreground">{t('common:app.lema')}</p>
          </div>
          <SettingsButton />
          <Preferences />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{t('titulo')}</h1>
            <p className="text-muted-foreground">{t('subtitulo')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload /> {t('importar.accion')}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> {t('nueva')}
            </Button>
          </div>
        </div>

        <QueryState
          query={campanas}
          isEmpty={(d) => d.length === 0}
          empty={
            <EmptyState
              icon={<BookOpen className="size-10" />}
              title={t('vacio.titulo')}
              description={t('vacio.descripcion')}
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus /> {t('nueva')}
                </Button>
              }
            />
          }
        >
          {(lista) => (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lista.map((c) => (
                <li key={c.id}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="text-xl">
                        <Link to={`/c/${encodeURIComponent(c.id)}`} className="hover:underline">
                          {c.nombre}
                        </Link>
                      </CardTitle>
                      <CardDescription>
                        <Badge variant="secondary">{c.sistema}</Badge>
                      </CardDescription>
                    </CardHeader>
                    {/* flex-1: el pie (Abrir/Borrar) queda siempre abajo, haya descripción o no */}
                    <CardContent className="flex-1 space-y-3">
                      {c.descripcion && <p className="line-clamp-4 text-sm text-muted-foreground">{c.descripcion}</p>}
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="size-3.5" />
                        {t('entidades', { count: c.numEntidades })}
                        {c.creada && <span>· {formatDate(c.creada, i18n.language)}</span>}
                      </p>
                    </CardContent>
                    <CardFooter className="justify-between gap-2">
                      <Button asChild size="sm">
                        <Link to={`/c/${encodeURIComponent(c.id)}`}>{t('common:acciones.abrir')}</Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('borrar.accion', { nombre: c.nombre })}
                        onClick={() => setDeleting(c)}
                      >
                        <Trash2 />
                      </Button>
                    </CardFooter>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      </main>

      <NewCampaignDialog open={creating} onOpenChange={setCreating} />
      <ImportCampaignDialog open={importing} onOpenChange={setImporting} />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('borrar.titulo', { nombre: deleting?.nombre })}</DialogTitle>
            <DialogDescription>{t('borrar.aviso')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {t('common:acciones.cancelar')}
            </Button>
            <Button
              variant="destructive"
              disabled={borrar.isPending}
              onClick={() =>
                deleting &&
                borrar.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.success(t('borrar.hecho'))
                    setDeleting(null)
                  },
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <Trash2 /> {t('common:acciones.borrar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
