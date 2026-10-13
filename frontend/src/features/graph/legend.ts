/** Agrupación de tipos y relaciones para la leyenda del grafo. */
import type { Grafo } from '@/api/hooks'
import { fallbackColor, normalizeLineStyle, normalizeShape, type LineStyle } from '@/components/graph/graph-style'

export interface LeyendaTipo {
  clave: string
  etiqueta: string
  color: string
  forma: string
  icono?: string | null
  n: number
}

export interface LeyendaRelacion {
  clave: string
  etiqueta: string
  color?: string | null
  linea: LineStyle
  n: number
}

/** Agrupa los tipos y relaciones presentes en el grafo (función pura, exportada para tests). */
export function legendEntries(grafo: Grafo, etiquetaTipo: (clave: string) => string | undefined) {
  const tipos = new Map<string, LeyendaTipo>()
  for (const n of grafo.nodos) {
    const clave = n.tipo ?? ''
    const prev = tipos.get(clave)
    if (prev) {
      prev.n++
      continue
    }
    tipos.set(clave, {
      clave,
      etiqueta: (clave && etiquetaTipo(clave)) || clave || '—',
      color: n.color || fallbackColor(n.tipo ?? n.id),
      forma: normalizeShape(n.forma),
      icono: n.icono,
      n: 1,
    })
  }
  const relaciones = new Map<string, LeyendaRelacion>()
  for (const a of grafo.aristas) {
    const prev = relaciones.get(a.propiedad)
    if (prev) {
      prev.n++
      continue
    }
    relaciones.set(a.propiedad, {
      clave: a.propiedad,
      etiqueta: a.etiqueta,
      color: a.color,
      linea: normalizeLineStyle(a.linea),
      n: 1,
    })
  }
  const byCount = <T extends { n: number; etiqueta: string }>(x: T, y: T) => y.n - x.n || x.etiqueta.localeCompare(y.etiqueta)
  return { tipos: [...tipos.values()].sort(byCount), relaciones: [...relaciones.values()].sort(byCount) }
}
