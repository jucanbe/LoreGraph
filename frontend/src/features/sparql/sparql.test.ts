import { describe, expect, it } from 'vitest'
import type { ResultadoSparql, Termino } from '@/api/hooks'
import { completionOptions, declaredPrefixes, prefixDeclarations, usedPrefixes, variablesIn } from './completions'
import { hasRows, resultToCsv, shortDatatype, termText } from './results'

const prefijos = { rpg: 'https://loregraph.example.org/ont/core#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', ex: 'http://ex.org/' }

describe('autocompletado SPARQL', () => {
  it('sugiere prefijos de la campaña al escribir «rp»', () => {
    const opts = completionOptions(prefijos, 'rp', '')
    const rpg = opts.find((o) => o.label === 'rpg:')
    expect(rpg).toMatchObject({ type: 'namespace', detail: prefijos.rpg })
    expect(opts.some((o) => o.label === 'SELECT' && o.type === 'keyword')).toBe(true)
  })

  it('no sugiere nada tras «prefijo:» y propone variables con «?»', () => {
    expect(completionOptions(prefijos, 'rpg:', '')).toEqual([])
    const vars = completionOptions(prefijos, '?n', 'SELECT ?nombre ?tipo WHERE { ?x ?p ?n }')
    expect(vars.map((v) => v.label)).toEqual(['?nombre', '?tipo', '?x', '?p'])
  })

  it('detecta prefijos declarados y usados (ignorando IRIs, literales y comentarios)', () => {
    const q = `PREFIX rpg: <https://loregraph.example.org/ont/core#>
# ex:comentario
SELECT ?s WHERE { ?s a rpg:Place ; rdfs:label "ex:no" . <http://a.org/x:y> ?p ?o }`
    expect([...declaredPrefixes(q)]).toEqual(['rpg'])
    expect([...usedPrefixes(q, Object.keys(prefijos))].sort()).toEqual(['rdfs', 'rpg'])
    expect(variablesIn(q)).toEqual(['s', 'p', 'o'])
  })

  it('genera las declaraciones PREFIX que faltan', () => {
    expect(prefixDeclarations(prefijos, 'SELECT * WHERE { ?s rdfs:label ?l ; a rpg:Place }')).toBe(
      `PREFIX rdfs: <${prefijos.rdfs}>\nPREFIX rpg: <${prefijos.rpg}>`,
    )
    // Sin prefijos usados: todos
    expect(prefixDeclarations(prefijos, 'SELECT * WHERE { ?s ?p ?o }').split('\n')).toHaveLength(3)
    // Ya declarados: nada
    expect(prefixDeclarations({ rpg: prefijos.rpg }, `PREFIX rpg: <${prefijos.rpg}>\nASK { ?s a rpg:X }`)).toBe('')
  })
})

const iri = (valor: string, etiqueta: string, extra: Partial<Termino> = {}): Termino => ({
  tipo: 'iri',
  valor,
  etiqueta,
  id: null,
  clave: null,
  datatype: null,
  idioma: null,
  ...extra,
})

describe('resultados SPARQL', () => {
  const select: ResultadoSparql = {
    tipo: 'select',
    variables: ['s', 'n'],
    filas: [
      { s: iri('https://x/ana', 'Ana', { id: 'ana' }), n: { tipo: 'literal', valor: 'Ana, "la roja"', etiqueta: 'Ana, "la roja"', id: null, clave: null, datatype: null, idioma: 'es' } },
      { s: iri('http://www.wikidata.org/entity/Q2807', 'Madrid') },
    ],
    booleano: null,
    tripletas: [],
    truncado: false,
    duracion: 0.01,
    cache: false,
  }

  it('exporta SELECT a CSV con etiquetas o valores', () => {
    expect(resultToCsv(select, 'etiquetas')).toBe('s,n\r\nAna,"Ana, ""la roja"""\r\nMadrid,')
    expect(resultToCsv(select, 'valores').split('\r\n')[2]).toBe('http://www.wikidata.org/entity/Q2807,')
  })

  it('exporta CONSTRUCT y ASK', () => {
    const construct: ResultadoSparql = {
      ...select,
      tipo: 'construct',
      variables: [],
      filas: [],
      tripletas: [{ sujeto: iri('u:a', 'A'), predicado: iri('u:p', 'conoce', { clave: 'rpg:knows' }), objeto: iri('u:b', 'B'), grafo: null }],
    }
    expect(resultToCsv(construct, 'etiquetas', ['s', 'p', 'o'])).toBe('s,p,o\r\nA,conoce,B')
    expect(hasRows(construct)).toBe(true)
    expect(resultToCsv({ ...select, tipo: 'ask', booleano: true }, 'valores')).toBe('ask\r\ntrue')
    expect(hasRows({ ...select, filas: [] })).toBe(false)
  })

  it('formatea términos y datatypes', () => {
    expect(termText(iri('u:x', '', { clave: 'rpg:X' }), 'etiquetas')).toBe('rpg:X')
    expect(termText(undefined, 'valores')).toBe('')
    expect(shortDatatype('http://www.w3.org/2001/XMLSchema#integer')).toBe('xsd:integer')
    expect(shortDatatype('http://www.w3.org/2001/XMLSchema#string')).toBeNull()
    expect(shortDatatype('http://ex.org/dt#color')).toBe('color')
  })
})
