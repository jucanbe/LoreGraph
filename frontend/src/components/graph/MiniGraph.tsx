/**
 * Mini-grafo del vecindario de una entidad (ficha de entidad): profundidad
 * 1 o 2, la entidad resaltada en el centro, clic en un nodo → su ficha.
 */
import { Network, SquareArrowOutUpRight } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useVecindario } from '@/api/hooks'
import { useOptionalCampaign } from '@/app/campaign-context'
import { EmptyState, ErrorState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CytoscapeGraph } from './CytoscapeGraph'

const HEIGHT = 280

export function MiniGraph({ cid, eid }: { cid: string; eid: string }) {
  const { t } = useTranslation('grafo')
  const camp = useOptionalCampaign()
  const navigate = useNavigate()
  const [profundidad, setProfundidad] = useState<1 | 2>(1)
  const q = useVecindario(cid, eid, profundidad)

  const base = `/c/${encodeURIComponent(cid)}`
  const entityPath = (id: string) => camp?.entityPath(id) ?? `${base}/e/${encodeURIComponent(id)}`
  const graphPath = `${camp?.path('grafo') ?? `${base}/grafo`}?centro=${encodeURIComponent(eid)}&profundidad=${profundidad}`

  const vacio = q.data && (q.data.nodos.length <= 1 || q.data.aristas.length === 0)

  return (
    <section className="space-y-2" aria-labelledby={`minigrafo-${eid}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`minigrafo-${eid}`} className="flex items-center gap-1.5 text-sm font-medium">
          <Network className="size-4 text-muted-foreground" /> {t('mini.titulo')}
        </h3>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            spacing={0}
            value={String(profundidad)}
            onValueChange={(v) => {
              if (v === '1' || v === '2') setProfundidad(Number(v) as 1 | 2)
            }}
            aria-label={t('mini.profundidad')}
          >
            <ToggleGroupItem value="1" aria-label={t('centro.saltos', { count: 1 })}>
              1
            </ToggleGroupItem>
            <ToggleGroupItem value="2" aria-label={t('centro.saltos', { count: 2 })}>
              2
            </ToggleGroupItem>
          </ToggleGroup>
          <Button asChild variant="ghost" size="sm">
            <Link to={graphPath}>
              <SquareArrowOutUpRight /> {t('mini.abrir')}
            </Link>
          </Button>
        </div>
      </div>

      {q.isPending ? (
        <Skeleton className="w-full rounded-lg" style={{ height: HEIGHT }} aria-label={t('common:estado.cargando')} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} className="p-4" />
      ) : vacio ? (
        <EmptyState
          className="p-6"
          icon={<Network className="size-6" />}
          title={t('mini.vacio')}
          description={t('mini.vacioDesc')}
        />
      ) : (
        <CytoscapeGraph
          grafo={q.data}
          layout="fcose"
          height={HEIGHT}
          compact
          centerId={eid}
          ariaLabel={t('mini.lienzo', { nodos: q.data.nodos.length })}
          onNodeTap={(n) => {
            if (n.id !== eid && !n.id.startsWith('http')) void navigate(entityPath(n.id))
          }}
        />
      )}
    </section>
  )
}
