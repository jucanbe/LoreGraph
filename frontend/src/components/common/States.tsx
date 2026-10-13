import { AlertTriangle, Inbox, Loader2, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function LoadingState({ label, className, rows = 3 }: { label?: string; className?: string; rows?: number }) {
  const { t } = useTranslation()
  return (
    <div className={cn('space-y-3 p-2', className)} role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {label ?? t('estado.cargando')}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title?: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center',
        className,
      )}
    >
      <div className="text-muted-foreground">{icon ?? <Inbox className="size-8" />}</div>
      <div className="space-y-1">
        <p className="font-medium">{title ?? t('estado.vacio')}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { t } = useTranslation()
  const message = error instanceof Error ? error.message : t('errores.desconocido')
  const notFound = error instanceof ApiError && error.status === 404
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-8 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium">{notFound ? t('errores.noEncontrado') : t('estado.error')}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && !notFound && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw /> {t('acciones.reintentar')}
        </Button>
      )}
    </div>
  )
}

/** Envuelve el patrón carga / error / vacío / datos de una consulta de TanStack Query. */
export function QueryState<T>({
  query,
  children,
  empty,
  isEmpty,
  loading,
}: {
  query: { data: T | undefined; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  children: (data: T) => ReactNode
  empty?: ReactNode
  isEmpty?: (data: T) => boolean
  loading?: ReactNode
}) {
  if (query.isPending) return <>{loading ?? <LoadingState />}</>
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (query.data === undefined) return null
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState />}</>
  return <>{children(query.data)}</>
}
