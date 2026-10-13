/**
 * Envoltorio reutilizable de Cytoscape.js para los grafos de la campaña.
 *
 * - Crea la instancia una vez y la destruye al desmontar.
 * - Cuando cambian los datos, actualiza los elementos (añade, quita y
 *   modifica) en lugar de recrearlo todo, y solo recalcula la disposición si
 *   cambió la estructura.
 * - Lee los colores del tema (variables CSS) y se actualiza al pasar de claro
 *   a oscuro.
 */
import type cytoscape from 'cytoscape'
import { useEffect, useRef } from 'react'
import type { Grafo, NodoGrafo } from '@/api/hooks'
import { cn } from '@/lib/utils'
import { resolveCssColor, useGraphPalette } from './colors'
import { ensureCytoscapeExtensions } from './cytoscape-setup'
import { buildElements, buildStylesheet, fallbackColor, layoutOptions, type LayoutName } from './graph-style'
import { focusNode, highlightNeighborhood } from './cy-helpers'
import { cachedIconUri, loadIconUri } from './icons'

export interface CytoscapeGraphProps {
  grafo: Grafo
  layout?: LayoutName
  height?: string | number
  onNodeTap?: (n: NodoGrafo) => void
  onNodeDoubleTap?: (n: NodoGrafo) => void
  onBackgroundTap?: () => void
  /** Nodo seleccionado (borde resaltado). */
  selectedId?: string | null
  /** Nodo enfocado: se centra y se atenúa lo que no es su vecindario. */
  focusId?: string | null
  /** Nodo marcado como centro (más grande), p. ej. en el mini-grafo. */
  centerId?: string
  showEdgeLabels?: boolean
  /** Tamaños reducidos para vistas pequeñas. */
  compact?: boolean
  className?: string
  ariaLabel?: string
  onReady?: (cy: cytoscape.Core) => void
}

const resolveColor = (c: string) => resolveCssColor(c) ?? fallbackColor(c)

