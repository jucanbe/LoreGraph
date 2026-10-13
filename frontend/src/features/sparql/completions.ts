/**
 * Autocompletado SPARQL: prefijos de la campaña (vienen de la API), palabras
 * clave, funciones y variables ya usadas en la consulta. Funciones puras y
 * fáciles de probar.
 */
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete'

export const SPARQL_KEYWORDS = [
  'SELECT',
  'DISTINCT',
  'REDUCED',
  'WHERE',
  'FILTER',
  'OPTIONAL',
  'UNION',
  'MINUS',
  'GRAPH',
  'SERVICE',
  'BIND',
  'VALUES',
  'ORDER BY',
  'GROUP BY',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'ASK',
  'CONSTRUCT',
  'DESCRIBE',
  'PREFIX',
  'BASE',
  'FROM',
  'FROM NAMED',
  'AS',
  'ASC',
  'DESC',
  'NOT EXISTS',
  'EXISTS',
  'IN',
  'NOT IN',
] as const

export const SPARQL_FUNCTIONS = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'SAMPLE',
  'GROUP_CONCAT',
  'STR',
  'LANG',
  'LANGMATCHES',
  'DATATYPE',
  'BOUND',
  'IRI',
  'REGEX',
  'CONTAINS',
  'STRSTARTS',
  'STRENDS',
  'LCASE',
  'UCASE',
  'CONCAT',
  'COALESCE',
  'IF',
  'isIRI',
  'isLiteral',
  'YEAR',
  'NOW',
] as const

/** Prefijos ya declarados con `PREFIX p: <…>` en la consulta. */
export function declaredPrefixes(query: string): Set<string> {
  const out = new Set<string>()
  for (const m of query.matchAll(/^\s*PREFIX\s+([A-Za-z][\w.-]*)?:\s*</gim)) out.add(m[1] ?? '')
  return out
}

/** Prefijos usados en la consulta (`rpg:Algo`), sin contar IRIs ni literales. */
export function usedPrefixes(query: string, known: Iterable<string>): Set<string> {
  const knownSet = new Set(known)
  const sinRuido = query
    .replace(/<[^>\s]*>/g, ' ')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, ' ')
    .replace(/#.*$/gm, ' ')
  const out = new Set<string>()
  for (const m of sinRuido.matchAll(/(?:^|[^\w:?$])([A-Za-z][\w.-]*)?:(?=[\w-]|\s|$)/g)) {
    const p = m[1] ?? ''
    if (knownSet.has(p)) out.add(p)
  }
  return out
}

/**
 * Declaraciones PREFIX que faltan: las de los prefijos usados, o todas si la
 * consulta no usa ninguno. Devuelve las líneas a insertar al principio.
 */
export function prefixDeclarations(prefijos: Record<string, string>, query: string): string {
  const known = Object.keys(prefijos)
  const declared = declaredPrefixes(query)
  const used = usedPrefixes(query, known)
  const wanted = (used.size > 0 ? [...used] : known).filter((p) => !declared.has(p)).sort()
  return wanted.map((p) => `PREFIX ${p}: <${prefijos[p] ?? ''}>`).join('\n')
}

/** Variables (`?x`) ya presentes en el texto. */
export function variablesIn(query: string): string[] {
  return [...new Set([...query.matchAll(/[?$]([A-Za-z_][\w]*)/g)].map((m) => m[1] ?? ''))].filter(Boolean)
}

/** Opciones para una palabra parcial (sin el contexto de CodeMirror). */
export function completionOptions(prefijos: Record<string, string>, word: string, doc: string): Completion[] {
  if (word.startsWith('?') || word.startsWith('$')) {
    const actual = word.slice(1)
    return variablesIn(doc)
      .filter((v) => v !== actual)
      .map((v) => ({ label: `?${v}`, type: 'variable' }))
  }
  if (word.includes(':')) return []
  const pre: Completion[] = Object.entries(prefijos)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, iri]) => ({ label: `${p}:`, type: 'namespace', detail: iri, boost: 2 }))
  const kw: Completion[] = SPARQL_KEYWORDS.map((k) => ({ label: k, type: 'keyword' }))
  const fn: Completion[] = SPARQL_FUNCTIONS.map((f) => ({ label: f, type: 'function', apply: `${f}(`, boost: -1 }))
  return [...pre, ...kw, ...fn]
}

/** Fuente de autocompletado de CodeMirror para SPARQL. */
export function sparqlCompletionSource(getPrefijos: () => Record<string, string>): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const word = ctx.matchBefore(/[?$]?[A-Za-z_][\w-]*:?|[?$]/)
    if (!word || (word.from === word.to && !ctx.explicit)) return null
    // Dentro de una IRI <…> no se sugiere nada.
    const line = ctx.state.doc.lineAt(ctx.pos)
    const before = line.text.slice(0, ctx.pos - line.from)
    if (/<[^>\s]*$/.test(before)) return null
    // Dentro de un comentario tampoco.
    if (before.replace(/<[^>\s]*>/g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '').includes('#')) return null
    const options = completionOptions(getPrefijos(), word.text, ctx.state.doc.toString())
    if (options.length === 0) return null
    return { from: word.from, options, validFor: /^[?$]?[\w-]*$/ }
  }
}
