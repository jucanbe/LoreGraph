/**
 * Lienzo Leaflet de un mapa de campaña: la imagen subida como `ImageOverlay`
 * sobre `CRS.Simple` y los marcadores de entidades encima. Se carga de forma
 * diferida desde `MapView` para no engordar el resto de la aplicación.
 */
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImageOverlay, MapContainer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { useNavigate } from 'react-router'
import { latLngANormalizado, limitesImagen, normalizadoALatLng, type Dimensiones } from './coords'
import { colorSeguro } from './markers'

export interface MarcadorLienzo {
  clave: string
  etiqueta: string
  color: string | null
  href: string
  x: number
  y: number
}

export interface MapCanvasProps {
  imagen: string
  marcadores: MarcadorLienzo[]
  editando: boolean
  seleccionado?: string | null
  onAnadir: (x: number, y: number) => void
  onMover: (clave: string, x: number, y: number) => void
  onSeleccionar?: (clave: string) => void
}

/** Carga la imagen para conocer sus dimensiones naturales. */
function useDimensiones(url: string): { dims: Dimensiones | null; error: boolean } {
  const [estado, setEstado] = useState<{ url: string; dims: Dimensiones | null; error: boolean }>({
    url,
    dims: null,
    error: false,
  })
  useEffect(() => {
    let vivo = true
    const img = new Image()
    img.onload = () => {
      if (vivo) setEstado({ url, dims: { ancho: img.naturalWidth || 1000, alto: img.naturalHeight || 1000 }, error: false })
    }
    img.onerror = () => {
      if (vivo) setEstado({ url, dims: null, error: true })
    }
    img.src = url
    return () => {
      vivo = false
    }
  }, [url])
  return estado.url === url ? estado : { dims: null, error: false }
}

const iconos = new Map<string, L.DivIcon>()
function icono(color: string | null, activo: boolean): L.DivIcon {
  const c = colorSeguro(color)
  const k = `${c}|${activo}`
  let i = iconos.get(k)
  if (!i) {
    const tam = activo ? 22 : 18
    i = L.divIcon({
      className: 'loregraph-marcador',
      html: `<span style="display:block;width:${tam}px;height:${tam}px;border-radius:9999px;background:${c};border:3px solid #fff;box-shadow:0 0 0 ${activo ? 3 : 1}px rgba(0,0,0,.55),0 1px 4px rgba(0,0,0,.4)"></span>`,
      iconSize: [tam, tam],
      iconAnchor: [tam / 2, tam / 2],
      tooltipAnchor: [0, -tam / 2],
    })
    iconos.set(k, i)
  }
  return i
}

function Clics({ activo, dims, onAnadir }: { activo: boolean; dims: Dimensiones; onAnadir: (x: number, y: number) => void }) {
  useMapEvents({
    click(e) {
      if (!activo) return
      const { lat, lng } = e.latlng
      if (lat < 0 || lng < 0 || lat > dims.alto || lng > dims.ancho) return
      const n = latLngANormalizado(lat, lng, dims)
      onAnadir(n.x, n.y)
    },
  })
  return null
}

/** Cambia el cursor del mapa en modo edición. */
function Cursor({ editando }: { editando: boolean }) {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    el.style.cursor = editando ? 'crosshair' : ''
  }, [map, editando])
  return null
}

function MarcadorMapa({
  m,
  dims,
  editando,
  activo,
  onMover,
  onSeleccionar,
}: {
  m: MarcadorLienzo
  dims: Dimensiones
  editando: boolean
  activo: boolean
  onMover: MapCanvasProps['onMover']
  onSeleccionar?: MapCanvasProps['onSeleccionar']
}) {
  const navigate = useNavigate()
  const posicion = normalizadoALatLng(m, dims)
  const handlers = useMemo<L.LeafletEventHandlerFnMap>(
    () => ({
      // Leaflet también emite `click` al pulsar Intro sobre un marcador con foco.
      click: () => {
        if (editando) onSeleccionar?.(m.clave)
        else void navigate(m.href)
      },
      dragend: (e) => {
        const ll = (e.target as L.Marker).getLatLng()
        const n = latLngANormalizado(ll.lat, ll.lng, dims)
        onMover(m.clave, n.x, n.y)
      },
    }),
    [editando, navigate, m.href, m.clave, dims, onMover, onSeleccionar],
  )
  return (
    <Marker
      position={posicion}
      icon={icono(m.color, activo)}
      draggable={editando}
      eventHandlers={handlers}
      title={m.etiqueta}
      alt={m.etiqueta}
      keyboard
    >
      <Tooltip direction="top" permanent={activo}>
        {m.etiqueta}
      </Tooltip>
    </Marker>
  )
}

export default function MapCanvas({
  imagen,
  marcadores,
  editando,
  seleccionado,
  onAnadir,
  onMover,
  onSeleccionar,
}: MapCanvasProps) {
  const { t } = useTranslation('mapas')
  const { dims, error } = useDimensiones(imagen)

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-destructive" role="alert">
        {t('vista.errorImagen')}
      </div>
    )
  }
  if (!dims) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> {t('vista.cargandoImagen')}
      </div>
    )
  }

  const bounds = limitesImagen(dims)
  const margen = Math.max(dims.ancho, dims.alto) * 0.25
  const maxBounds: [[number, number], [number, number]] = [
    [-margen, -margen],
    [dims.alto + margen, dims.ancho + margen],
  ]
  return (
    <MapContainer
      key={imagen}
      crs={L.CRS.Simple}
      bounds={bounds}
      maxBounds={maxBounds}
      minZoom={-6}
      maxZoom={4}
      zoomSnap={0.25}
      attributionControl={false}
      className="h-full w-full bg-muted"
    >
      <ImageOverlay url={imagen} bounds={bounds} />
      <Clics activo={editando} dims={dims} onAnadir={onAnadir} />
      <Cursor editando={editando} />
      {marcadores.map((m) => (
        <MarcadorMapa
          key={m.clave}
          m={m}
          dims={dims}
          editando={editando}
          activo={seleccionado === m.clave}
          onMover={onMover}
          onSeleccionar={onSeleccionar}
        />
      ))}
    </MapContainer>
  )
}
