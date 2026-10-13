/** Puntos de la barra temporal a partir de la línea de sesiones. */
import type { SesionLinea } from '@/api/hooks'

export interface PuntoTemporal {
  numero: number
  etiqueta: string
  fecha?: string | null
}

/** Sesiones numeradas, sin duplicados y en orden ascendente. */
export function puntosTemporales(sesiones: SesionLinea[]): PuntoTemporal[] {
  const porNumero = new Map<number, PuntoTemporal>()
  for (const s of sesiones) {
    const n = s.sesion.numero
    if (n === null || n === undefined || porNumero.has(n)) continue
    porNumero.set(n, { numero: n, etiqueta: s.sesion.entidad.etiqueta, fecha: s.sesion.fecha })
  }
  return [...porNumero.values()].sort((a, b) => a.numero - b.numero)
}
