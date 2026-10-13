import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'

export interface Miga {
  label: string
  to?: string
}

/** Cabecera de página con migas de pan, título y acciones. */
export function PageHeader({
  title,
  subtitle,
  migas,
  actions,
  className,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  migas?: Miga[]
  actions?: ReactNode
  className?: string
  children?: ReactNode
}) {
  return (
    <header className={cn('space-y-2', className)}>
      {migas && migas.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {migas.map((m, i) => (
              <Fragment key={`${m.label}-${i}`}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {m.to && i < migas.length - 1 ? (
                    <BreadcrumbLink asChild>
                      <Link to={m.to}>{m.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{m.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
