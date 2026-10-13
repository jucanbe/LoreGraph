/**
 * Modelo del formulario dinámico: valores en edición, conversión desde/hacia la
 * API y validación en cliente a partir de las restricciones del esquema SHACL.
 */
import type { Campo, Entidad, EntidadEntrada, Formulario, Valor } from '@/api/hooks'
import type { Schemas } from '@/api/client'

type CampoValores = Schemas['CampoValores']

/** Referencia a otra entidad: id (o IRI/clave) más la etiqueta para mostrarla. */
export interface RefValue {
  kind: 'ref'
  ref: string
  etiqueta: string
  tipo?: Schemas['ClaseRef'] | null
}

/** Nodo anidado (relación cualificada, disciplina…). */
export interface NestedValue {
  kind: 'nested'
  iri?: string
  valores: FormValues
  /** Clave estable para React. */
  key: string
}

export type ScalarValue = string | number | boolean
export type FieldValue = ScalarValue | RefValue | NestedValue
export type FormValues = Record<string, FieldValue[]>
export type FieldErrors = Record<string, string[]>

let counter = 0
export const newKey = () => `n${++counter}`

export function isRef(v: FieldValue): v is RefValue {
  return typeof v === 'object' && v !== null && (v as RefValue).kind === 'ref'
}

export function isNested(v: FieldValue): v is NestedValue {
  return typeof v === 'object' && v !== null && (v as NestedValue).kind === 'nested'
}

export function visibleFields(form: Pick<Formulario, 'campos'>): Campo[] {
  return form.campos.filter((c) => !c.oculto)
}

export function isMulti(c: Campo): boolean {
  return c.cardinalidad.max == null || c.cardinalidad.max > 1
}

// ------------------------------------------------------------ desde la API
function fromValor(c: Campo, v: Valor): FieldValue | null {
  switch (c.tipo) {
    case 'referencia':
      return { kind: 'ref', ref: v.id ?? String(v.valor), etiqueta: v.etiqueta, tipo: v.clase }
    case 'objeto':
      return {
        kind: 'nested',
        iri: typeof v.valor === 'string' ? v.valor : undefined,
        valores: c.subformulario ? fromCampoValores(c.subformulario, v.campos ?? []) : {},
        key: newKey(),
      }
    case 'enum':
    case 'iri':
      return String(v.valor)
    default:
      if (typeof v.valor === 'number' || typeof v.valor === 'boolean' || typeof v.valor === 'string') return v.valor
      return v.etiqueta
  }
}

function fromCampoValores(form: Pick<Formulario, 'campos'>, campos: CampoValores[]): FormValues {
  const byId = new Map(campos.map((cv) => [cv.id, cv]))
  const out: FormValues = {}
  for (const c of visibleFields(form)) {
    const cv = byId.get(c.id)
    if (!cv) continue
    out[c.id] = cv.valores.map((v) => fromValor(c, v)).filter((x): x is FieldValue => x !== null)
  }
  return out
}

/** Valores iniciales para editar una entidad existente. */
export function initialValuesFromEntity(form: Formulario, entidad: Entidad): FormValues {
  const out: FormValues = {}
  for (const c of visibleFields(form)) {
    const vals = entidad.valores[c.id]
    if (!vals?.length) continue
    out[c.id] = vals.map((v) => fromValor(c, v)).filter((x): x is FieldValue => x !== null)
  }
  return out
}

/** Valores iniciales para una entidad nueva (aplica `valorPorDefecto`). */
export function initialValuesForNew(form: Pick<Formulario, 'campos'>): FormValues {
  const out: FormValues = {}
  for (const c of visibleFields(form)) {
    if (c.valorPorDefecto != null && c.tipo !== 'referencia' && c.tipo !== 'objeto') {
      const d = c.valorPorDefecto as ScalarValue
      if (c.tipo === 'enum') {
        const opt = c.valores?.find((o) => o.clave === d || o.valor === d)
        out[c.id] = [opt ? String(opt.valor) : String(d)]
      } else {
        out[c.id] = [d]
      }
    }
  }
  return out
}

// -------------------------------------------------------------- hacia la API
type ApiValue = string | number | boolean | { iri?: string; valores: Record<string, ApiValue[]> }

function toApiValues(form: Pick<Formulario, 'campos'>, values: FormValues): Record<string, ApiValue[]> {
  const out: Record<string, ApiValue[]> = {}
  for (const c of visibleFields(form)) {
    const vals = values[c.id] ?? []
    const converted: ApiValue[] = []
    for (const v of vals) {
      if (isRef(v)) converted.push(v.ref)
      else if (isNested(v)) {
        const sub = c.subformulario
        converted.push({ ...(v.iri ? { iri: v.iri } : {}), valores: sub ? toApiValues(sub, v.valores) : {} })
      } else if (typeof v === 'string') {
        if (v.trim() !== '') converted.push(v.trim())
      } else converted.push(v)
    }
    out[c.id] = converted
  }
  return out
}

