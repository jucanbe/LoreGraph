import { useProcedencia } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { QueryState } from '@/components/common/States'
import { ChangeEntry } from '@/features/history/ChangeEntry'

/** Historial de cambios de la entidad: quién, cuándo, con qué petición, qué tripletas y «Deshacer». */
export function ProvenanceTab({ eid }: { eid: string }) {
  const camp = useCampaign()
  const historial = useProcedencia(camp.cid, eid)
  return (
    <QueryState query={historial} isEmpty={(d) => d.length === 0}>
      {(cambios) => (
        <ol className="relative space-y-4 border-l pl-6">
          {cambios.map((c) => (
            <ChangeEntry key={c.id} cambio={c} anclas />
          ))}
        </ol>
      )}
    </QueryState>
  )
}
