/**
 * Resolución de colores CSS (oklch, lab, var()…) a rgb(), que es lo que
 * entiende Cytoscape. Se pinta un píxel en un canvas y se lee su valor.
 */
import { useEffect, useState, type RefObject } from 'react'
import { FALLBACK_PALETTE, type GraphPalette } from './graph-style'

const SIMPLE = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i
const cache = new Map<string, string | null>()
let ctx: CanvasRenderingContext2D | null | undefined

function context(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    ctx = canvas.getContext('2d', { willReadFrequently: true })
  } catch {
    ctx = null
  }
  return ctx
}

/** Devuelve el color en un formato admitido por Cytoscape, o `null` si no se puede resolver. */
export function resolveCssColor(value: string | null | undefined): string | null {
  const v = value?.trim()
  if (!v) return null
  if (SIMPLE.test(v) && !/^(oklch|oklab|lab|lch|color)\b/i.test(v)) return v
  const hit = cache.get(v)
  if (hit !== undefined) return hit
  const c = context()
  let out: string | null = null
  if (c) {
    c.clearRect(0, 0, 1, 1)
    c.fillStyle = '#000'
    c.fillStyle = v
    c.fillRect(0, 0, 1, 1)
    const d = c.getImageData(0, 0, 1, 1).data
    const [r = 0, g = 0, b = 0, a = 255] = d
    out = a >= 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
  }
  cache.set(v, out)
  return out
}

/** Igual que `resolveCssColor`, con respaldo garantizado. */
export function toCyColor(value: string, fallback = '#888888'): string {
  return resolveCssColor(value) ?? fallback
}

/** Lee las variables del tema (shadcn/ui) desde un elemento y las resuelve. */
export function readPalette(el: Element | null = null): GraphPalette {
  if (typeof window === 'undefined') return FALLBACK_PALETTE
  const cs = getComputedStyle(el ?? document.documentElement)
  const get = (name: string, fb: string) => resolveCssColor(cs.getPropertyValue(name)) ?? fb
  const dark = document.documentElement.classList.contains('dark')
  return {
    foreground: get('--foreground', dark ? '#f3f4f6' : FALLBACK_PALETTE.foreground),
    background: get('--background', dark ? '#0b0b0f' : FALLBACK_PALETTE.background),
    muted: get('--muted-foreground', FALLBACK_PALETTE.muted),
    border: get('--border', dark ? '#4b5563' : FALLBACK_PALETTE.border),
    primary: get('--primary', FALLBACK_PALETTE.primary),
    destructive: get('--destructive', FALLBACK_PALETTE.destructive),
    warning: dark ? '#fbbf24' : FALLBACK_PALETTE.warning,
  }
}

function samePalette(a: GraphPalette, b: GraphPalette): boolean {
  return (Object.keys(a) as (keyof GraphPalette)[]).every((k) => a[k] === b[k])
}

/**
 * Paleta del tema que se actualiza al cambiar claro/oscuro (clase `dark` en
 * <html>) o al aplicarse un tema de módulo (nueva hoja <style> en <head>).
 */
export function useGraphPalette(ref?: RefObject<Element | null>): GraphPalette {
  const [palette, setPalette] = useState<GraphPalette>(() => readPalette())
  useEffect(() => {
    const update = () => {
      const next = readPalette(ref?.current ?? null)
      setPalette((prev) => (samePalette(prev, next) ? prev : next))
    }
    update()
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    mo.observe(document.head, { childList: true })
    return () => mo.disconnect()
  }, [ref])
  return palette
}
