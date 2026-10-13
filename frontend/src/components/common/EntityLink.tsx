import { Link } from 'react-router'
import type { ClaseRef } from '@/api/hooks'
import { useOptionalCampaign } from '@/app/campaign-context'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { TypeIcon } from './TypeIcon'

/** Enlace navegable a la ficha de una entidad, con el icono y color de su tipo. */
export function EntityLink({
  id,
  etiqueta,
  tipo,
  className,
  showIcon = true,
}: {
  id: string | null | undefined
  etiqueta: string
  tipo?: ClaseRef | null
  className?: string
  showIcon?: boolean
}) {
  const camp = useOptionalCampaign()
  const estilo = camp?.estilo(tipo?.clave)
  const content = (
    <>
      {showIcon && <TypeIcon name={estilo?.icono} color={estilo?.color} className="size-3.5" />}
      <span className="truncate">{etiqueta}</span>
    </>
  )
  if (!id || !camp || id.startsWith('http')) {
    return <span className={cn('inline-flex items-center gap-1', className)}>{content}</span>
  }
  return (
    <Link
      to={camp.entityPath(id)}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        className,
      )}
      title={tipo ? `${etiqueta} · ${tipo.etiqueta}` : etiqueta}
    >
      {content}
    </Link>
  )
}

/** Insignia con el tipo de una entidad, coloreada según el manifiesto del módulo. */
export function TypeBadge({ tipo, className }: { tipo: ClaseRef | null | undefined; className?: string }) {
  const camp = useOptionalCampaign()
  if (!tipo) return null
  const estilo = camp?.estilo(tipo.clave)
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-normal', className)}
      style={estilo?.color ? { borderColor: `${estilo.color}66`, color: estilo.color } : undefined}
    >
      <TypeIcon name={estilo?.icono} className="size-3" />
      {tipo.etiqueta}
    </Badge>
  )
}
