/**
 * Funciones puras para traducir el grafo de la API a elementos, estilos y
 * disposiciones de Cytoscape. No conocen ningún módulo: todo el aspecto
 * (color, forma, línea) llega en los nodos y aristas de la API; aquí solo se
 * aplican valores de respaldo cuando faltan.
 */
import type cytoscape from 'cytoscape'
import type { AristaGrafo, Grafo, NodoGrafo } from '@/api/hooks'

export type EstadoEpistemico = NonNullable<NodoGrafo['estadoEpistemico']>

export const ESTADOS_EPISTEMICOS: readonly EstadoEpistemico[] = [
  'confirmado',
  'falso',
  'no_verificado',
  'desconocido',
] as const

/** Colores del tema actual ya resueltos a un formato que entiende Cytoscape. */
export interface GraphPalette {
  foreground: string
  background: string
  muted: string
  border: string
  primary: string
  destructive: string
  warning: string
}

export const FALLBACK_PALETTE: GraphPalette = {
  foreground: '#1f2937',
  background: '#ffffff',
  muted: '#6b7280',
  border: '#d1d5db',
  primary: '#4f46e5',
  destructive: '#dc2626',
  warning: '#d97706',
}

/** Paleta de respaldo para tipos sin color declarado (se elige por hash estable). */
export const FALLBACK_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#84cc16',
  '#f97316',
] as const

