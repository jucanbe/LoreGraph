/**
 * Conversión entre coordenadas normalizadas de un marcador y coordenadas de
 * Leaflet con `CRS.Simple`.
 *
 * Convenio:
 * - Normalizadas (lo que guarda el backend): `x, y ∈ [0, 1]` desde la esquina
 *   superior izquierda de la imagen; `x` crece hacia la derecha, `y` hacia abajo.
 * - Leaflet (`CRS.Simple`): la imagen ocupa `[[0, 0], [alto, ancho]]`; `lat`
 *   crece hacia arriba (0 abajo, `alto` arriba) y `lng` hacia la derecha.
 *
 * Por tanto: `lat = alto · (1 − y)` y `lng = ancho · x`.
 */

export type LatLngTuple = [number, number]

export interface Normalizado {
  x: number
  y: number
}

export interface Dimensiones {
  ancho: number
  alto: number
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** Límites de la imagen en coordenadas de Leaflet. */
export function limitesImagen({ ancho, alto }: Dimensiones): [LatLngTuple, LatLngTuple] {
  return [
    [0, 0],
    [alto, ancho],
  ]
}

/** Normalizadas → `[lat, lng]`. */
export function normalizadoALatLng({ x, y }: Normalizado, { ancho, alto }: Dimensiones): LatLngTuple {
  return [alto * (1 - clamp01(y)), ancho * clamp01(x)]
}

/** `[lat, lng]` → normalizadas, recortadas al interior de la imagen. */
export function latLngANormalizado(lat: number, lng: number, { ancho, alto }: Dimensiones): Normalizado {
  if (ancho <= 0 || alto <= 0) return { x: 0, y: 0 }
  return { x: clamp01(lng / ancho), y: clamp01(1 - lat / alto) }
}

/** Redondea una coordenada normalizada (6 decimales bastan: < 1 px en imágenes de 100 000 px). */
export function redondear(v: number): number {
  return Math.round(clamp01(v) * 1e6) / 1e6
}
