/** Estado de edición de los marcadores de un mapa (funciones puras). */
import type { EntidadRef, Mapa, MarcadorEntrada } from '@/api/hooks'
import { redondear } from './coords'

export interface MarcadorBorrador {
  /** Clave estable en la interfaz (el nodo del backend o una generada). */
  clave: string
  entidad: EntidadRef
  x: number
  y: number
}

let contador = 0
function nuevaClave(): string {
  contador += 1
  return `nuevo-${contador}`
}

export function desdeMapa(mapa: Mapa): MarcadorBorrador[] {
  return mapa.marcadores.map((m, i) => ({
    clave: m.nodo ?? `${m.entidad.id}-${i}`,
    entidad: m.entidad,
    x: m.x,
    y: m.y,
  }))
}

export function anadir(lista: MarcadorBorrador[], entidad: EntidadRef, x: number, y: number): MarcadorBorrador[] {
  return [...lista, { clave: nuevaClave(), entidad, x: redondear(x), y: redondear(y) }]
}

export function mover(lista: MarcadorBorrador[], clave: string, x: number, y: number): MarcadorBorrador[] {
  return lista.map((m) => (m.clave === clave ? { ...m, x: redondear(x), y: redondear(y) } : m))
}

export function quitar(lista: MarcadorBorrador[], clave: string): MarcadorBorrador[] {
  return lista.filter((m) => m.clave !== clave)
}

/** Cuerpo del `PUT …/marcadores`: el conjunto completo, con coordenadas normalizadas. */
export function aEntrada(lista: MarcadorBorrador[]): MarcadorEntrada[] {
  return lista.map((m) => ({ entidad: m.entidad.id, x: redondear(m.x), y: redondear(m.y) }))
}

/** ¿Difiere el borrador de lo guardado? */
export function hayCambios(lista: MarcadorBorrador[], mapa: Mapa): boolean {
  const a = JSON.stringify(aEntrada(lista))
  const b = JSON.stringify(aEntrada(desdeMapa(mapa)))
  return a !== b
}

const COLOR_VALIDO = /^#[0-9a-f]{3,8}$|^(rgb|hsl|oklch)a?\([\d\s.,%/-]+\)$|^[a-z]+$/i

/** Color CSS seguro para incrustar en el HTML del icono, o el de reserva. */
export function colorSeguro(color: string | null | undefined, reserva = '#6366f1'): string {
  return color && COLOR_VALIDO.test(color.trim()) ? color.trim() : reserva
}
