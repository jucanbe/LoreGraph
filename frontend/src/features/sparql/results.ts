/** Utilidades puras sobre resultados SPARQL (exportación CSV, formato de términos). */
import type { ResultadoSparql, Termino } from '@/api/hooks'
import { toCsv } from '@/lib/format'

export type ModoCsv = 'etiquetas' | 'valores'

const XSD = 'http://www.w3.org/2001/XMLSchema#'

export function termText(term: Termino | undefined, modo: ModoCsv): string {
  if (!term) return ''
  if (modo === 'valores') return term.valor
  return term.etiqueta || term.clave || term.valor
}

/** Datatype compacto («xsd:integer»); `null` para xsd:string y lenguajes. */
export function shortDatatype(datatype: string | null | undefined): string | null {
  if (!datatype || datatype === `${XSD}string` || datatype.endsWith('#langString')) return null
  if (datatype.startsWith(XSD)) return `xsd:${datatype.slice(XSD.length)}`
  const cut = Math.max(datatype.lastIndexOf('#'), datatype.lastIndexOf('/'))
  return cut >= 0 ? datatype.slice(cut + 1) : datatype
}

export function isHttpIri(v: string): boolean {
  return /^https?:\/\//i.test(v)
}

/** Resultado → CSV (SELECT: variables; CONSTRUCT: sujeto/predicado/objeto; ASK: booleano). */
export function resultToCsv(res: ResultadoSparql, modo: ModoCsv, cabeceraTripletas = ['sujeto', 'predicado', 'objeto']): string {
  if (res.tipo === 'select') {
    const vars = res.variables ?? []
    const rows = (res.filas ?? []).map((f) => vars.map((v) => termText(f[v], modo)))
    return toCsv(vars, rows)
  }
  if (res.tipo === 'construct') {
    const rows = (res.tripletas ?? []).map((t) => [termText(t.sujeto, modo), termText(t.predicado, modo), termText(t.objeto, modo)])
    return toCsv(cabeceraTripletas, rows)
  }
  return toCsv(['ask'], [[String(res.booleano ?? false)]])
}

/** ¿Tiene filas exportables? */
export function hasRows(res: ResultadoSparql): boolean {
  if (res.tipo === 'select') return (res.filas?.length ?? 0) > 0
  if (res.tipo === 'construct') return (res.tripletas?.length ?? 0) > 0
  return true
}
