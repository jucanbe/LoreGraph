/**
 * Iconos de lucide como imágenes SVG (data URI) para el interior de los nodos
 * de Cytoscape. El nombre del icono viene del manifiesto del módulo.
 */
import { dynamicIconImports, type IconName } from 'lucide-react/dynamic'

type IconAttrs = Record<string, unknown>
type IconNode = [string, IconAttrs] | [string, IconAttrs, IconNode[]]

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function nodeToSvg([tag, attrs, children]: IconNode): string {
  const a = Object.entries(attrs)
    .filter(([k, v]) => k !== 'key' && v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
    .join(' ')
  const inner = children?.map(nodeToSvg).join('') ?? ''
  return `<${tag} ${a}>${inner}</${tag}>`
}

/** SVG completo de un icono de lucide a partir de sus nodos (función pura). */
export function iconSvg(nodes: IconNode[], color: string, size = 24): string {
  const body = nodes.map(nodeToSvg).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${escapeAttr(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  )
}

export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const uris = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(dynamicIconImports, name)
}

/** URI ya cargada (síncrono), o `undefined`. */
export function cachedIconUri(name: string): string | undefined {
  return uris.get(name)
}

/** Carga (una sola vez) el icono y devuelve su data URI blanco, o `null` si no existe. */
export function loadIconUri(name: string, color = '#ffffff'): Promise<string | null> {
  const hit = uris.get(name)
  if (hit) return Promise.resolve(hit)
  const inflight = pending.get(name)
  if (inflight) return inflight
  if (!isIconName(name)) return Promise.resolve(null)
  const p = dynamicIconImports[name]()
    .then((mod) => {
      const data = (mod as { __iconData?: { node: unknown } }).__iconData
      if (!data || !Array.isArray(data.node)) return null
      const uri = svgToDataUri(iconSvg(data.node as IconNode[], color))
      uris.set(name, uri)
      return uri
    })
    .catch(() => null)
    .finally(() => pending.delete(name))
  pending.set(name, p)
  return p
}
