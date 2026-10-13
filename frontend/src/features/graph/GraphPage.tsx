/**
 * Vista de grafo de la campaña: filtros (en la URL), disposiciones, búsqueda,
 * vista epistémica («ver como…»), barra temporal por sesiones, panel de
 * entidad y exportación a PNG.
 */
import type cytoscape from 'cytoscape'
import { Crosshair, Download, Eye, FilterX, Loader2, Network, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  useEntidades,
  useGrafo,
  usePersonajesConConocimiento,
  useSesiones,
  type NodoGrafo,
} from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState } from '@/components/common/States'
import { TypeIcon } from '@/components/common/TypeIcon'
import { readPalette } from '@/components/graph/colors'
import { focusNode } from '@/components/graph/cy-helpers'
import { CytoscapeGraph } from '@/components/graph/CytoscapeGraph'
import { LAYOUTS, normalizeLineStyle, type LayoutName } from '@/components/graph/graph-style'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { downloadBlob } from '@/lib/format'
import { GraphLegend, LineSwatch } from './GraphLegend'
import { GraphSearch } from './GraphSearch'
import { MultiSelectFilter, type OpcionFiltro } from './MultiSelectFilter'
import { NodeSummary } from './NodeSummary'
import { hasDataFilters, parseGraphParams, toFiltrosGrafo, writeGraphParams, type GraphUrlPatch } from './params'
import { TimelineBar } from './TimelineBar'
import { useMediaQuery } from './useMediaQuery'

const TODAS = '__todas'
const CANON = '__canon'
const EMPTY_GRAFO = { nodos: [], aristas: [], truncado: false }

