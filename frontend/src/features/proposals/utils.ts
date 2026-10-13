/**
 * Utilidades puras de la bandeja de propuestas (sin React), fáciles de probar.
 * Nada aquí conoce ningún módulo de juego: solo IRIs, prefijos y la forma de
 * los datos que devuelve la API.
 */
import type { Schemas } from '@/api/client'
import type { Termino, TripletaEntrada } from '@/api/hooks'

export type ErrorValidacion = Schemas['ErrorValidacion']
export type EstadoPropuesta = 'pendiente' | 'aprobada' | 'rechazada'
export type FiltroEstado = EstadoPropuesta | 'todas'

export const FILTROS: FiltroEstado[] = ['pendiente', 'aprobada', 'rechazada', 'todas']
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const XSD = 'http://www.w3.org/2001/XMLSchema#'
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

/** Filtro de estado a partir del parámetro `?estado=` (por defecto, pendientes). */
export function parseFiltro(value: string | null | undefined): FiltroEstado {
  return FILTROS.includes(value as FiltroEstado) ? (value as FiltroEstado) : 'pendiente'
}

/** Compacta una IRI con los prefijos de la campaña (`https://…#knows` → `rpg:knows`). */
export function compactIri(iri: string, prefijos: Record<string, string> | undefined): string {
  let best: [string, string] | null = null
  for (const [prefix, ns] of Object.entries(prefijos ?? {})) {
    if (ns && iri.startsWith(ns) && (!best || ns.length > best[1].length)) best = [prefix, ns]
  }
  if (!best) return iri
  const local = iri.slice(best[1].length)
  // Solo si el nombre local es "limpio"; si no, la IRI completa es más honesta.
  return /^[\w.-]*$/u.test(local) ? `${best[0]}:${local}` : iri
}

/** Datatypes que no merece la pena mostrar (son el caso por defecto). */
export function datatypeVisible(datatype: string | null | undefined): boolean {
  return !!datatype && datatype !== `${XSD}string` && datatype !== `${RDF}langString`
}

/** ¿Es un nodo cualificado anidado (`<entidad>/n/<hash>`)? */
export function esNodoAnidado(iriOrId: string | null | undefined): boolean {
  return !!iriOrId && iriOrId.includes('/n/')
}

/** Propietario inmediato de un nodo anidado (`e/n/a/n/b` → `e/n/a`), como en el backend. */
export function propietario(iri: string): string | null {
  const i = iri.lastIndexOf('/n/')
  return i > 0 ? iri.slice(0, i) : null
}

/** Segundos desde epoch de una fecha ISO (lo que espera `relativeTime`). */
export function epochSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms / 1000
}

/** Canal del agente a partir de su nombre (`mcp:claude-code` → `mcp`, `local:qwen3:8b` → `local`). */
export function canalAgente(agente: string): string | null {
  const i = agente.indexOf(':')
  return i > 0 ? agente.slice(0, i).toLowerCase() : null
}

/** Id del personaje si el destino es su conocimiento (`conocimiento/<id>`), o `null` si es el canon. */
export function destinoConocimiento(destino: string): string | null {
  return destino.startsWith('conocimiento/') ? destino.slice('conocimiento/'.length) || null : null
}

/** Recorta un texto largo por una frontera de palabra. */
export function truncar(texto: string, max = 140): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (limpio.length <= max) return limpio
  const corte = limpio.slice(0, max)
  const espacio = corte.lastIndexOf(' ')
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd()}…`
}

/** Siguiente propuesta pendiente tras revisar `actual` (la siguiente de la lista, o la anterior si era la última). */
export function siguientePendiente(ids: string[], actual: string): string | undefined {
  const i = ids.indexOf(actual)
  if (i === -1) return ids.find((id) => id !== actual)
  return ids[i + 1] ?? ids[i - 1]
}

/** Clave estable de una tripleta en formato editable. */
export function claveEntrada(t: TripletaEntrada): string {
  return `${t.s}\u0000${t.p}\u0000${String(t.o)}\u0000${t.literal ? 'L' : 'I'}`
}

/**
 * Convierte el texto editado de un literal al tipo JSON original: si era un
 * número o un booleano y el texto sigue siéndolo, se conserva el tipo.
 */
export function convertirLiteral(original: TripletaEntrada['o'], texto: string): TripletaEntrada['o'] {
  if (typeof original === 'number') {
    const n = Number(texto.trim())
    return texto.trim() !== '' && Number.isFinite(n) ? n : texto
  }
  if (typeof original === 'boolean') {
    if (texto.trim() === 'true') return true
    if (texto.trim() === 'false') return false
  }
  return texto
}

/** Índice de términos legibles por valor (IRI o literal) para etiquetar tripletas crudas. */
export function indiceTerminos(terminos: Iterable<Termino>): Map<string, Termino> {
  const m = new Map<string, Termino>()
  for (const t of terminos) if (t.tipo !== 'literal' && !m.has(t.valor)) m.set(t.valor, t)
  return m
}

/** ¿El error de validación apunta a esta tripleta (mismo foco y, si lo indica, misma propiedad)? */
export function errorAfecta(e: ErrorValidacion, t: TripletaEntrada, prefijos: Record<string, string> | undefined): boolean {
  if (!e.foco || e.foco !== t.s) return false
  if (!e.campo) return true
  return e.campo === t.p || e.campo === compactIri(t.p, prefijos)
}
