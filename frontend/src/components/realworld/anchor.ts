/** Utilidades puras para las anclas al mundo real (Wikidata/DBpedia). */
import type { MundoReal } from '@/api/hooks'

/** Miniatura de Wikimedia (Special:FilePath admite `width`); otras URLs se dejan igual. */
export function thumbnailUrl(imagen: string, width = 480): string {
  if (!/Special:FilePath/i.test(imagen) || /[?&]width=/.test(imagen)) return imagen
  return `${imagen}${imagen.includes('?') ? '&' : '?'}width=${width}`
}

/** Clave i18n de la relación de anclaje (rpg:inspiredBy, rpg:correspondsTo…). */
export function relacionKey(relacion: string): 'inspiradoEn' | 'correspondeA' | 'otra' {
  const local = relacion.slice(relacion.lastIndexOf(':') + 1).split(/[#/]/).pop() ?? ''
  if (local === 'inspiredBy') return 'inspiradoEn'
  if (local === 'correspondsTo') return 'correspondeA'
  return 'otra'
}

export function hasCoords(a: Pick<MundoReal, 'latitud' | 'longitud'>): a is { latitud: number; longitud: number } {
  return (
    typeof a.latitud === 'number' &&
    typeof a.longitud === 'number' &&
    Number.isFinite(a.latitud) &&
    Number.isFinite(a.longitud)
  )
}
