/** Agrupación de las entidades que aparecen en una sesión por su tipo. */
import type { ClaseRef, EntidadRef } from '@/api/hooks'

export interface GrupoTipo {
  clave: string
  tipo: ClaseRef | null
  entidades: EntidadRef[]
}

/** Agrupa por tipo (conservando el orden de aparición de los tipos) y ordena por etiqueta. */
export function groupByType(entidades: EntidadRef[]): GrupoTipo[] {
  const grupos = new Map<string, GrupoTipo>()
  for (const e of entidades) {
    const clave = e.tipo?.clave ?? ''
    let g = grupos.get(clave)
    if (!g) {
      g = { clave, tipo: e.tipo ?? null, entidades: [] }
      grupos.set(clave, g)
    }
    g.entidades.push(e)
  }
  for (const g of grupos.values()) g.entidades.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))
  return [...grupos.values()]
}

/** ¿Las notas son lo bastante largas como para plegarlas? */
export function isLongText(text: string, maxChars = 280, maxLines = 4): boolean {
  return text.length > maxChars || text.split('\n').length > maxLines
}
