import { CheckCircle2, CircleHelp, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useConocimiento } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink } from '@/components/common/EntityLink'
import { QueryState } from '@/components/common/States'
import { Button } from '@/components/ui/button'

const ICONS = {
  confirmado: <CheckCircle2 className="size-4 text-emerald-600" />,
  falso: <XCircle className="size-4 text-red-600" />,
  no_verificado: <CircleHelp className="size-4 text-amber-600" />,
} as const

/** Lo que el personaje cree saber, contrastado con el canon. */
export function KnowledgeTab({ eid }: { eid: string }) {
  const { t } = useTranslation('entidad')
  const camp = useCampaign()
  const conocimiento = useConocimiento(camp.cid, eid)
  return (
    <QueryState query={conocimiento} isEmpty={(d) => d.creencias.length === 0}>
      {(k) => (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t('conocimiento.explicacion')}</p>
            <Button asChild size="sm" variant="outline">
              <Link to={`${camp.path('grafo')}?vista=${encodeURIComponent(eid)}`}>{t('conocimiento.verGrafo')}</Link>
            </Button>
          </div>
          <ul className="divide-y rounded-lg border">
            {k.creencias.map((c, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
                <span className="mt-0.5" title={t(`conocimiento.estado.${c.estado}`)}>
                  {ICONS[c.estado]}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <EntityLink id={c.tripleta.sujeto.id} etiqueta={c.tripleta.sujeto.etiqueta} showIcon={false} />
                    <span className="text-muted-foreground">· {c.tripleta.predicado.etiqueta} →</span>
                    {c.tripleta.objeto.tipo === 'literal' ? (
                      <span className="font-medium">{c.tripleta.objeto.etiqueta}</span>
                    ) : (
                      <EntityLink id={c.tripleta.objeto.id} etiqueta={c.tripleta.objeto.etiqueta} showIcon={false} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(`conocimiento.estado.${c.estado}`)}
                    {c.canon.length > 0 && (
                      <> · {t('conocimiento.canon')}: {c.canon.map((x) => x.etiqueta).join(', ')}</>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </QueryState>
  )
}
