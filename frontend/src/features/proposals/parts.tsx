/** Piezas pequeñas compartidas por la lista y el detalle de propuestas. */
import { AlertTriangle, BookOpen, Bot, Brain, CheckCircle2, Clock, Info, UserRound, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePersonajesConConocimiento } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink } from '@/components/common/EntityLink'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { canalAgente, destinoConocimiento, epochSeconds, type ErrorValidacion, type EstadoPropuesta } from './utils'

/** Idioma activo reducido a `es` | `en` (para Intl). */
function useLang(): string {
  const { i18n } = useTranslation()
  return i18n.language?.startsWith('en') ? 'en' : 'es'
}

/** Agente de origen: nombre (p. ej. `mcp:claude-code`), tipo (IA o humano) y canal. */
export function AgentLabel({ agente, tipoAgente, className }: { agente: string; tipoAgente: string; className?: string }) {
  const { t, i18n } = useTranslation('propuestas')
  const humano = tipoAgente === 'humano'
  const Icon = humano ? UserRound : Bot
  const canal = canalAgente(agente)
  const tipo = humano ? t('agente.humano') : t('agente.ia')
  // Canales conocidos (mcp, local…) traducidos; cualquier otro se omite.
  const canalTexto = canal && i18n.exists(`propuestas:agente.canal.${canal}`) ? t(`agente.canal.${canal}`) : ''
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate font-mono text-xs" title={agente}>
        {agente}
      </span>
      <Badge variant={humano ? 'outline' : 'secondary'} className="h-5 px-1.5 text-[0.7rem] font-normal">
        {canalTexto ? `${tipo} · ${canalTexto}` : tipo}
      </Badge>
    </span>
  )
}

/** Fecha relativa con la absoluta en un tooltip (y en `dateTime` para lectores de pantalla). */
export function Fecha({ iso, className }: { iso: string | null | undefined; className?: string }) {
  const lang = useLang()
  const epoch = epochSeconds(iso)
  if (!iso || epoch === null) return null
  const absoluta = formatDate(iso, lang, true)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <time
          dateTime={iso}
          tabIndex={0}
          aria-label={absoluta}
          className={cn(
            'relative z-10 rounded-sm text-xs text-muted-foreground tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            className,
          )}
        >
          {relativeTime(epoch, lang)}
        </time>
      </TooltipTrigger>
      <TooltipContent>{absoluta}</TooltipContent>
    </Tooltip>
  )
}

const ESTADO_ICONO = { pendiente: Clock, aprobada: CheckCircle2, rechazada: XCircle } as const
const ESTADO_CLASE = {
  pendiente: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
  aprobada: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  rechazada: 'border-red-500/40 text-red-700 dark:text-red-400',
} as const

export function EstadoBadge({ estado, className }: { estado: EstadoPropuesta; className?: string }) {
  const { t } = useTranslation('propuestas')
  const Icon = ESTADO_ICONO[estado]
  return (
    <Badge variant="outline" className={cn('gap-1 font-normal', ESTADO_CLASE[estado], className)}>
      <Icon className="size-3" aria-hidden />
      {t(`estado.${estado}`)}
    </Badge>
  )
}

/** Destino de la propuesta: el canon o el conocimiento de un personaje. */
export function Destino({ destino, enlazar = false, className }: { destino: string; enlazar?: boolean; className?: string }) {
  const { t } = useTranslation('propuestas')
  const camp = useCampaign()
  const pjId = destinoConocimiento(destino)
  const personajes = usePersonajesConConocimiento(camp.cid)
  if (!pjId) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs', className)} title={t('destino.canonAyuda')}>
        <BookOpen className="size-3.5 text-muted-foreground" aria-hidden />
        {t('destino.canon')}
      </span>
    )
  }
  const pj = personajes.data?.find((p) => p.id === pjId)
  const nombre = pj?.etiqueta ?? pjId
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-xs', className)} title={t('destino.conocimientoAyuda')}>
      <Brain className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">
        {t('destino.conocimientoDe')}{' '}
        {enlazar ? <EntityLink id={pjId} etiqueta={nombre} tipo={pj?.tipo} showIcon={false} className="relative z-10" /> : nombre}
      </span>
    </span>
  )
}

/** Recuento de tripletas añadidas y eliminadas («+22 −0»). */
export function Conteos({ anadidas, eliminadas, className }: { anadidas: number; eliminadas: number; className?: string }) {
  const { t } = useTranslation('propuestas')
  return (
    <span className={cn('inline-flex items-center gap-2 font-mono text-xs tabular-nums', className)}>
      <span className="text-emerald-700 dark:text-emerald-400" title={t('conteo.anadidas', { count: anadidas })}>
        <span aria-hidden>+{anadidas}</span>
        <span className="sr-only">{t('conteo.anadidas', { count: anadidas })}</span>
      </span>
      <span className="text-red-700 dark:text-red-400" title={t('conteo.eliminadas', { count: eliminadas })}>
        <span aria-hidden>−{eliminadas}</span>
        <span className="sr-only">{t('conteo.eliminadas', { count: eliminadas })}</span>
      </span>
    </span>
  )
}

const SEVERIDAD_ICONO = { violacion: AlertTriangle, aviso: AlertTriangle, info: Info } as const

/** Lista de errores de validación (SHACL o reglas de seguridad) con su foco y propiedad. */
export function ListaErrores({ errores, className }: { errores: ErrorValidacion[]; className?: string }) {
  const { t } = useTranslation('propuestas')
  return (
    <ul className={cn('space-y-1.5', className)}>
      {errores.map((e, i) => {
        const Icon = SEVERIDAD_ICONO[e.severidad] ?? AlertTriangle
        return (
          <li key={`${e.foco ?? ''}-${e.campo ?? ''}-${i}`} className="flex gap-2 text-sm">
            <Icon
              className={cn('mt-0.5 size-4 shrink-0', e.severidad === 'violacion' ? 'text-destructive' : 'text-amber-600')}
              aria-label={t(`severidad.${e.severidad}`)}
            />
            <div className="min-w-0 space-y-0.5">
              <p className="break-words text-foreground">{e.mensaje}</p>
              {(e.focoId || e.campo || e.valor) && (
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {e.focoId && <EntityLink id={e.focoId} etiqueta={e.focoId} showIcon={false} />}
                  {!e.focoId && e.foco && <span className="font-mono break-all">{e.foco}</span>}
                  {e.campo && <code className="font-mono">{e.campo}</code>}
                  {e.valor && (
                    <span>
                      {t('errores.valor')}: <span className="font-mono">{e.valor}</span>
                    </span>
                  )}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
