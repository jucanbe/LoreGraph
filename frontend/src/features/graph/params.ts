/**
 * Estado de la vista de grafo serializado en la URL (vistas compartibles).
 * Los filtros que resuelve el servidor (tipo, facción, relación, vista,
 * sesión, centro, profundidad) se traducen a `FiltrosGrafo`.
 */
import type { FiltrosGrafo } from '@/api/hooks'
import { isLayoutName, type LayoutName } from '@/components/graph/graph-style'

export interface GraphUrlState {
  tipo: string[]
  faccion?: string
  relacion: string[]
  vista?: string
  sesion?: number
  centro?: string
  profundidad?: number
  layout: LayoutName
  etiquetas: boolean
}

function intParam(v: string | null): number | undefined {
  if (v === null || v.trim() === '') return undefined
  const n = Number(v)
  return Number.isInteger(n) ? n : undefined
}

function nonEmpty(v: string | null): string | undefined {
  return v && v.trim() ? v : undefined
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.trim() !== ''))]
}

export function parseGraphParams(sp: URLSearchParams): GraphUrlState {
  const layout = sp.get('layout')
  const profundidad = intParam(sp.get('profundidad'))
  return {
    tipo: uniq(sp.getAll('tipo')),
    faccion: nonEmpty(sp.get('faccion')),
    relacion: uniq(sp.getAll('relacion')),
    vista: nonEmpty(sp.get('vista')),
    sesion: intParam(sp.get('sesion')),
    centro: nonEmpty(sp.get('centro')),
    profundidad: profundidad !== undefined && profundidad >= 1 ? Math.min(profundidad, 5) : undefined,
    layout: isLayoutName(layout) ? layout : 'fcose',
    etiquetas: sp.get('etiquetas') === '1',
  }
}

/** Parámetros para `useGrafo`: sin claves vacías y con listas ordenadas (clave de caché estable). */
export function toFiltrosGrafo(s: GraphUrlState): FiltrosGrafo {
  const f: FiltrosGrafo = {}
  if (s.tipo.length) f.tipo = [...s.tipo].sort()
  if (s.faccion) f.faccion = s.faccion
  if (s.relacion.length) f.relacion = [...s.relacion].sort()
  if (s.vista) f.vista = s.vista
  if (s.sesion !== undefined) f.sesion = s.sesion
  if (s.centro) {
    f.centro = s.centro
    f.profundidad = s.profundidad ?? 1
  }
  return f
}

export type GraphUrlPatch = Partial<{ [K in keyof GraphUrlState]: GraphUrlState[K] | undefined }>

/** Aplica cambios al estado y devuelve los nuevos parámetros de búsqueda. */
export function writeGraphParams(current: URLSearchParams, patch: GraphUrlPatch): URLSearchParams {
  const s = { ...parseGraphParams(current), ...patch }
  const out = new URLSearchParams()
  for (const t of s.tipo ?? []) out.append('tipo', t)
  if (s.faccion) out.set('faccion', s.faccion)
  for (const r of s.relacion ?? []) out.append('relacion', r)
  if (s.vista) out.set('vista', s.vista)
  if (s.sesion !== undefined) out.set('sesion', String(s.sesion))
  if (s.centro) {
    out.set('centro', s.centro)
    if (s.profundidad !== undefined) out.set('profundidad', String(s.profundidad))
  }
  if (s.layout && s.layout !== 'fcose') out.set('layout', s.layout)
  if (s.etiquetas) out.set('etiquetas', '1')
  return out
}

/** ¿Hay algún filtro de datos activo (no de presentación)? */
export function hasDataFilters(s: GraphUrlState): boolean {
  return s.tipo.length > 0 || !!s.faccion || s.relacion.length > 0 || !!s.centro
}
