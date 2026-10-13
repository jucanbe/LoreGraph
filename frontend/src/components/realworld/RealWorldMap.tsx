/**
 * Mapa de OpenStreetMap con un marcador (Leaflet). Se carga de forma diferida
 * desde el panel «Mundo real» para no engordar la ficha de entidad.
 */
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import shadowUrl from 'leaflet/dist/images/marker-shadow.png'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'

// Con Vite, las rutas de los iconos por defecto de Leaflet se rompen: se fijan a mano.
// Además se elimina `_getIconUrl`, que antepondría la ruta deducida del CSS.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl })

export default function RealWorldMap({
  lat,
  lng,
  etiqueta,
  ariaLabel,
}: {
  lat: number
  lng: number
  etiqueta: string
  ariaLabel: string
}) {
  return (
    <div className="isolate h-56 overflow-hidden rounded-md border" role="region" aria-label={ariaLabel}>
      <MapContainer center={[lat, lng]} zoom={11} scrollWheelZoom={false} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]}>
          <Popup>{etiqueta}</Popup>
        </Marker>
      </MapContainer>
    </div>
  )
}
