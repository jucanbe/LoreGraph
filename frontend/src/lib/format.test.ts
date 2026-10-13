import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadText, formatDate, relativeTime, toCsv } from './format'

describe('toCsv', () => {
  it('escapa comas, comillas y saltos de línea (RFC 4180) y separa filas con CRLF', () => {
    const csv = toCsv(['nombre', 'nota'], [
      ['Lucía', 'sin problemas'],
      ['Larra, padre', 'dijo "hola"'],
      ['multi', 'línea 1\nlínea 2'],
    ])
    expect(csv).toBe(
      'nombre,nota\r\nLucía,sin problemas\r\n"Larra, padre","dijo ""hola"""\r\nmulti,"línea 1\nlínea 2"',
    )
  })

  it('solo cabeceras', () => {
    expect(toCsv(['a', 'b'], [])).toBe('a,b')
  })
})

describe('relativeTime', () => {
  const ahora = new Date('2026-10-13T12:00:00Z').getTime()
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(ahora)
  })
  afterEach(() => vi.useRealTimers())

  it('vacío sin fecha', () => {
    expect(relativeTime(null, 'es')).toBe('')
    expect(relativeTime(0, 'es')).toBe('')
  })

  it('elige la unidad adecuada en español e inglés', () => {
    const s = ahora / 1000
    expect(relativeTime(s - 30, 'es')).toBe('este minuto')
    expect(relativeTime(s - 5 * 60, 'es')).toBe('hace 5 minutos')
    expect(relativeTime(s - 3 * 3600, 'es')).toBe('hace 3 horas')
    expect(relativeTime(s - 86400, 'es')).toBe('ayer')
    expect(relativeTime(s + 2 * 86400, 'es')).toBe('pasado mañana')
    expect(relativeTime(s - 400 * 86400, 'es')).toBe('el año pasado')
    expect(relativeTime(s - 2 * 3600, 'en')).toBe('2 hours ago')
  })
})

describe('formatDate', () => {
  it('formatea ISO y devuelve el texto original si no es una fecha', () => {
    expect(formatDate(null, 'es')).toBe('')
    expect(formatDate('no-es-fecha', 'es')).toBe('no-es-fecha')
    expect(formatDate('2026-10-13T12:00:00Z', 'es')).toMatch(/13 de octubre de 2026/)
    expect(formatDate('2026-10-13T12:00:00Z', 'en', true)).toMatch(/Oct 13, 2026/)
  })
})

describe('downloadText', () => {
  it('crea un enlace de descarga con un blob y lo retira', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    downloadText('datos.csv', 'a,b', 'text/csv')
    expect(create).toHaveBeenCalledOnce()
    const blob = create.mock.calls[0]?.[0] as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8')
    expect(click).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download="datos.csv"]')).toBeNull()
    vi.restoreAllMocks()
  })
})
