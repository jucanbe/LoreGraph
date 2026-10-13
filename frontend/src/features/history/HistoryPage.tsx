/** Historial de cambios de toda la campaña, paginado, con «Deshacer» en cada cambio. */
import { ChevronLeft, ChevronRight, History, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCambios } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, QueryState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
import { ChangeEntry } from './ChangeEntry'

export const POR_PAGINA = 50

export function HistoryPage() {
  const { t } = useTranslation('historial')
  const camp = useCampaign()
  const [desplazamiento, setDesplazamiento] = useState(0)
  const query = useCambios(camp.cid, POR_PAGINA, desplazamiento)
  const n = query.data?.length ?? 0
  const haySiguiente = n === POR_PAGINA
  const hayAnterior = desplazamiento > 0
  const ir = (d: number) => {
    setDesplazamiento(Math.max(0, d))
    window.scrollTo?.({ top: 0 })
  }

  const paginacion = (hayAnterior || haySiguiente) && (
    <nav className="flex flex-wrap items-center justify-between gap-2" aria-label={t('titulo')}>
      <Button variant="outline" size="sm" disabled={!hayAnterior || query.isFetching} onClick={() => ir(desplazamiento - POR_PAGINA)}>
        <ChevronLeft /> {t('paginacion.anterior')}
      </Button>
      <span className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
        {query.isFetching && <Loader2 className="size-3.5 animate-spin" />}
        {n > 0 && t('paginacion.rango', { desde: desplazamiento + 1, hasta: desplazamiento + n })}
      </span>
      <Button variant="outline" size="sm" disabled={!haySiguiente || query.isFetching} onClick={() => ir(desplazamiento + POR_PAGINA)}>
        {t('paginacion.siguiente')} <ChevronRight />
      </Button>
    </nav>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titulo')}
        subtitle={t('subtitulo')}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
      />
      <QueryState
        query={query}
        isEmpty={(d) => d.length === 0 && desplazamiento === 0}
        empty={<EmptyState icon={<History className="size-8" />} title={t('vacio.titulo')} description={t('vacio.desc')} />}
      >
        {(cambios) => (
          <div className="mx-auto max-w-4xl space-y-6">
            {paginacion}
            <ol className="relative space-y-6 border-l pl-6" aria-label={t('titulo')}>
              {cambios.map((c) => (
                <ChangeEntry key={c.id} cambio={c} anclas />
              ))}
            </ol>
            {paginacion}
          </div>
        )}
      </QueryState>
    </div>
  )
}