export function CytoscapeGraph({
  grafo,
  layout = 'fcose',
  height = '100%',
  onNodeTap,
  onNodeDoubleTap,
  onBackgroundTap,
  selectedId,
  focusId,
  centerId,
  showEdgeLabels = false,
  compact = false,
  className,
  ariaLabel,
  onReady,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const palette = useGraphPalette(containerRef)
  const nodosRef = useRef(new Map<string, NodoGrafo>())
  const handlersRef = useRef({ onNodeTap, onNodeDoubleTap, onBackgroundTap, onReady })
  const layoutNameRef = useRef<LayoutName>(layout)
  const lastLayoutRef = useRef<LayoutName | null>(null)
  const runningLayoutRef = useRef<cytoscape.Layouts | null>(null)
  const focusRef = useRef<string | null | undefined>(focusId)
  const styleRef = useRef({ palette, showEdgeLabels, compact })

  useEffect(() => {
    handlersRef.current = { onNodeTap, onNodeDoubleTap, onBackgroundTap, onReady }
    layoutNameRef.current = layout
    focusRef.current = focusId
    styleRef.current = { palette, showEdgeLabels, compact }
  })

  /** Aplica el foco (centrado + resaltado) tras una disposición o un cambio. */
  const applyFocus = (cy: cytoscape.Core) => {
    const id = focusRef.current
    highlightNeighborhood(cy, id)
    if (id) focusNode(cy, id)
  }

  const runLayout = (cy: cytoscape.Core, incremental: boolean) => {
    runningLayoutRef.current?.stop()
    const name = layoutNameRef.current
    lastLayoutRef.current = name
    if (cy.nodes().empty()) return
    const lay = cy.layout(layoutOptions(name, { nodeCount: cy.nodes().length, incremental }))
    runningLayoutRef.current = lay
    lay.one('layoutstop', () => {
      if (runningLayoutRef.current === lay) runningLayoutRef.current = null
      if (!cy.destroyed()) applyFocus(cy)
    })
    lay.run()
  }

  // ------------------------------------------------- creación / destrucción
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const cy = ensureCytoscapeExtensions()({
      container,
      elements: [],
      style: buildStylesheet(styleRef.current),
      minZoom: 0.08,
      maxZoom: 4,
      boxSelectionEnabled: false,
      selectionType: 'single',
    })
    cyRef.current = cy

    cy.on('tap', 'node', (e) => {
      const n = nodosRef.current.get((e.target as cytoscape.NodeSingular).id())
      if (n) handlersRef.current.onNodeTap?.(n)
    })
    cy.on('dbltap', 'node', (e) => {
      const n = nodosRef.current.get((e.target as cytoscape.NodeSingular).id())
      if (n) handlersRef.current.onNodeDoubleTap?.(n)
    })
    cy.on('tap', (e) => {
      if (e.target === cy) handlersRef.current.onBackgroundTap?.()
    })
    cy.on('mouseover', 'node, edge', (e) => {
      ;(e.target as cytoscape.SingularElementReturnValue).addClass('hover')
      if ((e.target as cytoscape.SingularElementReturnValue).isNode()) container.style.cursor = 'pointer'
    })
    cy.on('mouseout', 'node, edge', (e) => {
      ;(e.target as cytoscape.SingularElementReturnValue).removeClass('hover')
      container.style.cursor = ''
    })

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => cy.resize()) : null
    ro?.observe(container)
    handlersRef.current.onReady?.(cy)

    return () => {
      ro?.disconnect()
      runningLayoutRef.current?.stop()
      runningLayoutRef.current = null
      cy.destroy()
      cyRef.current = null
    }
  }, [])

  // ------------------------------------------------ sincronización de datos
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    nodosRef.current = new Map(grafo.nodos.map((n) => [n.id, n]))
    const elements = buildElements(grafo, { resolveColor, iconUri: cachedIconUri, centerId })
    const ids = new Set(elements.map((e) => String(e.data.id)))
    const previous = cy.nodes().length
    let added = 0
    let removed = 0

    cy.batch(() => {
      const gone = cy.elements().filter((ele) => !ids.has(ele.id()))
      removed = gone.length
      gone.remove()
      const toAdd: cytoscape.ElementDefinition[] = []
      for (const el of elements) {
        const id = String(el.data.id)
        const existing = cy.getElementById(id)
        if (existing.empty()) {
          toAdd.push(el)
          continue
        }
        existing.data(el.data)
        existing.classes(el.classes ?? [])
      }
      added = toAdd.length
      const addedEles = cy.add(toAdd)
      // Los nodos nuevos nacen junto a un vecino ya colocado (menos saltos visuales).
      addedEles.nodes().forEach((n) => {
        const placed = n.neighborhood('node').filter((m) => !addedEles.contains(m)).first()
        if (placed.nonempty()) {
          const p = (placed as cytoscape.NodeSingular).position()
          n.position({ x: p.x + (Math.random() - 0.5) * 60, y: p.y + (Math.random() - 0.5) * 60 })
        }
      })
    })

    if (added > 0 || removed > 0 || lastLayoutRef.current === null) {
      const kept = previous - removed
      runLayout(cy, kept > 0 && added < Math.max(10, kept))
    } else {
      applyFocus(cy)
    }

    // Iconos de tipo: se cargan una vez y se aplican cuando llegan.
    const missing = new Set(grafo.nodos.map((n) => n.icono).filter((i): i is string => !!i && !cachedIconUri(i)))
    for (const name of missing) {
      void loadIconUri(name).then((uri) => {
        if (!uri || cy.destroyed()) return
        cy.nodes().filter((n) => n.data('icono') === name).data('icon', uri)
      })
    }
    // Dependencias mínimas a propósito: runLayout/applyFocus leen refs
  }, [grafo, centerId])

  // ------------------------------------------------------------- disposición
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || lastLayoutRef.current === null || lastLayoutRef.current === layout) return
    runLayout(cy, false)
    // Dependencias mínimas a propósito: runLayout lee refs
  }, [layout])

  // ------------------------------------------------------------------ estilo
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.style(buildStylesheet({ palette, showEdgeLabels, compact }))
  }, [palette, showEdgeLabels, compact])

  // --------------------------------------------------------------- selección
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.nodes(':selected').unselect()
    if (selectedId) cy.getElementById(selectedId).select()
  }, [selectedId, grafo])

  // -------------------------------------------------------------------- foco
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || runningLayoutRef.current) return // se aplicará al terminar la disposición
    applyFocus(cy)
    // Dependencias mínimas a propósito: applyFocus lee refs
  }, [focusId])

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label={ariaLabel}
      tabIndex={0}
      className={cn('graph-canvas relative w-full overflow-hidden rounded-lg border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
      style={{ height }}
    />
  )
}