export function GraphPage() {
  const { t } = useTranslation('grafo')
  const camp = useCampaign()
  const { cid } = camp
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const state = useMemo(() => parseGraphParams(sp), [sp])
  const filtros = useMemo(() => toFiltrosGrafo(state), [state])

  const grafoQ = useGrafo(cid, filtros)
  const sesionesQ = useSesiones(cid)
  const personajesQ = usePersonajesConConocimiento(cid)
  const faccionesQ = useEntidades(cid, { clase: 'rpg:Faction', limite: 200 })

  const isLarge = useMediaQuery('(min-width: 1024px)')
  const cyRef = useRef<cytoscape.Core | null>(null)
  const graphBoxRef = useRef<HTMLDivElement>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)

  const grafo = grafoQ.data ?? EMPTY_GRAFO
  const selected = useMemo(() => grafo.nodos.find((n) => n.id === selId) ?? null, [grafo, selId])

  const update = useCallback(
    (patch: GraphUrlPatch) => setSp((prev) => writeGraphParams(prev, patch), { replace: true }),
    [setSp],
  )

  // Escape cierra el panel lateral (la hoja inferior ya lo hace por sí misma).
  useEffect(() => {
    if (!selId) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (e.key === 'Escape' && !el?.closest('input, textarea, [role="dialog"], [role="listbox"]')) setSelId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selId])

  // ------------------------------------------------------------- opciones
  const tipoOpciones: OpcionFiltro[] = useMemo(
    () =>
      camp.info.tipos.map((tp) => ({
        value: tp.clase.clave,
        label: tp.clase.etiqueta,
        adorno: <TypeIcon name={tp.estilo?.icono} color={tp.estilo?.color} className="size-3.5" />,
      })),
    [camp.info.tipos],
  )

  const relacionOpciones: OpcionFiltro[] = useMemo(() => {
    const m = new Map<string, OpcionFiltro>()
    for (const r of camp.info.relaciones) {
      m.set(r.clave, {
        value: r.clave,
        label: r.etiqueta,
        adorno: <LineSwatch color={r.estilo.color} linea={normalizeLineStyle(r.estilo.linea)} className="text-muted-foreground" />,
      })
    }
    for (const a of grafo.aristas) {
      if (!m.has(a.propiedad)) {
        m.set(a.propiedad, {
          value: a.propiedad,
          label: a.etiqueta,
          adorno: <LineSwatch color={a.color} linea={normalizeLineStyle(a.linea)} className="text-muted-foreground" />,
        })
      }
    }
    for (const r of state.relacion) if (!m.has(r)) m.set(r, { value: r, label: r })
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [camp.info.relaciones, grafo.aristas, state.relacion])

  const facciones = faccionesQ.data?.elementos ?? []
  const personajes = personajesQ.data ?? []
  const vistaNombre = personajes.find((p) => p.id === state.vista)?.etiqueta ?? state.vista
  const centroNombre = grafo.nodos.find((n) => n.id === state.centro)?.etiqueta ?? state.centro

  // ------------------------------------------------------------- acciones
  const pickNode = (n: NodoGrafo) => {
    setSelId(n.id)
    setFocusId(n.id)
    if (cyRef.current && !cyRef.current.destroyed()) focusNode(cyRef.current, n.id)
  }

  const exportPng = () => {
    const cy = cyRef.current
    if (!cy || cy.destroyed() || cy.nodes().empty()) return
    try {
      const bg = readPalette(graphBoxRef.current).background
      const blob = cy.png({ full: true, output: 'blob', bg, scale: 2, maxWidth: 8000, maxHeight: 8000 })
      const sufijo = state.sesion !== undefined ? `-sesion-${state.sesion}` : ''
      downloadBlob(`grafo-${cid}${sufijo}.png`, blob)
      toast.success(t('exportar.hecho'))
    } catch (e) {
      toast.error(t('exportar.error'), { description: e instanceof Error ? e.message : undefined })
    }
  }

  const clearFilters = () => {
    update({ tipo: [], faccion: undefined, relacion: [], centro: undefined, profundidad: undefined, vista: undefined, sesion: undefined })
    setFocusId(null)
  }

  const anyFilter = hasDataFilters(state) || !!state.vista || state.sesion !== undefined

  // ------------------------------------------------------------------ vista
  return (
    <div className="space-y-3">
      <PageHeader
        title={t('titulo')}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
        subtitle={
          grafoQ.data
            ? t('resumen', { nodos: grafo.nodos.length, aristas: grafo.aristas.length })
            : undefined
        }
        actions={
          <Button variant="outline" size="sm" onClick={exportPng} disabled={grafo.nodos.length === 0}>
            <Download /> {t('exportar.png')}
          </Button>
        }
      />

      {/* ------------------------------------------------ barra de filtros */}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('filtros.titulo')}>
        <GraphSearch
          nodos={grafo.nodos}
          onPick={pickNode}
          onClear={() => setFocusId(null)}
          className="w-full sm:w-60"
        />
        <MultiSelectFilter
          label={t('filtros.tipos')}
          options={tipoOpciones}
          value={state.tipo}
          onChange={(tipo) => update({ tipo })}
        />
        <Select value={state.faccion ?? TODAS} onValueChange={(v) => update({ faccion: v === TODAS ? undefined : v })}>
          <SelectTrigger size="sm" aria-label={t('filtros.faccion')} className="max-w-52">
            <SelectValue placeholder={t('filtros.faccion')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>{t('filtros.todasFacciones')}</SelectItem>
            {facciones.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelectFilter
          label={t('filtros.relaciones')}
          options={relacionOpciones}
          value={state.relacion}
          onChange={(relacion) => update({ relacion })}
        />
        <Select value={state.vista ?? CANON} onValueChange={(v) => update({ vista: v === CANON ? undefined : v })}>
          <SelectTrigger size="sm" aria-label={t('epistemico.verComo')} className="max-w-56">
            <Eye className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CANON}>{t('epistemico.canon')}</SelectItem>
            {personajes.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {t('epistemico.comoPersonaje', { nombre: p.etiqueta })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state.layout} onValueChange={(v) => update({ layout: v as LayoutName })}>
          <SelectTrigger size="sm" aria-label={t('layout.titulo')}>
            <Network className="text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LAYOUTS.map((l) => (
              <SelectItem key={l} value={l}>
                {t(`layout.${l}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 px-1">
          <Switch
            id="grafo-etiquetas"
            checked={state.etiquetas}
            onCheckedChange={(c) => update({ etiquetas: c })}
          />
          <Label htmlFor="grafo-etiquetas" className="text-sm font-normal">
            {t('filtros.etiquetasAristas')}
          </Label>
        </div>
        {anyFilter && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX /> {t('filtros.limpiar')}
          </Button>
        )}
      </div>

      {/* --------------------------------------------- chips de contexto */}
      {(state.centro || state.vista || grafo.truncado) && (
        <div className="flex flex-wrap items-center gap-2">
          {state.centro && (
            <Badge variant="secondary" className="gap-1.5 py-1 pr-1 pl-2">
              <Crosshair className="size-3.5" />
              {t('centro.chip', { nombre: centroNombre })}
              <Select
                value={String(state.profundidad ?? 1)}
                onValueChange={(v) => update({ profundidad: Number(v) })}
              >
                <SelectTrigger size="sm" className="h-5 border-none bg-transparent px-1 text-xs" aria-label={t('centro.profundidad')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t('centro.saltos', { count: d })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t('centro.quitar')}
                onClick={() => update({ centro: undefined, profundidad: undefined })}
              >
                <X />
              </Button>
            </Badge>
          )}
          {state.vista && (
            <Badge variant="outline" className="gap-1.5 border-amber-500/50 py-1 pr-1 pl-2">
              <Eye className="size-3.5" />
              {t('epistemico.chip', { nombre: vistaNombre })}
              <Button variant="ghost" size="icon-xs" aria-label={t('epistemico.quitar')} onClick={() => update({ vista: undefined })}>
                <X />
              </Button>
            </Badge>
          )}
          {grafo.truncado && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
              {t('truncado')}
            </Badge>
          )}
        </div>
      )}

      {/* ------------------------------------------------- barra temporal */}
      {sesionesQ.data ? (
        <TimelineBar
          sesiones={sesionesQ.data}
          value={state.sesion}
          onChange={(sesion) => update({ sesion })}
          disabled={!!state.vista}
        />
      ) : sesionesQ.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : null}
      {state.vista && sesionesQ.data && sesionesQ.data.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('tiempo.noEnVista')}</p>
      )}

      {/* ------------------------------------------------------- lienzo */}
      <div className="flex h-[calc(100svh-17rem)] min-h-[420px] gap-3">
        <div ref={graphBoxRef} className="relative min-w-0 flex-1">
          {grafoQ.isError && !grafoQ.data ? (
            <ErrorState error={grafoQ.error} onRetry={() => void grafoQ.refetch()} className="h-full" />
          ) : grafoQ.isPending ? (
            <div className="h-full" role="status" aria-label={t('common:estado.cargando')}>
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          ) : (
            <>
              <CytoscapeGraph
                grafo={grafo}
                layout={state.layout}
                height="100%"
                showEdgeLabels={state.etiquetas}
                selectedId={selId}
                focusId={focusId}
                centerId={state.centro}
                ariaLabel={t('lienzo', { nodos: grafo.nodos.length, aristas: grafo.aristas.length })}
                onNodeTap={(n) => {
                  setSelId(n.id)
                  setFocusId(null)
                }}
                onNodeDoubleTap={(n) => {
                  if (!n.id.startsWith('http')) void navigate(camp.entityPath(n.id))
                }}
                onBackgroundTap={() => {
                  setSelId(null)
                  setFocusId(null)
                }}
                onReady={(cy) => {
                  cyRef.current = cy
                }}
              />
              {grafo.nodos.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <EmptyState
                    className="bg-background/90"
                    icon={<Network className="size-8" />}
                    title={anyFilter ? t('vacio.filtrado') : t('vacio.titulo')}
                    description={anyFilter ? t('vacio.filtradoDesc') : t('vacio.desc')}
                    action={
                      anyFilter ? (
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                          <FilterX /> {t('filtros.limpiar')}
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              )}
              {grafoQ.isFetching && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground" role="status">
                  <Loader2 className="size-3.5 animate-spin" /> {t('actualizando')}
                </div>
              )}
              {grafoQ.isError && grafoQ.data && (
                <div className="absolute top-2 left-2 max-w-sm rounded-md border border-destructive/40 bg-background/95 px-3 py-2 text-xs text-destructive" role="alert">
                  {grafoQ.error instanceof Error ? grafoQ.error.message : t('common:estado.error')}
                </div>
              )}
              <div className="pointer-events-none absolute bottom-2 left-2 flex max-h-full flex-col justify-end">
                <GraphLegend grafo={grafo} epistemica={!!state.vista} />
              </div>
            </>
          )}
        </div>

        {isLarge && selected && (
          <aside
            className="w-80 shrink-0 overflow-y-auto rounded-lg border bg-card p-4"
            aria-label={t('panel.titulo')}
          >
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="icon-sm" aria-label={t('common:acciones.cerrar')} onClick={() => setSelId(null)}>
                <X />
              </Button>
            </div>
            <NodeSummary nodo={selected} onCenter={(id) => update({ centro: id, profundidad: state.profundidad ?? 1 })} />
          </aside>
        )}
      </div>

      {!isLarge && (
        <Sheet open={!!selected} onOpenChange={(o) => !o && setSelId(null)}>
          <SheetContent side="right" className="w-[90vw] overflow-y-auto sm:max-w-md">
            <SheetHeader className="pb-0">
              <SheetTitle className="sr-only">{selected?.etiqueta ?? t('panel.titulo')}</SheetTitle>
              <SheetDescription className="sr-only">{t('panel.titulo')}</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              {selected && (
                <NodeSummary
                  nodo={selected}
                  onCenter={(id) => {
                    update({ centro: id, profundidad: state.profundidad ?? 1 })
                    setSelId(null)
                  }}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
