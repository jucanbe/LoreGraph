import { describe, expect, it } from 'vitest'
import type { EntidadRef, Mapa } from '@/api/hooks'
import { latLngANormalizado, limitesImagen, normalizadoALatLng, redondear } from './coords'
import { aEntrada, anadir, colorSeguro, desdeMapa, hayCambios, mover, quitar } from './markers'

const dims = { ancho: 800, alto: 600 }

describe('coords', () => {
  it('los límites cubren la imagen', () => {
    expect(limitesImagen(dims)).toEqual([
      [0, 0],
      [600, 800],
    ])
  })

  it('la esquina superior izquierda normalizada es lat = alto, lng = 0', () => {
    expect(normalizadoALatLng({ x: 0, y: 0 }, dims)).toEqual([600, 0])
    expect(normalizadoALatLng({ x: 1, y: 1 }, dims)).toEqual([0, 800])
    expect(normalizadoALatLng({ x: 0.25, y: 0.5 }, dims)).toEqual([300, 200])
  })

  it('la conversión inversa recupera las coordenadas', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 0.25, y: 0.75 },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 1 },
    ]) {
      const [lat, lng] = normalizadoALatLng(p, dims)
      const n = latLngANormalizado(lat, lng, dims)
      expect(n.x).toBeCloseTo(p.x)
      expect(n.y).toBeCloseTo(p.y)
    }
  })

  it('recorta fuera de la imagen y tolera dimensiones nulas', () => {
    expect(latLngANormalizado(700, -50, dims)).toEqual({ x: 0, y: 0 })
    expect(latLngANormalizado(-10, 900, dims)).toEqual({ x: 1, y: 1 })
    expect(latLngANormalizado(10, 10, { ancho: 0, alto: 0 })).toEqual({ x: 0, y: 0 })
    expect(normalizadoALatLng({ x: 2, y: -1 }, dims)).toEqual([600, 800])
  })

  it('redondea a 6 decimales', () => {
    expect(redondear(0.123456789)).toBe(0.123457)
    expect(redondear(Number.NaN)).toBe(0)
  })
})

const ref = (id: string): EntidadRef => ({
  id,
  iri: `https://x/${id}`,
  etiqueta: id,
  tipo: null,
  descripcion: null,
  editable: true,
  modificada: null,
})

const mapa: Mapa = {
  entidad: ref('plano'),
  imagen: { nodo: 'n', url: '/media/a.png', origen: null },
  marcadores: [
    { nodo: 'm1', entidad: ref('lucia'), x: 0.1, y: 0.2 },
    { nodo: 'm2', entidad: ref('taberna'), x: 0.5, y: 0.5 },
  ],
}

describe('marcadores', () => {
  it('añade, mueve y quita y produce el cuerpo completo del PUT', () => {
    let b = desdeMapa(mapa)
    expect(hayCambios(b, mapa)).toBe(false)
    b = mover(b, 'm1', 0.3, 0.4)
    b = quitar(b, 'm2')
    b = anadir(b, ref('rastro'), 0.9999999, 0.0000001)
    expect(hayCambios(b, mapa)).toBe(true)
    expect(aEntrada(b)).toEqual([
      { entidad: 'lucia', x: 0.3, y: 0.4 },
      { entidad: 'rastro', x: 1, y: 0 },
    ])
  })

  it('solo acepta colores CSS seguros', () => {
    expect(colorSeguro('#abc')).toBe('#abc')
    expect(colorSeguro('oklch(0.6 0.1 200)')).toBe('oklch(0.6 0.1 200)')
    expect(colorSeguro('red"><script>')).toBe('#6366f1')
    expect(colorSeguro(null, '#000')).toBe('#000')
  })
})
