import { describe, expect, it } from 'vitest'
import type { Grafo, SesionLinea } from '@/api/hooks'
import { legendEntries } from './legend'
import { hasDataFilters, parseGraphParams, toFiltrosGrafo, writeGraphParams } from './params'
import { puntosTemporales } from './timeline'

describe('parámetros de la vista de grafo', () => {
  it('lee la URL con valores por defecto', () => {
    const s = parseGraphParams(new URLSearchParams(''))
    expect(s).toMatchObject({ tipo: [], relacion: [], layout: 'fcose', etiquetas: false })
    expect(s.sesion).toBeUndefined()
    expect(hasDataFilters(s)).toBe(false)
  })

  it('lee filtros múltiples, sesión, centro y descarta valores no válidos', () => {
    const s = parseGraphParams(
      new URLSearchParams('tipo=rpg:Place&tipo=rpg:Faction&tipo=rpg:Place&relacion=rpg:knows&sesion=3&centro=ana&profundidad=2&layout=dagre&etiquetas=1&vista=bea'),
    )
    expect(s.tipo).toEqual(['rpg:Place', 'rpg:Faction'])
    expect(s).toMatchObject({ sesion: 3, centro: 'ana', profundidad: 2, layout: 'dagre', etiquetas: true, vista: 'bea' })
    expect(parseGraphParams(new URLSearchParams('sesion=abc&layout=xyz&profundidad=0'))).toMatchObject({
      sesion: undefined,
      layout: 'fcose',
      profundidad: undefined,
    })
  })

  it('traduce a FiltrosGrafo con listas ordenadas y profundidad solo con centro', () => {
    const f = toFiltrosGrafo(parseGraphParams(new URLSearchParams('tipo=b&tipo=a&sesion=0&layout=grid')))
    expect(f).toEqual({ tipo: ['a', 'b'], sesion: 0 })
    expect(toFiltrosGrafo(parseGraphParams(new URLSearchParams('centro=x')))).toEqual({ centro: 'x', profundidad: 1 })
  })

  it('escribe cambios conservando el resto', () => {
    const base = new URLSearchParams('tipo=a&faccion=f&layout=dagre')
    const out = writeGraphParams(base, { faccion: undefined, sesion: 2, relacion: ['r1', 'r2'] })
    expect(out.getAll('tipo')).toEqual(['a'])
    expect(out.get('faccion')).toBeNull()
    expect(out.get('sesion')).toBe('2')
    expect(out.getAll('relacion')).toEqual(['r1', 'r2'])
    expect(out.get('layout')).toBe('dagre')
    expect(writeGraphParams(out, { layout: 'fcose' }).get('layout')).toBeNull()
    // Sin centro no se conserva la profundidad
    expect(writeGraphParams(new URLSearchParams('centro=a&profundidad=2'), { centro: undefined }).toString()).toBe('')
  })
})

describe('barra temporal', () => {
  const ref = (id: string, etiqueta: string) => ({ id, iri: `urn:${id}`, etiqueta, editable: true })
  it('ordena, quita duplicados y sesiones sin número', () => {
    const sesiones = [
      { sesion: { entidad: ref('s2', 'Dos'), numero: 2 }, entidades: [] },
      { sesion: { entidad: ref('sx', 'Sin número'), numero: null }, entidades: [] },
      { sesion: { entidad: ref('s1', 'Uno'), numero: 1 }, entidades: [] },
      { sesion: { entidad: ref('s1b', 'Uno bis'), numero: 1 }, entidades: [] },
    ] as unknown as SesionLinea[]
    expect(puntosTemporales(sesiones).map((p) => [p.numero, p.etiqueta])).toEqual([
      [1, 'Uno'],
      [2, 'Dos'],
    ])
  })
})

describe('leyenda', () => {
  it('agrupa tipos y relaciones presentes, ordenados por frecuencia', () => {
    const grafo = {
      truncado: false,
      nodos: [
        { id: 'a', iri: 'a', etiqueta: 'A', tipo: 't:X', clases: [], color: '#111111', forma: 'star', icono: 'user', estadoEpistemico: null },
        { id: 'b', iri: 'b', etiqueta: 'B', tipo: 't:Y', clases: [], color: null, forma: null, icono: null, estadoEpistemico: null },
        { id: 'c', iri: 'c', etiqueta: 'C', tipo: 't:Y', clases: [], color: null, forma: null, icono: null, estadoEpistemico: null },
      ],
      aristas: [
        { id: '1', origen: 'a', destino: 'b', propiedad: 'p:k', etiqueta: 'conoce', cualificada: false, intensidad: null, color: null, linea: 'dotted', ancho: null, estadoEpistemico: null },
      ],
    } satisfies Grafo
    const { tipos, relaciones } = legendEntries(grafo, (c) => (c === 't:Y' ? 'Lugar' : undefined))
    expect(tipos.map((t) => [t.clave, t.etiqueta, t.n])).toEqual([
      ['t:Y', 'Lugar', 2],
      ['t:X', 't:X', 1],
    ])
    expect(tipos[1]).toMatchObject({ color: '#111111', forma: 'star' })
    expect(relaciones).toEqual([{ clave: 'p:k', etiqueta: 'conoce', color: null, linea: 'dotted', n: 1 }])
  })
})
