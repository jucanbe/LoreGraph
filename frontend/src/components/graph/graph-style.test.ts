import { describe, expect, it } from 'vitest'
import type { Grafo } from '@/api/hooks'
import {
  buildElements,
  buildStylesheet,
  edgeLabel,
  fallbackColor,
  FALLBACK_COLORS,
  FALLBACK_PALETTE,
  findNodes,
  formatIntensidad,
  isLayoutName,
  layoutOptions,
  LAYOUTS,
  normalizeLineStyle,
  normalizeShape,
} from './graph-style'
import { iconSvg, svgToDataUri } from './icons'

const grafo: Grafo = {
  truncado: false,
  nodos: [
    { id: 'ana', iri: 'urn:ana', etiqueta: 'Ana', tipo: 'rpg:NonPlayerCharacter', clases: [], color: '#ff0000', forma: 'diamond', icono: 'user', estadoEpistemico: null },
    { id: 'bea', iri: 'urn:bea', etiqueta: 'Beatriz Núñez', tipo: null, clases: [], color: null, forma: 'nonsense', icono: null, estadoEpistemico: 'falso' },
    { id: 'casa', iri: 'urn:casa', etiqueta: 'Casa', tipo: 'rpg:Place', clases: [], color: null, forma: null, icono: null, estadoEpistemico: 'desconocido' },
  ],
  aristas: [
    { id: '1', origen: 'ana', destino: 'bea', propiedad: 'rpg:rel-debt', etiqueta: 'deuda', cualificada: true, intensidad: -2, color: '#00ff00', linea: 'dashed', ancho: 3, estadoEpistemico: null },
    { id: '2', origen: 'ana', destino: 'fantasma', propiedad: 'rpg:knows', etiqueta: 'conoce', cualificada: false, intensidad: null, color: null, linea: null, ancho: null, estadoEpistemico: null },
    { id: '3', origen: 'bea', destino: 'casa', propiedad: 'rpg:locatedIn', etiqueta: 'está en', cualificada: false, intensidad: null, color: null, linea: 'weird', ancho: null, estadoEpistemico: 'no_verificado' },
  ],
}

describe('graph-style', () => {
  it('elige colores de respaldo estables de la paleta', () => {
    expect(fallbackColor('rpg:Place')).toBe(fallbackColor('rpg:Place'))
    expect(FALLBACK_COLORS).toContain(fallbackColor('cualquier-cosa'))
  })

  it('normaliza formas y líneas', () => {
    expect(normalizeShape('diamond')).toBe('diamond')
    expect(normalizeShape('roundrectangle')).toBe('round-rectangle')
    expect(normalizeShape('nonsense')).toBe('ellipse')
    expect(normalizeShape(null)).toBe('ellipse')
    expect(normalizeLineStyle('dotted')).toBe('dotted')
    expect(normalizeLineStyle('weird')).toBe('solid')
  })

  it('formatea la intensidad y la etiqueta de aristas cualificadas', () => {
    expect(formatIntensidad(2)).toBe('+2')
    expect(formatIntensidad(-2)).toBe('−2')
    expect(formatIntensidad(0)).toBe('0')
    expect(edgeLabel({ etiqueta: 'deuda', cualificada: true, intensidad: -2, estadoEpistemico: null })).toBe('deuda (−2)')
    expect(edgeLabel({ etiqueta: 'conoce', cualificada: false, intensidad: null, estadoEpistemico: 'falso' })).toBe('✗ conoce')
  })

  it('construye elementos: colores, formas, clases epistémicas y descarta aristas huérfanas', () => {
    const els = buildElements(grafo, { centerId: 'ana', iconUri: (i) => (i === 'user' ? 'data:icon' : undefined) })
    const nodes = els.filter((e) => e.group === 'nodes')
    const edges = els.filter((e) => e.group === 'edges')
    expect(nodes).toHaveLength(3)
    expect(edges).toHaveLength(2)
    const ana = nodes.find((n) => n.data.id === 'ana')!
    expect(ana.data).toMatchObject({ color: '#ff0000', shape: 'diamond', icon: 'data:icon', label: 'Ana' })
    expect(ana.classes).toContain('center')
    const bea = nodes.find((n) => n.data.id === 'bea')!
    expect(bea.data.label).toBe('✗ Beatriz Núñez')
    expect(bea.data.shape).toBe('ellipse')
    expect(FALLBACK_COLORS).toContain(bea.data.color)
    expect(bea.classes).toContain('epi-falso')
    const deuda = edges.find((e) => e.data.id === 'e-1')!
    expect(deuda.data).toMatchObject({ source: 'ana', target: 'bea', label: 'deuda (−2)', lineStyle: 'dashed', width: 3, color: '#00ff00' })
    expect(deuda.classes).toEqual(expect.arrayContaining(['qualified', 'colored']))
    const loc = edges.find((e) => e.data.id === 'e-3')!
    expect(loc.classes).toContain('epi-no_verificado')
    expect(loc.classes).not.toContain('colored')
  })

  it('aplica el traductor de colores', () => {
    const els = buildElements(grafo, { resolveColor: () => 'rgb(1, 2, 3)' })
    expect(els.find((e) => e.data.id === 'ana')?.data.color).toBe('rgb(1, 2, 3)')
  })

  it('genera la hoja de estilos con etiquetas de aristas opcionales y estados epistémicos', () => {
    const sheet = buildStylesheet({ palette: FALLBACK_PALETTE, showEdgeLabels: false })
    const selectors = sheet.map((b) => ('selector' in b ? b.selector : ''))
    expect(selectors).toEqual(expect.arrayContaining(['node', 'edge', 'node.epi-falso', 'edge.epi-falso', 'node.epi-desconocido', '.faded']))
    const edge = sheet.find((b) => 'selector' in b && b.selector === 'edge')
    expect(edge && 'style' in edge ? edge.style : {}).toMatchObject({ label: '' })
    const withLabels = buildStylesheet({ palette: FALLBACK_PALETTE, showEdgeLabels: true })
    const edge2 = withLabels.find((b) => 'selector' in b && b.selector === 'edge')
    expect(edge2 && 'style' in edge2 ? edge2.style : {}).toMatchObject({ label: 'data(label)' })
  })

  it('conoce las disposiciones', () => {
    for (const l of LAYOUTS) expect(layoutOptions(l, { nodeCount: 10 }).name).toBe(l)
    expect(isLayoutName('dagre')).toBe(true)
    expect(isLayoutName('cose-bilkent')).toBe(false)
    expect(layoutOptions('fcose', { incremental: true })).toMatchObject({ randomize: false })
  })

  it('busca nodos sin distinguir mayúsculas ni tildes, priorizando coincidencias exactas', () => {
    expect(findNodes(grafo.nodos, 'nunez').map((n) => n.id)).toEqual(['bea'])
    expect(findNodes(grafo.nodos, 'a').map((n) => n.id)).toEqual(['ana', 'bea', 'casa'])
    expect(findNodes(grafo.nodos, 'ANA').map((n) => n.id)[0]).toBe('ana')
    expect(findNodes(grafo.nodos, '  ')).toEqual([])
  })
})

describe('icons', () => {
  it('serializa nodos de lucide a SVG y data URI', () => {
    const svg = iconSvg([['circle', { cx: '12', cy: '7', r: '4', key: 'k' }]], '#fff')
    expect(svg).toContain('<circle cx="12" cy="7" r="4">')
    expect(svg).not.toContain('key=')
    expect(svg).toContain('stroke="#fff"')
    expect(svgToDataUri(svg)).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/)
  })
})
