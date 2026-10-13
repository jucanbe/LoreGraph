/** Mapas de campaña: galería (`/c/:cid/mapas`) y vista de un mapa (`/c/:cid/mapas/:mid`). */
import { useParams } from 'react-router'
import { MapsList } from './MapsList'
import { MapView } from './MapView'

export function MapsPage() {
  const { mid } = useParams()
  return mid ? <MapView mid={mid} /> : <MapsList />
}
