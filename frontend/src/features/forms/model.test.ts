import { describe, expect, it } from 'vitest'
import type { Campo, Formulario } from '@/api/hooks'
import {
  initialValuesForNew,
  mapServerErrors,
  toEntrada,
  validateValues,
  type FormValues,
  type Messages,
} from './model'

const M: Messages = {
  requerido: 'requerido',
  maximo: (n) => `max ${n}`,
  minimo: (n) => `min ${n}`,
  numero: 'numero',
  entero: 'entero',
  menorQue: (n) => `<= ${n}`,
  mayorQue: (n) => `>= ${n}`,
  longitudMin: (n) => `len >= ${n}`,
  longitudMax: (n) => `len <= ${n}`,
  formato: 'formato',
  iri: 'iri',
  anidado: 'anidado',
}

function campo(p: Partial<Campo> & Pick<Campo, 'id' | 'tipo'>): Campo {
  return {
    ruta: `https://example.org/${p.id}`,
    etiqueta: p.id,
    ayuda: null,
    datatype: null,
    cardinalidad: { min: 0, max: null },
    restricciones: {
      minInclusive: null, maxInclusive: null, minExclusive: null, maxExclusive: null,
      minLength: null, maxLength: null, pattern: null,
    },
    grupo: null,
    orden: 0,
    modulo: null,
    widget: null,
    oculto: false,
    valores: null,
    clases: null,
    clasesCreables: null,
    subformulario: null,
    enlaceInverso: null,
    valorPorDefecto: null,
    ...p,
  } as Campo
}

const relacion = campo({
  id: 'rpg:hasRelationship',
  tipo: 'objeto',
  subformulario: {
    clase: 'rpg:Relationship', clases: [], etiqueta: 'Relación', descripcion: null, grupos: [], variantes: [],
    campos: [
      campo({ id: 'rpg:source', tipo: 'referencia', oculto: true, cardinalidad: { min: 1, max: 1 } }),
      campo({ id: 'rpg:target', tipo: 'referencia', cardinalidad: { min: 1, max: 1 } }),
      campo({
        id: 'rpg:strength', tipo: 'entero', cardinalidad: { min: 0, max: 1 },
        restricciones: { minInclusive: -3, maxInclusive: 3, minExclusive: null, maxExclusive: null, minLength: null, maxLength: null, pattern: null },
      }),
    ],
  } as Formulario,
})

const form = {
  clase: 'rpg:PlayerCharacter', clases: [], etiqueta: 'PJ', descripcion: null, grupos: [], variantes: [],
  campos: [
    campo({ id: 'rdfs:label', tipo: 'texto', cardinalidad: { min: 1, max: 1 } }),
    campo({ id: 'vtm:hunger', tipo: 'entero', widget: 'puntos', valorPorDefecto: 1,
      restricciones: { minInclusive: 0, maxInclusive: 5, minExclusive: null, maxExclusive: null, minLength: null, maxLength: null, pattern: null } }),
    campo({ id: 'rpg:locatedIn', tipo: 'referencia', cardinalidad: { min: 0, max: 1 } }),
    campo({ id: 'rpg:inspiredBy', tipo: 'iri' }),
    relacion,
  ],
} as unknown as Formulario

describe('validateValues', () => {
  it('detecta obligatorios, rangos e IRIs', () => {
    const values: FormValues = { 'vtm:hunger': [9], 'rpg:inspiredBy': ['no es una iri'] }
    const errs = validateValues(form, values, M)
    expect(errs['rdfs:label']).toEqual(['requerido'])
    expect(errs['vtm:hunger']).toEqual(['<= 5'])
    expect(errs['rpg:inspiredBy']).toEqual(['iri'])
  })

  it('valida los nodos anidados y marca el campo padre', () => {
    const values: FormValues = {
      'rdfs:label': ['Lucía'],
      'rpg:hasRelationship': [{ kind: 'nested', key: 'k1', valores: { 'rpg:strength': [7] } }],
    }
    const errs = validateValues(form, values, M)
    expect(errs['rpg:hasRelationship']).toEqual(['anidado'])
    expect(errs['rpg:hasRelationship#k1.rpg:target']).toEqual(['requerido'])
    expect(errs['rpg:hasRelationship#k1.rpg:strength']).toEqual(['<= 3'])
  })

  it('no exige campos ocultos', () => {
    const values: FormValues = {
      'rdfs:label': ['Lucía'],
      'rpg:hasRelationship': [
        { kind: 'nested', key: 'k1', valores: { 'rpg:target': [{ kind: 'ref', ref: 'don', etiqueta: 'Don' }] } },
      ],
    }
    expect(validateValues(form, values, M)).toEqual({})
  })
})

describe('toEntrada', () => {
  it('convierte referencias, anidados y descarta textos vacíos', () => {
    const values: FormValues = {
      'rdfs:label': ['  Lucía  '],
      'rpg:locatedIn': [{ kind: 'ref', ref: 'madrid', etiqueta: 'Madrid' }],
      'rpg:inspiredBy': [''],
      'rpg:hasRelationship': [
        {
          kind: 'nested', key: 'k', iri: 'https://x/e/lucia/n/1',
          valores: { 'rpg:target': [{ kind: 'ref', ref: 'don', etiqueta: 'Don' }], 'rpg:strength': [-2] },
        },
      ],
    }
    expect(toEntrada(form, ['rpg:PlayerCharacter'], values)).toEqual({
      clases: ['rpg:PlayerCharacter'],
      valores: {
        'rdfs:label': ['Lucía'],
        'vtm:hunger': [],
        'rpg:locatedIn': ['madrid'],
        'rpg:inspiredBy': [],
        'rpg:hasRelationship': [{ iri: 'https://x/e/lucia/n/1', valores: { 'rpg:target': ['don'], 'rpg:strength': [-2] } }],
      },
    })
  })
})

describe('initialValuesForNew', () => {
  it('aplica los valores por defecto', () => {
    expect(initialValuesForNew(form)).toEqual({ 'vtm:hunger': [1] })
  })
})

describe('mapServerErrors', () => {
  it('reparte errores SHACL entre campos, anidados y generales', () => {
    const r = mapServerErrors(
      form,
      [
        { foco: null, focoId: 'lucia', campo: 'rpg:locatedIn', mensaje: 'Debe ser: Lugar', severidad: 'violacion', valor: null },
        { foco: null, focoId: 'lucia/n/1', campo: 'rpg:target', mensaje: 'Debe ser: Personaje', severidad: 'violacion', valor: null },
        { foco: null, focoId: 'lucia', campo: null, mensaje: 'No se permite owl:sameAs', severidad: 'violacion', valor: null },
      ],
      'lucia',
    )
    expect(r.porCampo['rpg:locatedIn']).toEqual(['Debe ser: Lugar'])
    expect(r.porCampo['rpg:hasRelationship']).toEqual(['Debe ser: Personaje'])
    expect(r.generales).toEqual(['No se permite owl:sameAs'])
  })
})
