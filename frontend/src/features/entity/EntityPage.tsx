import { Globe2, History, Lock, Pencil, Trash2 } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useBorrarEntidad, useEntidad, useHistoriaTemporal, usePersonajesConConocimiento, type Entidad } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { TypeBadge } from '@/components/common/EntityLink'
import { PageHeader } from '@/components/common/PageHeader'
import { ErrorState, LoadingState } from '@/components/common/States'
import { TypeIcon } from '@/components/common/TypeIcon'
import { RealWorldPanel } from '@/components/realworld/RealWorldPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { relativeTime } from '@/lib/format'
import { EntityCoherenceAlert, EntityMaps, TemporalHistory } from './EntityExtras'
import { KnowledgeTab } from './KnowledgeTab'
import { PortraitPanel } from './PortraitPanel'
import { ProvenanceTab } from './ProvenanceTab'
import { RelationsSection } from './RelationsSection'
import { FieldValues } from './ValueView'

// Cytoscape solo se descarga cuando se muestra el mini-grafo.
const MiniGraph = lazy(() => import('@/components/graph/MiniGraph').then((m) => ({ default: m.MiniGraph })))

/** Ficha de entidad: datos agrupados, relaciones, procedencia, conocimiento y mundo real. */
export function EntityPage() {
  const { eid: raw = '' } = useParams()
  const eid = decodeURIComponent(raw)
  const camp = useCampaign()
  const entidad = useEntidad(camp.cid, eid)
  if (entidad.isPending) return <LoadingState rows={6} />
  if (entidad.isError) return <ErrorState error={entidad.error} onRetry={() => void entidad.refetch()} />
  return <EntitySheet entidad={entidad.data} />
}

