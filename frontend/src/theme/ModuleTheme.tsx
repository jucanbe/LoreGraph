import { useEffect } from 'react'
import { assetUrl } from '@/api/client'
import type { TemaActivo } from '@/api/hooks'

/** Tokens de tema que un módulo puede redefinir (variables CSS de shadcn/ui). */
export const THEME_TOKENS = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring',
  'sidebar', 'sidebar-foreground',
] as const

const STYLE_ID = 'loregraph-module-theme'
const FONTS_ID = 'loregraph-module-fonts'

function declarations(palette: Record<string, string>): string {
  return Object.entries(palette)
    .filter(([k, v]) => (THEME_TOKENS as readonly string[]).includes(k) && /^[#\w(),.%\s/-]+$/.test(v))
    .map(([k, v]) => `--${k}: ${v};`)
    .join(' ')
}

/** Construye la hoja de estilos de un tema de módulo (exportado para los tests). */
export function buildThemeCss(activo: TemaActivo): string {
  const { tema } = activo
  const parts: string[] = []
  const fonts: string[] = []
  if (tema.fuentes?.texto) fonts.push(`--app-font-sans: ${tema.fuentes.texto};`)
  if (tema.fuentes?.titulos) fonts.push(`--app-font-heading: ${tema.fuentes.titulos};`)
  if (tema.radio) fonts.push(`--radius: ${tema.radio};`)
  parts.push(`:root { ${declarations(tema.claro ?? {})} ${fonts.join(' ')} }`)
  parts.push(`:root.dark { ${declarations(tema.oscuro ?? {})} }`)
  for (const f of tema.fuentes?.archivos ?? []) {
    const url = assetUrl(activo.urlBaseAssets, f.archivo)
    parts.push(
      `@font-face { font-family: '${f.familia}'; src: url('${url}'); font-weight: ${f.peso}; font-style: ${f.estilo}; font-display: swap; }`,
    )
  }
  return parts.join('\n')
}

/**
 * Aplica el tema visual que declara el módulo de la campaña. El frontend no
 * conoce ningún módulo: solo traduce el manifiesto a variables CSS.
 */
export function ModuleTheme({ tema }: { tema: TemaActivo | null | undefined }) {
  useEffect(() => {
    if (!tema) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = buildThemeCss(tema)
    document.head.appendChild(style)

    let link: HTMLLinkElement | null = null
    const families = tema.tema.fuentes?.google ?? []
    if (families.length) {
      link = document.createElement('link')
      link.id = FONTS_ID
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`
      document.head.appendChild(link)
    }
    document.documentElement.dataset.modulo = tema.modulo
    return () => {
      style.remove()
      link?.remove()
      delete document.documentElement.dataset.modulo
    }
  }, [tema])
  return null
}
