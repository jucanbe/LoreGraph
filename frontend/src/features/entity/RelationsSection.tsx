import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Entidad } from '@/api/hooks'
import { EntityLink } from '@/components/common/EntityLink'
import { EmptyState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Relacion = Entidad['relaciones'][number]

function strengthClass(n: number): string {
  if (n > 0) return 'text-emerald-700 dark:text-emerald-400 border-emerald-600/40'
  if (n < 0) return 'text-red-700 dark:text-red-400 border-red-600/40'
  return ''
}

/** Relaciones entrantes y salientes de la entidad, agrupadas por propiedad. */
export function RelationsSection({ relaciones }: { relaciones: Relacion[] }) {
  const { t } = useTranslation('entidad')
  if (relaciones.length === 0) return <EmptyState title={t('relaciones.vacio')} />
  const salientes = relaciones.filter((r) => r.direccion === 'saliente')
  const entrantes = relaciones.filter((r) => r.direccion === 'entrante')
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <RelationGroup title={t('relaciones.salientes')} items={salientes} icon={<ArrowRight className="size-4" />} />
      <RelationGroup title={t('relaciones.entrantes')} items={entrantes} icon={<ArrowLeft className="size-4" />} />
    </div>
  )
}

function RelationGroup({ title, items, icon }: { title: string; items: Relacion[]; icon: ReactNode }) {
  const { t } = useTranslation('entidad')
  const groups = new Map<string, Relacion[]>()
  for (const r of items) {
    const key = r.cualificada ? (r.tipoRelacion?.etiqueta ?? r.propiedad.etiqueta) : r.propiedad.etiqueta
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {icon} {title} <span className="tabular-nums">({items.length})</span>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('relaciones.ninguna')}</p>
      ) : (
        <ul className="space-y-3">
          {[...groups.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([label, rels]) => (
              <li key={label} className="space-y-1">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
                <ul className="flex flex-wrap gap-2">
                  {rels.map((r, i) => (
                    <li
                      key={`${r.otra.iri}-${r.nodo ?? i}`}
                      className="flex items-center gap-2 rounded-md border bg-card px-2 py-1 text-sm"
                    >
                      <EntityLink id={r.otra.id} etiqueta={r.otra.etiqueta} tipo={r.otra.tipo} />
                      {r.intensidad != null && (
                        <Badge variant="outline" className={cn('tabular-nums', strengthClass(r.intensidad))}>
                          {r.intensidad > 0 ? `+${r.intensidad}` : r.intensidad}
                        </Badge>
                      )}
                      {(r.desde || r.hasta) && (
                        <span className="text-xs text-muted-foreground">
                          {r.desde && t('relaciones.desde', { s: r.desde.etiqueta })}
                          {r.desde && r.hasta && ' · '}
                          {r.hasta && t('relaciones.hasta', { s: r.hasta.etiqueta })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
        </ul>
      )}
    </section>
  )
}
