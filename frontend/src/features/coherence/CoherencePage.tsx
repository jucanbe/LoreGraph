import { AlertOctagon, AlertTriangle, CheckCircle2, EyeOff, RotateCcw, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIncoherencias, useMarcarIncoherencia, type Incoherencia } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink } from '@/components/common/EntityLink'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, QueryState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

type Filtro = 'todas' | Incoherencia['severidad']

/** Estilos por gravedad (mismos tonos en claro y oscuro). */
const SEVERIDAD = {
  error: {
    icon: AlertOctagon,
    text: 'text-red-700 dark:text-red-400',
    border: 'border-red-600/40',
    bg: 'bg-red-500/5',
  },
  aviso: {
    icon: AlertTriangle,
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-600/40',
    bg: 'bg-amber-500/5',
  },
} as const

/** Informe de coherencia: contradicciones detectadas por las reglas, con opción de ignorarlas. */
export function CoherencePage() {
  const { t } = useTranslation('coherencia')
  const camp = useCampaign()
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [verIgnoradas, setVerIgnoradas] = useState(false)
  const informe = useIncoherencias(camp.cid, { incluirIgnoradas: verIgnoradas })

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-6" /> {t('titulo')}
          </span>
        }
        subtitle={t('subtitulo')}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('common:nav.coherencia') }]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filtro}
          onValueChange={(v) => v && setFiltro(v as Filtro)}
          aria-label={t('filtro.etiqueta')}
        >
          <ToggleGroupItem value="todas">{t('filtro.todas')}</ToggleGroupItem>
          <ToggleGroupItem value="error">{t('filtro.error')}</ToggleGroupItem>
          <ToggleGroupItem value="aviso">{t('filtro.aviso')}</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-2">
          <Switch id="ver-ignoradas" checked={verIgnoradas} onCheckedChange={setVerIgnoradas} />
          <Label htmlFor="ver-ignoradas">{t('mostrarIgnoradas')}</Label>
        </div>
      </div>

      <QueryState query={informe}>
        {(inf) => {
          const visibles = inf.incoherencias.filter((i) => filtro === 'todas' || i.severidad === filtro)
          return (
            <>
              <section aria-label={t('resumen.etiqueta')} className="flex flex-wrap gap-2">
                <SummaryChip className={SEVERIDAD.error.text} icon={<AlertOctagon className="size-3.5" />}>
                  {t('resumen.errores', { count: inf.errores })}
                </SummaryChip>
                <SummaryChip className={SEVERIDAD.aviso.text} icon={<AlertTriangle className="size-3.5" />}>
                  {t('resumen.avisos', { count: inf.avisos })}
                </SummaryChip>
                <SummaryChip icon={<EyeOff className="size-3.5" />}>{t('resumen.ignoradas', { count: inf.ignoradas })}</SummaryChip>
                <SummaryChip icon={<CheckCircle2 className="size-3.5" />}>{t('resumen.reglas', { count: inf.reglas })}</SummaryChip>
              </section>

              {inf.errores + inf.avisos === 0 && visibles.length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck className="size-10 text-emerald-600 dark:text-emerald-400" />}
                  title={t('vacio.titulo')}
                  description={t('vacio.descripcion', { count: inf.reglas })}
                />
              ) : visibles.length === 0 ? (
                <EmptyState title={t('sinFiltro')} />
              ) : (
                <ul className="space-y-3">
                  {visibles.map((i) => (
                    <IncoherenciaItem key={i.id} inc={i} />
                  ))}
                </ul>
              )}
            </>
          )
        }}
      </QueryState>
    </div>
  )
}

function SummaryChip({ children, icon, className }: { children: ReactNode; icon: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('h-7 gap-1.5 px-3 text-sm font-normal', className)}>
      {icon}
      {children}
    </Badge>
  )
}

function IncoherenciaItem({ inc }: { inc: Incoherencia }) {
  const { t } = useTranslation('coherencia')
  const camp = useCampaign()
  const marcar = useMarcarIncoherencia(camp.cid)
  const s = SEVERIDAD[inc.severidad]
  const Icon = s.icon

  const toggle = () =>
    marcar.mutate(
      { iid: inc.id, ignorada: !inc.ignorada },
      {
        onSuccess: () => toast.success(inc.ignorada ? t('hechoRestaurar') : t('hechoIgnorar')),
        onError: (err) => toast.error(err.message),
      },
    )

  return (
    <li
      className={cn('rounded-lg border p-4', s.border, s.bg, inc.ignorada && 'opacity-60')}
      aria-label={inc.titulo}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <Icon className={cn('mt-0.5 size-5 shrink-0', s.text)} aria-hidden />
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{inc.titulo}</h2>
              <Badge variant="outline" className={cn(s.text, s.border)}>
                {t(`severidad.${inc.severidad}`)}
              </Badge>
              {inc.ignorada && <Badge variant="secondary">{t('ignorada')}</Badge>}
            </div>
            {inc.descripcion && <p className="text-sm text-muted-foreground">{inc.descripcion}</p>}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={marcar.isPending}
          onClick={toggle}
          title={inc.ignorada ? undefined : t('ignorarAyuda')}
        >
          {inc.ignorada ? <RotateCcw /> : <EyeOff />}
          {inc.ignorada ? t('restaurar') : t('ignorar')}
        </Button>
      </div>
      {inc.mensajes.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-12 text-sm">
          {inc.mensajes.map((m, k) => (
            <li key={k}>{m}</li>
          ))}
        </ul>
      )}
      <dl className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 pl-8 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <dt className="text-muted-foreground">{t('entidad')}</dt>
          <dd className="min-w-0">
            <EntityLink id={inc.entidad.id} etiqueta={inc.entidad.etiqueta} tipo={inc.entidad.tipo} />
          </dd>
        </div>
        {inc.relacionadas.length > 0 && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <dt className="text-muted-foreground">{t('relacionadas')}</dt>
            {inc.relacionadas.map((r) => (
              <dd key={r.iri} className="min-w-0">
                <EntityLink id={r.id} etiqueta={r.etiqueta} tipo={r.tipo} className="font-normal" />
              </dd>
            ))}
          </div>
        )}
      </dl>
    </li>
  )
}
