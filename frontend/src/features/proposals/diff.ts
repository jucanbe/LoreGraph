/**
 * Agrupa las tripletas legibles de una propuesta para mostrarlas como un diff
 * comprensible: por sujeto, con los `rdf:type` aparte (se pintan como insignias)
 * y los nodos cualificados (`…/n/…`) anidados bajo la línea que los referencia
 * o, si no la hay, bajo su entidad propietaria.
 */
import type { Termino, TripletaLegible } from '@/api/hooks'
import { esNodoAnidado, propietario, RDF_TYPE } from './utils'

export interface LineaDiff {
  tripleta: TripletaLegible
  /** Nodo anidado que cuelga de esta línea (su objeto), si está en el mismo diff. */
  anidado?: GrupoDiff
}

export interface GrupoDiff {
  /** IRI del sujeto. */
  clave: string
  sujeto: Termino
  /** Tipos (`rdf:type`) que se añaden o eliminan para este sujeto. */
  tipos: Termino[]
  /** Resto de tripletas, en el orden de la API. */
  lineas: LineaDiff[]
  /** Nodos anidados sin línea que los referencie en el diff. */
  hijos: GrupoDiff[]
  /** ¿Es un nodo cualificado anidado? */
  anidado: boolean
}

export function agruparTripletas(tripletas: TripletaLegible[]): GrupoDiff[] {
  const grupos = new Map<string, GrupoDiff>()
  for (const t of tripletas) {
    const clave = t.sujeto.valor
    let g = grupos.get(clave)
    if (!g) {
      g = { clave, sujeto: t.sujeto, tipos: [], lineas: [], hijos: [], anidado: esNodoAnidado(clave) }
      grupos.set(clave, g)
    }
    if (t.predicado.valor === RDF_TYPE && t.objeto.tipo === 'iri') g.tipos.push(t.objeto)
    else g.lineas.push({ tripleta: t })
  }

  const padre = new Map<string, string>()
  /** ¿`ancestro` está por encima de `clave` en el árbol ya construido? (evita ciclos) */
  const desciende = (clave: string, ancestro: string): boolean => {
    let actual: string | undefined = clave
    const vistos = new Set<string>()
    while (actual && !vistos.has(actual)) {
      if (actual === ancestro) return true
      vistos.add(actual)
      actual = padre.get(actual)
    }
    return false
  }

  for (const g of grupos.values()) {
    if (!g.anidado) continue
    // 1) Una línea de otro grupo cuyo objeto es este nodo.
    let colocado = false
    for (const otro of grupos.values()) {
      if (otro === g || desciende(otro.clave, g.clave)) continue
      const linea = otro.lineas.find((l) => !l.anidado && l.tripleta.objeto.valor === g.clave)
      if (linea) {
        linea.anidado = g
        padre.set(g.clave, otro.clave)
        colocado = true
        break
      }
    }
    if (colocado) continue
    // 2) Su entidad propietaria, si también aparece en el diff.
    const dueno = propietario(g.clave)
    const grupoDueno = dueno ? grupos.get(dueno) : undefined
    if (grupoDueno && !desciende(grupoDueno.clave, g.clave)) {
      grupoDueno.hijos.push(g)
      padre.set(g.clave, grupoDueno.clave)
    }
  }

  return [...grupos.values()].filter((g) => !padre.has(g.clave))
}

const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label'

/**
 * IRIs de entidades que la propuesta crea: se les añade a la vez un tipo y un
 * nombre (`rdfs:label`) y no son nodos anidados. Aún no existen en el canon,
 * así que no se enlazan a su ficha.
 */
export function entidadesNuevas(anadidas: TripletaLegible[]): Set<string> {
  const conTipo = new Set<string>()
  const conNombre = new Set<string>()
  for (const t of anadidas) {
    if (esNodoAnidado(t.sujeto.valor)) continue
    if (t.predicado.valor === RDF_TYPE) conTipo.add(t.sujeto.valor)
    if (t.predicado.valor === RDFS_LABEL) conNombre.add(t.sujeto.valor)
  }
  return new Set([...conTipo].filter((iri) => conNombre.has(iri)))
}