function hashString(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Color estable para una clave (tipo o id) cuando la API no da ninguno. */
export function fallbackColor(key: string): string {
  return FALLBACK_COLORS[hashString(key) % FALLBACK_COLORS.length] ?? FALLBACK_COLORS[0]
}

const NODE_SHAPES = new Set<string>([
  'ellipse',
  'triangle',
  'round-triangle',
  'rectangle',
  'round-rectangle',
  'bottom-round-rectangle',
  'cut-rectangle',
  'barrel',
  'rhomboid',
  'right-rhomboid',
  'diamond',
  'round-diamond',
  'pentagon',
  'round-pentagon',
  'hexagon',
  'round-hexagon',
  'concave-hexagon',
  'heptagon',
  'round-heptagon',
  'octagon',
  'round-octagon',
  'star',
  'tag',
  'round-tag',
  'vee',
])

/** Forma de Cytoscape válida (la del manifiesto o «ellipse»). */
export function normalizeShape(forma: string | null | undefined): string {
  if (!forma) return 'ellipse'
  const f = forma.trim().toLowerCase()
  if (f === 'roundrectangle') return 'round-rectangle'
  return NODE_SHAPES.has(f) ? f : 'ellipse'
}

export type LineStyle = 'solid' | 'dashed' | 'dotted'

export function normalizeLineStyle(linea: string | null | undefined): LineStyle {
  return linea === 'dashed' || linea === 'dotted' ? linea : 'solid'
}

/** Intensidad con signo tipográfico: «+2», «−2», «0». */
export function formatIntensidad(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}

/** Marca visual que acompaña a las etiquetas de lo que contradice el canon. */
export const MARCA_FALSO = '✗'
export const MARCA_NO_VERIFICADO = '?'

function marcaEpistemica(estado: EstadoEpistemico | null | undefined): string {
  if (estado === 'falso') return `${MARCA_FALSO} `
  if (estado === 'no_verificado') return `${MARCA_NO_VERIFICADO} `
  return ''
}

/** Etiqueta de una arista: «deuda (−2)» si es cualificada con intensidad. */
export function edgeLabel(a: Pick<AristaGrafo, 'etiqueta' | 'cualificada' | 'intensidad' | 'estadoEpistemico'>): string {
  const base =
    a.cualificada && a.intensidad !== null && a.intensidad !== undefined
      ? `${a.etiqueta} (${formatIntensidad(a.intensidad)})`
      : a.etiqueta
  return `${marcaEpistemica(a.estadoEpistemico)}${base}`
}

export function nodeLabel(n: Pick<NodoGrafo, 'etiqueta' | 'estadoEpistemico'>): string {
  return `${marcaEpistemica(n.estadoEpistemico)}${n.etiqueta}`
}

export interface BuildElementsOptions {
  /** Traduce colores arbitrarios (p. ej. oklch) a uno que entienda Cytoscape. */
  resolveColor?: (color: string) => string
  /** URI de imagen (SVG) del icono de un nodo, si ya está disponible. */
  iconUri?: (icono: string) => string | undefined
  /** Nodo que se marca como centro (mini-grafo). */
  centerId?: string
}

/** Datos de un nodo tal como los guarda Cytoscape. */
export interface NodeData {
  id: string
  label: string
  color: string
  shape: string
  tipo: string
  icono: string
  icon?: string
  estado: EstadoEpistemico | ''
}

export interface EdgeData {
  id: string
  source: string
  target: string
  label: string
  color: string
  lineStyle: LineStyle
  width: number
  propiedad: string
  estado: EstadoEpistemico | ''
}

function nodeClasses(n: NodoGrafo, centerId?: string): string[] {
  const cls: string[] = []
  if (n.estadoEpistemico) cls.push(`epi-${n.estadoEpistemico}`)
  if (centerId && n.id === centerId) cls.push('center')
  return cls
}

export function buildNodeElement(n: NodoGrafo, opts: BuildElementsOptions = {}): cytoscape.ElementDefinition {
  const resolve = opts.resolveColor ?? ((c: string) => c)
  const icono = n.icono ?? ''
  const data: NodeData = {
    id: n.id,
    label: nodeLabel(n),
    color: resolve(n.color || fallbackColor(n.tipo ?? n.id)),
    shape: normalizeShape(n.forma),
    tipo: n.tipo ?? '',
    icono,
    estado: n.estadoEpistemico ?? '',
  }
  const uri = icono ? opts.iconUri?.(icono) : undefined
  if (uri) data.icon = uri
  return { group: 'nodes', data: { ...data }, classes: nodeClasses(n, opts.centerId) }
}

export function buildEdgeElement(a: AristaGrafo, opts: BuildElementsOptions = {}): cytoscape.ElementDefinition {
  const resolve = opts.resolveColor ?? ((c: string) => c)
  const data: EdgeData = {
    id: `e-${a.id}`,
    source: a.origen,
    target: a.destino,
    label: edgeLabel(a),
    color: a.color ? resolve(a.color) : '',
    lineStyle: normalizeLineStyle(a.linea),
    width: a.ancho && a.ancho > 0 ? Math.min(a.ancho, 12) : 1.5,
    propiedad: a.propiedad,
    estado: a.estadoEpistemico ?? '',
  }
  const cls: string[] = []
  if (a.estadoEpistemico) cls.push(`epi-${a.estadoEpistemico}`)
  if (data.color) cls.push('colored')
  if (a.cualificada) cls.push('qualified')
  if (a.origen === a.destino) cls.push('loop')
  return { group: 'edges', data: { ...data }, classes: cls }
}

/** Convierte el grafo de la API en elementos de Cytoscape (descarta aristas huérfanas). */
export function buildElements(grafo: Grafo, opts: BuildElementsOptions = {}): cytoscape.ElementDefinition[] {
  const ids = new Set(grafo.nodos.map((n) => n.id))
  const nodes = grafo.nodos.map((n) => buildNodeElement(n, opts))
  const seen = new Set<string>()
  const edges: cytoscape.ElementDefinition[] = []
  for (const a of grafo.aristas) {
    if (!ids.has(a.origen) || !ids.has(a.destino)) continue
    if (seen.has(a.id)) continue
    seen.add(a.id)
    edges.push(buildEdgeElement(a, opts))
  }
  return [...nodes, ...edges]
}

export interface StylesheetOptions {
  palette: GraphPalette
  showEdgeLabels?: boolean
  compact?: boolean
}

/** Hoja de estilos de Cytoscape a partir de la paleta del tema y de los datos de cada elemento. */
export function buildStylesheet({ palette, showEdgeLabels = false, compact = false }: StylesheetOptions): cytoscape.StylesheetJson {
  const nodeSize = compact ? 26 : 34
  const fontSize = compact ? 9 : 11
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(color)',
        shape: 'data(shape)' as unknown as cytoscape.Css.NodeShape,
        width: nodeSize,
        height: nodeSize,
        label: 'data(label)',
        color: palette.foreground,
        'font-size': fontSize,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 4,
        'text-wrap': 'ellipsis',
        'text-max-width': compact ? '90px' : '130px',
        'text-outline-color': palette.background,
        'text-outline-width': 2,
        'text-outline-opacity': 0.85,
        'border-width': 1.5,
        'border-color': palette.background,
        'overlay-padding': 4,
        'transition-property': 'opacity, border-width, border-color',
        'transition-duration': 150,
      },
    },
    {
      selector: 'node[icon]',
      style: {
        'background-image': 'data(icon)',
        'background-width': '58%',
        'background-height': '58%',
        'background-fit': 'none',
        'background-clip': 'none',
      },
    },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': palette.border,
        'line-style': 'data(lineStyle)' as unknown as cytoscape.Css.LineStyle,
        'target-arrow-shape': 'triangle',
        'target-arrow-color': palette.border,
        'arrow-scale': compact ? 0.8 : 1,
        'curve-style': 'bezier',
        opacity: 0.9,
        label: showEdgeLabels ? 'data(label)' : '',
        'font-size': fontSize - 1,
        color: palette.muted,
        'text-rotation': 'autorotate',
        'text-outline-color': palette.background,
        'text-outline-width': 2,
        'text-outline-opacity': 0.9,
      },
    },
    {
      selector: 'edge.colored',
      style: { 'line-color': 'data(color)', 'target-arrow-color': 'data(color)' },
    },
    { selector: 'edge.loop', style: { 'curve-style': 'bezier', 'loop-direction': '-45deg', 'loop-sweep': '-60deg' } },
    { selector: 'edge.hover, edge:selected', style: { label: 'data(label)', opacity: 1, 'z-index': 20 } },
    // ---------------------------------------------------- vista epistémica
    {
      selector: 'node.epi-falso',
      style: { 'border-color': palette.destructive, 'border-width': 3, 'border-style': 'dashed', color: palette.destructive },
    },
    {
      selector: 'node.epi-no_verificado',
      style: { 'border-color': palette.warning, 'border-width': 3, 'border-style': 'dotted' },
    },
    {
      selector: 'node.epi-desconocido',
      style: { opacity: 0.45, 'border-color': palette.muted, 'border-width': 2, 'border-style': 'dashed' },
    },
    {
      selector: 'edge.epi-falso',
      style: {
        'line-color': palette.destructive,
        'target-arrow-color': palette.destructive,
        'line-style': 'dashed',
        label: 'data(label)',
        color: palette.destructive,
        width: 2.5,
      },
    },
    {
      selector: 'edge.epi-no_verificado',
      style: { 'line-color': palette.warning, 'target-arrow-color': palette.warning, 'line-style': 'dotted', width: 2.5 },
    },
    { selector: 'edge.epi-desconocido', style: { opacity: 0.4, 'line-style': 'dashed' } },
    // ---------------------------------------------- selección y resaltado
    { selector: 'node.center', style: { 'border-color': palette.primary, 'border-width': 4, width: nodeSize * 1.3, height: nodeSize * 1.3, 'font-weight': 'bold' } },
    { selector: 'node:selected', style: { 'border-color': palette.primary, 'border-width': 4, 'z-index': 30 } },
    { selector: 'node.highlight', style: { 'border-color': palette.primary, 'border-width': 4, 'font-weight': 'bold', 'z-index': 40 } },
    { selector: '.faded', style: { opacity: 0.15 } },
    { selector: 'node.hover', style: { 'border-color': palette.primary, 'border-width': 3 } },
  ]
}

