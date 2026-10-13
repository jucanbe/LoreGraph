/** Galería de los mapas de la campaña. */
import { Map as MapIcon, MapPin, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { mediaUrl } from '@/api/client'
import { useMapas, type Mapa } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, QueryState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { NewMapDialog } from './NewMapDialog'

function MapCard({ mapa }: { mapa: Mapa }) {
  const { t } = useTranslation('mapas')
  const camp = useCampaign()
  const n = mapa.marcadores.length
  return (
    <li>
      <Link
        to={camp.path(`mapas/${encodeURIComponent(mapa.entidad.id)}`)}
        className="group block overflow-hidden rounded-lg border bg-card shadow-xs transition-colors hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
          {mapa.imagen ? (
            <img
              src={mediaUrl(mapa.imagen.url)}
              alt=""
              loading="lazy"
              className="size-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <MapIcon className="size-10 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="space-y-1 p-3">
          <h2 className="truncate font-medium">{mapa.entidad.etiqueta}</h2>
          {mapa.entidad.descripcion && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{mapa.entidad.descripcion}</p>
          )}
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" aria-hidden />
            {t('marcadores', { count: n })}
          </p>
        </div>
      </Link>
    </li>
  )
}

export function MapsList() {
  const { t } = useTranslation('mapas')
  const camp = useCampaign()
  const query = useMapas(camp.cid)
  const [nuevo, setNuevo] = useState(false)
  const boton = (
    <Button size="sm" onClick={() => setNuevo(true)}>
      <Plus /> {t('nuevo.boton')}
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titulo')}
        subtitle={query.data ? t('total', { count: query.data.length }) : undefined}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
        actions={query.data && query.data.length > 0 ? boton : undefined}
      />
      <QueryState
        query={query}
        isEmpty={(d) => d.length === 0}
        empty={
          <EmptyState
            icon={<MapIcon className="size-8" />}
            title={t('vacio.titulo')}
            description={t('vacio.desc')}
            action={boton}
          />
        }
      >
        {(mapas) => (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label={t('titulo')}>
            {mapas.map((m) => (
              <MapCard key={m.entidad.id} mapa={m} />
            ))}
          </ul>
        )}
      </QueryState>
      <NewMapDialog open={nuevo} onOpenChange={setNuevo} />
    </div>
  )
}
