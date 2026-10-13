import { describe, expect, it } from 'vitest'
import type { TripletaLegible } from '@/api/hooks'
import { infoCampana, propuestaNuevoPnj, terminoEntidad } from '@/test/fixtures'
import { agruparTripletas, entidadesNuevas } from './diff'
import {
  canalAgente,
  compactIri,
  convertirLiteral,
  destinoConocimiento,
  errorAfecta,
  parseFiltro,
  siguientePendiente,
  truncar,
} from './utils'

describe('agruparTripletas', () => {
  it('agrupa por sujeto, separa los tipos y anida los nodos cualificados bajo la línea que los referencia', () => {
    const grupos = agruparTripletas(propuestaNuevoPnj.anadidas)
    expect(grupos).toHaveLength(1)
    const [pnj] = grupos
    expect(pnj?.sujeto.etiqueta).toBe('Remedios Ortiz «la Topo»')
    expect(pnj?.tipos.map((t) => t.clave)).toEqual(['vtm:Vampire', 'rpg:NonPlayerCharacter'])
    expect(pnj?.lineas.some((l) => l.tripleta.predicado.clave === 'rdf:type')).toBe(false)
    const conNodo = pnj?.lineas.filter((l) => l.anidado) ?? []
    expect(conNodo).toHaveLength(2)
    expect(conNodo.every((l) => l.tripleta.predicado.clave === 'vtm:hasDisciplineRating')).toBe(true)
    expect(conNodo[0]?.anidado?.tipos[0]?.etiqueta).toBe('Nivel de disciplina')
    expect(conNodo[0]?.anidado?.lineas).toHaveLength(3)
  })

  it('cuelga un nodo sin línea que lo referencie de su entidad propietaria', () => {
    const nodo = propuestaNuevoPnj.anadidas.filter((t) => t.sujeto.valor.includes('/n/'))
    const nombre = propuestaNuevoPnj.anadidas.find((t) => t.predicado.clave === 'rdfs:label')!
    const grupos = agruparTripletas([nombre, ...nodo])
    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.hijos).toHaveLength(2)
  })

  it('deja en el nivel superior los nodos cuyo dueño no aparece', () => {
    const nodo = propuestaNuevoPnj.anadidas.filter((t) => t.sujeto.valor.includes('/n/'))
    expect(agruparTripletas(nodo)).toHaveLength(2)
  })

  it('no entra en bucle con referencias circulares entre nodos', () => {
    const a = { ...terminoEntidad('x/n/a', 'a') }
    const b = { ...terminoEntidad('x/n/b', 'b') }
    const p = { ...terminoEntidad('p', 'p'), id: null }
    const ts: TripletaLegible[] = [
      { sujeto: a, predicado: p, objeto: b, grafo: null },
      { sujeto: b, predicado: p, objeto: a, grafo: null },
    ]
    const grupos = agruparTripletas(ts)
    expect(grupos).toHaveLength(1)
  })

  it('detecta las entidades nuevas (tipo + nombre)', () => {
    expect([...entidadesNuevas(propuestaNuevoPnj.anadidas)]).toEqual([
      'https://loregraph.example.org/data/campaign/noches-de-madrid/entity/remedios-ortiz-la-topo-a1fa',
    ])
  })
})

describe('utilidades de propuestas', () => {
  it('compacta IRIs con el prefijo más largo y deja las que no casan', () => {
    expect(compactIri('https://loregraph.example.org/ont/core#knows', infoCampana.prefijos)).toBe('rpg:knows')
    expect(compactIri('https://loregraph.example.org/ont/core/shapes#X', infoCampana.prefijos)).toBe('rpgsh:X')
    expect(compactIri('urn:otra', infoCampana.prefijos)).toBe('urn:otra')
  })

  it('interpreta filtro, canal, destino y siguiente pendiente', () => {
    expect(parseFiltro(null)).toBe('pendiente')
    expect(parseFiltro('todas')).toBe('todas')
    expect(parseFiltro('xx')).toBe('pendiente')
    expect(canalAgente('mcp:claude-code')).toBe('mcp')
    expect(canalAgente('local:qwen3:8b')).toBe('local')
    expect(canalAgente('juan')).toBeNull()
    expect(destinoConocimiento('conocimiento/lucia-vega')).toBe('lucia-vega')
    expect(destinoConocimiento('canon')).toBeNull()
    expect(siguientePendiente(['a', 'b', 'c'], 'b')).toBe('c')
    expect(siguientePendiente(['a', 'b', 'c'], 'c')).toBe('b')
    expect(siguientePendiente(['a'], 'a')).toBeUndefined()
  })

  it('trunca por palabra y conserva el tipo de los literales', () => {
    expect(truncar('uno dos tres cuatro', 10)).toBe('uno dos…')
    expect(truncar('corto', 12)).toBe('corto')
    expect(convertirLiteral(10, '9')).toBe(9)
    expect(convertirLiteral(10, 'diez')).toBe('diez')
    expect(convertirLiteral(true, 'false')).toBe(false)
    expect(convertirLiteral('a', '5')).toBe('5')
  })

  it('relaciona un error con la tripleta a la que afecta', () => {
    const t = { s: 'urn:s', p: 'https://loregraph.example.org/ont/core#knows', o: 'urn:o', literal: false }
    const e = { foco: 'urn:s', focoId: null, campo: 'rpg:knows', mensaje: 'x', severidad: 'violacion' as const, valor: null }
    expect(errorAfecta(e, t, infoCampana.prefijos)).toBe(true)
    expect(errorAfecta({ ...e, campo: 'rpg:otra' }, t, infoCampana.prefijos)).toBe(false)
    expect(errorAfecta({ ...e, campo: null }, t, infoCampana.prefijos)).toBe(true)
    expect(errorAfecta({ ...e, foco: null }, t, infoCampana.prefijos)).toBe(false)
  })
})
