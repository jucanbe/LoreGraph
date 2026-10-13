/** Vista de un mapa de campaña con sus marcadores y modo de edición. */
import { ChevronDown, ExternalLink, Loader2, MapPin, Pencil, Save, Trash2, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { mediaUrl } from '@/api/client'
import { useGuardarMarcadores, useMapa, type EntidadRef, type Mapa } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, LoadingState, QueryState } from '@/components/common/States'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EntityPickerDialog } from './EntityPickerDialog'
import type { MarcadorLienzo } from './MapCanvas'
import { aEntrada, anadir, desdeMapa, hayCambios, mover, quitar, type MarcadorBorrador } from './markers'

const MapCanvas = lazy(() => import('./MapCanvas'))

function Vista({ mapa: servidor }: { mapa: Mapa }) {
  const { t } = useTranslation('mapas')
  const { t: tc } = useTranslation()
  const camp = useCampaign()
  const guardar = useGuardarMarcadores(camp.cid, servidor.entidad.id)
  const [borrador, setBorrador] = useState<MarcadorBorrador[] | null>(null)
  const [pendiente, setPendiente] = useState<{ x: number; y: number } | null>(null)
  const [seleccionado, setSeleccionado] = useState<string | null>(null)
  const [panelAbierto, setPanelAbierto] = useState(false)
  // Respuesta del último guardado: se muestra hasta que llega la consulta refrescada.
  const [respuesta, setRespuesta] = useState<{ base: Mapa; mapa: Mapa } | null>(null)
  const mapa = respuesta && respuesta.base === servidor ? respuesta.mapa : servidor

  const editando = borrador !== null
  const guardados = useMemo(() => desdeMapa(mapa), [mapa])
  const lista = borrador ?? guardados
  const cambios = borrador !== null && hayCambios(borrador, mapa)

  useEffect(() => {
    if (!cambios) return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [cambios])

  const lienzo = useMemo<MarcadorLienzo[]>(
    () =>
      lista.map((m) => ({
        clave: m.clave,
        etiqueta: m.entidad.etiqueta,
        color: camp.estilo(m.entidad.tipo?.clave).color,
        href: camp.entityPath(m.entidad.id),
        x: m.x,
        y: m.y,
      })),
    [lista, camp],
  )

  const onAnadir = useCallback((x: number, y: number) => setPendiente({ x, y }), [])
  const onMover = useCallback(
    (clave: string, x: number, y: number) => setBorrador((b) => (b ? mover(b, clave, x, y) : b)),
    [],
  )
  const elegir = (e: EntidadRef) => {
    if (!pendiente) return
    setBorrador((b) => (b ? anadir(b, e, pendiente.x, pendiente.y) : b))
    setPendiente(null)
  }

  const empezar = () => {
    setBorrador(desdeMapa(mapa))
    setSeleccionado(null)
  }
  const cancelar = () => {
    setBorrador(null)
    setPendiente(null)
    setSeleccionado(null)
  }
  const confirmar = () => {
    if (!borrador) return
    guardar.mutate(aEntrada(borrador), {
      onSuccess: (nuevo) => {
        setRespuesta({ base: servidor, mapa: nuevo })
        toast.success(t('vista.guardado'))
        setBorrador(null)
        setSeleccionado(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const acciones = editando ? (
    <>
      <Button variant="outline" size="sm" onClick={cancelar} disabled={guardar.isPending}>
        <X /> {tc('acciones.cancelar')}
      </Button>
      <Button size="sm" onClick={confirmar} disabled={guardar.isPending || !cambios}>
        {guardar.isPending ? <Loader2 className="animate-spin" /> : <Save />} {tc('acciones.guardar')}
      </Button>
    </>
  ) : (
    <>
      <Button variant="outline" size="sm" asChild>
        <Link to={camp.entityPath(mapa.entidad.id)}>
          <ExternalLink /> {t('vista.ficha')}
        </Link>
      </Button>
      {mapa.imagen && (
        <Button size="sm" onClick={empezar}>
          <Pencil /> {t('vista.editar')}
        </Button>
      )}
    </>
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title={mapa.entidad.etiqueta}
        subtitle={mapa.entidad.descripcion ?? undefined}
        migas={[
          { label: camp.info.campana.nombre, to: camp.path() },
          { label: t('titulo'), to: camp.path('mapas') },
          { label: mapa.entidad.etiqueta },
        ]}
        actions={acciones}
      />
      {editando && (
        <p className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm" role="status">
          {t('vista.ayudaEdicion')}
        </p>
      )}
      {!mapa.imagen ? (
        <EmptyState icon={<MapPin className="size-8" />} title={t('vista.sinImagen')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div
            className="isolate h-[65vh] min-h-80 overflow-hidden rounded-lg border"
            role="region"
            aria-label={t('vista.region', { nombre: mapa.entidad.etiqueta })}
          >
            <Suspense fallback={<LoadingState />}>
              <MapCanvas
                imagen={mediaUrl(mapa.imagen.url)}
                marcadores={lienzo}
                editando={editando}
                seleccionado={seleccionado}
                onAnadir={onAnadir}
                onMover={onMover}
                onSeleccionar={setSeleccionado}
              />
            </Suspense>
          </div>
          <aside className="space-y-2" aria-labelledby="mapa-panel-titulo">
            <div className="flex items-center justify-between gap-2">
              <h2 id="mapa-panel-titulo" className="text-sm font-semibold">
                {t('marcadores', { count: lista.length })}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setPanelAbierto((v) => !v)}
                aria-expanded={panelAbierto}
                aria-controls="mapa-panel-lista"
              >
                <ChevronDown className={cn('transition-transform', panelAbierto && 'rotate-180')} />
                {panelAbierto ? t('vista.ocultar') : t('vista.mostrar')}
              </Button>
            </div>
            <div id="mapa-panel-lista" className={cn(!panelAbierto && 'hidden', 'lg:block')}>
              {lista.length === 0 ? (
                <p className="text-sm text-muted-foreground">{editando ? t('vista.sinMarcadoresEdicion') : t('vista.sinMarcadores')}</p>
              ) : (
                <ul className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
                  {lista.map((m) => {
                    const estilo = camp.estilo(m.entidad.tipo?.clave)
                    return (
                      <li
                        key={m.clave}
                        className={cn(
                          'flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm',
                          seleccionado === m.clave && 'border-primary bg-primary/5',
                        )}
                      >
                        <TypeIcon name={estilo.icono} color={estilo.color} className="size-3.5" />
                        {editando ? (
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left"
                            onClick={() => setSeleccionado(m.clave)}
                            aria-pressed={seleccionado === m.clave}
                          >
                            {m.entidad.etiqueta}
                          </button>
                        ) : (
                          <Link
                            to={camp.entityPath(m.entidad.id)}
                            className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
                            onMouseEnter={() => setSeleccionado(m.clave)}
                            onMouseLeave={() => setSeleccionado(null)}
                            onFocus={() => setSeleccionado(m.clave)}
                            onBlur={() => setSeleccionado(null)}
                          >
                            {m.entidad.etiqueta}
                          </Link>
                        )}
                        {m.entidad.tipo && <span className="shrink-0 text-xs text-muted-foreground">{m.entidad.tipo.etiqueta}</span>}
                        {editando && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            onClick={() => setBorrador((b) => (b ? quitar(b, m.clave) : b))}
                            aria-label={t('vista.quitar', { nombre: m.entidad.etiqueta })}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}
      <EntityPickerDialog
        open={pendiente !== null}
        onOpenChange={(o) => !o && setPendiente(null)}
        onPick={elegir}
        excluir={[mapa.entidad.id]}
      />
    </div>
  )
}

export function MapView({ mid }: { mid: string }) {
  const camp = useCampaign()
  const query = useMapa(camp.cid, mid)
  return <QueryState query={query}>{(mapa) => <Vista key={mapa.entidad.id} mapa={mapa} />}</QueryState>
}