function EntitySheet({ entidad: e }: { entidad: Entidad }) {
  const { t, i18n } = useTranslation('entidad')
  const camp = useCampaign()
  const navigate = useNavigate()
  const borrar = useBorrarEntidad(camp.cid)
  const [confirm, setConfirm] = useState(false)
  const conConocimiento = usePersonajesConConocimiento(camp.cid)
  const tieneConocimiento = !!conConocimiento.data?.some((x) => x.id === e.id)
  const tipoInfo = e.tipo ? camp.tipoPorClave.get(e.tipo.clave) : undefined
  const variantes = e.clases.slice(1)
  const historia = useHistoriaTemporal(camp.cid, e.id)
  const hayHistoria = (historia.data?.length ?? 0) > 0

  const onDelete = () =>
    borrar.mutate(e.id, {
      onSuccess: () => {
        toast.success(t('borrar.hecho', { nombre: e.etiqueta }))
        void navigate(e.tipo ? camp.path(`explorar/${encodeURIComponent(e.tipo.clave)}`) : camp.path('explorar'))
      },
      onError: (err) => toast.error(err.message),
    })

  return (
    <div className="space-y-6">
      <PageHeader
        migas={[
          { label: camp.info.campana.nombre, to: camp.path() },
          ...(e.tipo
            ? [{ label: tipoInfo?.clase.etiqueta ?? e.tipo.etiqueta, to: camp.path(`explorar/${encodeURIComponent(e.tipo.clave)}`) }]
            : [{ label: t('common:nav.explorar'), to: camp.path('explorar') }]),
          { label: e.etiqueta },
        ]}
        title={
          <span className="flex items-center gap-2">
            <TypeIcon name={tipoInfo?.estilo.icono} color={tipoInfo?.estilo.color} className="size-6" />
            {e.etiqueta}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <TypeBadge tipo={e.tipo} />
            {variantes.map((v) => (
              <Badge key={v.clave} variant="secondary">
                {v.etiqueta}
              </Badge>
            ))}
            {!e.editable && (
              <Badge variant="outline" className="gap-1">
                <Lock className="size-3" /> {t('common:comun.deModulo', { modulo: e.origen.replace('modulo:', '') })}
              </Badge>
            )}
            {e.modificada && (
              <span className="text-xs">{t('modificada', { tiempo: relativeTime(e.modificada, i18n.language) })}</span>
            )}
          </span>
        }
        actions={
          e.editable && (
            <>
              <Button asChild>
                <Link to={`${camp.entityPath(e.id)}/editar`}>
                  <Pencil /> {t('common:acciones.editar')}
                </Link>
              </Button>
              <Button variant="outline" size="icon" aria-label={t('common:acciones.borrar')} onClick={() => setConfirm(true)}>
                <Trash2 />
              </Button>
            </>
          )
        }
      />

      <EntityCoherenceAlert entidad={e} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Tabs defaultValue="ficha" className="min-w-0">
          <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-1">
            <TabsList className="w-max">
              <TabsTrigger value="ficha">{t('pestanas.ficha')}</TabsTrigger>
              <TabsTrigger value="relaciones">
                {t('pestanas.relaciones')} <span className="text-xs tabular-nums opacity-60">{e.relaciones.length}</span>
              </TabsTrigger>
              {tieneConocimiento && <TabsTrigger value="conocimiento">{t('pestanas.conocimiento')}</TabsTrigger>}
              {e.anclasReales.length > 0 && (
                <TabsTrigger value="mundo-real" className="gap-1">
                  <Globe2 className="size-3.5" /> {t('pestanas.mundoReal')}
                </TabsTrigger>
              )}
              {hayHistoria && (
                <TabsTrigger value="historia" className="gap-1">
                  <History className="size-3.5" /> {t('pestanas.historia')}
                </TabsTrigger>
              )}
              <TabsTrigger value="procedencia">{t('pestanas.procedencia')}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="ficha" className="mt-4 space-y-4">
            {e.descripcion && <p className="text-base leading-relaxed whitespace-pre-wrap">{e.descripcion}</p>}
            {e.grupos.map((g) => {
              const campos = g.campos.filter((c) => c.id !== 'schema:description' && c.id !== 'rdfs:label')
              if (campos.length === 0) return null
              return (
                <Card key={g.id ?? g.etiqueta} className={g.id === 'derivados' ? 'border-dashed' : undefined}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{g.etiqueta}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(8rem,auto)_1fr]">
                      {campos.map((c) => (
                        <div key={c.id} className="contents">
                          <dt className="text-sm text-muted-foreground">{c.etiqueta}</dt>
                          <dd className="min-w-0 text-sm">
                            <FieldValues campo={c} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>
          <TabsContent value="relaciones" className="mt-4">
            <RelationsSection relaciones={e.relaciones} />
          </TabsContent>
          {tieneConocimiento && (
            <TabsContent value="conocimiento" className="mt-4">
              <KnowledgeTab eid={e.id} />
            </TabsContent>
          )}
          {e.anclasReales.length > 0 && (
            <TabsContent value="mundo-real" className="mt-4">
              <RealWorldPanel cid={camp.cid} eid={e.id} />
            </TabsContent>
          )}
          {hayHistoria && (
            <TabsContent value="historia" className="mt-4">
              <TemporalHistory hechos={historia.data ?? []} />
            </TabsContent>
          )}
          <TabsContent value="procedencia" className="mt-4">
            <ProvenanceTab eid={e.id} />
          </TabsContent>
        </Tabs>

        <aside className="space-y-4">
          <PortraitPanel entidad={e} />
          <Card>
            <CardContent>
              <Suspense fallback={<LoadingState rows={1} />}>
                <MiniGraph cid={camp.cid} eid={e.id} />
              </Suspense>
            </CardContent>
          </Card>
          <EntityMaps eid={e.id} />
        </aside>
      </div>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('borrar.titulo', { nombre: e.etiqueta })}</DialogTitle>
            <DialogDescription>{t('borrar.aviso')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              {t('common:acciones.cancelar')}
            </Button>
            <Button variant="destructive" disabled={borrar.isPending} onClick={onDelete}>
              <Trash2 /> {t('common:acciones.borrar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