export function toEntrada(form: Formulario, clases: string[], values: FormValues, id?: string): EntidadEntrada {
  return { clases, valores: toApiValues(form, values), ...(id ? { id } : {}) }
}

// --------------------------------------------------------------- validación
export interface Messages {
  requerido: string
  maximo: (n: number) => string
  minimo: (n: number) => string
  numero: string
  entero: string
  menorQue: (n: number) => string
  mayorQue: (n: number) => string
  longitudMin: (n: number) => string
  longitudMax: (n: number) => string
  formato: string
  iri: string
  anidado: string
}

function present(v: FieldValue): boolean {
  if (typeof v === 'string') return v.trim() !== ''
  return v !== null && v !== undefined
}

/** Valida en cliente (las restricciones SHACL que se pueden comprobar sin el grafo). */
export function validateValues(form: Pick<Formulario, 'campos'>, values: FormValues, m: Messages, prefix = ''): FieldErrors {
  const errors: FieldErrors = {}
  const add = (id: string, msg: string) => {
    const key = prefix + id
    errors[key] = [...(errors[key] ?? []), msg]
  }
  for (const c of visibleFields(form)) {
    const vals = (values[c.id] ?? []).filter(present)
    const { min, max } = c.cardinalidad
    if (min > 0 && vals.length < min) add(c.id, min === 1 ? m.requerido : m.minimo(min))
    if (max != null && vals.length > max) add(c.id, m.maximo(max))
    const r = c.restricciones
    for (const v of vals) {
      if (c.tipo === 'entero' || c.tipo === 'decimal') {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
        if (Number.isNaN(n)) {
          add(c.id, m.numero)
          continue
        }
        if (c.tipo === 'entero' && !Number.isInteger(n)) add(c.id, m.entero)
        if (r.minInclusive != null && n < r.minInclusive) add(c.id, m.mayorQue(r.minInclusive))
        if (r.maxInclusive != null && n > r.maxInclusive) add(c.id, m.menorQue(r.maxInclusive))
      }
      if (typeof v === 'string') {
        if (r.minLength != null && v.length < r.minLength) add(c.id, m.longitudMin(r.minLength))
        if (r.maxLength != null && v.length > r.maxLength) add(c.id, m.longitudMax(r.maxLength))
        if (r.pattern) {
          try {
            if (!new RegExp(r.pattern).test(v)) add(c.id, m.formato)
          } catch {
            /* patrón no compatible con JavaScript: lo valida el servidor */
          }
        }
        if (c.tipo === 'iri' && !/^(https?|urn):\S+$/.test(v.trim())) add(c.id, m.iri)
      }
      if (isNested(v) && c.subformulario) {
        const sub = validateValues(c.subformulario, v.valores, m, `${prefix}${c.id}#${v.key}.`)
        if (Object.keys(sub).length) {
          Object.assign(errors, sub)
          add(c.id, m.anidado)
        }
      }
    }
  }
  return errors
}

/** Reparte los errores del servidor (SHACL) entre los campos; devuelve también los generales. */
export function mapServerErrors(
  form: Pick<Formulario, 'campos'>,
  errores: Schemas['ErrorValidacion'][],
  entityId: string | undefined,
): { porCampo: FieldErrors; generales: string[] } {
  const ids = new Set(visibleFields(form).map((c) => c.id))
  const nestedOwner = new Map<string, string>()
  for (const c of form.campos) for (const sc of c.subformulario?.campos ?? []) nestedOwner.set(sc.id, c.id)
  const porCampo: FieldErrors = {}
  const generales: string[] = []
  for (const e of errores) {
    const campo = e.campo ?? ''
    const isMain = !e.focoId || !entityId || e.focoId === entityId || !e.focoId.includes('/n/')
    const base = campo.split('.').pop() ?? campo
    if (campo && isMain && ids.has(campo)) {
      porCampo[campo] = [...(porCampo[campo] ?? []), e.mensaje]
    } else if (campo.includes('.') && ids.has(campo.split('.')[0]!)) {
      const owner = campo.split('.')[0]!
      porCampo[owner] = [...(porCampo[owner] ?? []), `${base}: ${e.mensaje}`]
    } else if (nestedOwner.has(base) && !isMain) {
      const owner = nestedOwner.get(base)!
      porCampo[owner] = [...(porCampo[owner] ?? []), e.mensaje]
    } else {
      generales.push(campo ? `${campo}: ${e.mensaje}` : e.mensaje)
    }
  }
  return { porCampo, generales }
}