export const LAYOUTS = ['fcose', 'concentric', 'dagre', 'circle', 'grid'] as const
export type LayoutName = (typeof LAYOUTS)[number]

export function isLayoutName(v: string | null | undefined): v is LayoutName {
  return !!v && (LAYOUTS as readonly string[]).includes(v)
}

/** Opciones de disposición; `incremental` conserva posiciones previas (fcose). */
export function layoutOptions(
  name: LayoutName,
  { nodeCount = 0, incremental = false }: { nodeCount?: number; incremental?: boolean } = {},
): cytoscape.LayoutOptions {
  // Solo se anima al actualizar (transición suave); la primera disposición es inmediata.
  const animate = incremental && nodeCount > 0 && nodeCount < 250
  const common = { animate, animationDuration: 400, fit: true, padding: 30 }
  switch (name) {
    case 'fcose':
      return {
        name: 'fcose',
        ...common,
        quality: nodeCount > 600 ? 'draft' : 'default',
        randomize: !incremental,
        nodeRepulsion: 6500,
        idealEdgeLength: 90,
        nodeSeparation: 80,
        packComponents: true,
      } as unknown as cytoscape.LayoutOptions
    case 'concentric':
      return {
        name: 'concentric',
        ...common,
        minNodeSpacing: 24,
        concentric: (n: cytoscape.NodeSingular) => n.degree(false),
        levelWidth: () => 2,
      } as unknown as cytoscape.LayoutOptions
    case 'dagre':
      return { name: 'dagre', ...common, rankDir: 'TB', nodeSep: 40, rankSep: 70 } as unknown as cytoscape.LayoutOptions
    case 'circle':
      return { name: 'circle', ...common } as cytoscape.LayoutOptions
    case 'grid':
      return { name: 'grid', ...common, avoidOverlap: true } as cytoscape.LayoutOptions
  }
}

/** Busca nodos cuya etiqueta contenga el texto (sin distinguir mayúsculas ni tildes). */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function findNodes(nodos: NodoGrafo[], query: string, limit = 8): NodoGrafo[] {
  const q = normalizeText(query)
  if (!q) return []
  const exact: NodoGrafo[] = []
  const starts: NodoGrafo[] = []
  const contains: NodoGrafo[] = []
  for (const n of nodos) {
    const l = normalizeText(n.etiqueta)
    if (l === q) exact.push(n)
    else if (l.startsWith(q)) starts.push(n)
    else if (l.includes(q)) contains.push(n)
  }
  return [...exact, ...starts, ...contains].slice(0, limit)
}
