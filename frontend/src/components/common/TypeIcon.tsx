import { Circle } from 'lucide-react'
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic'
import { cn } from '@/lib/utils'

const KNOWN = new Set<string>(iconNames)

/** Icono por nombre de lucide, tal como lo declara el manifiesto del módulo. */
export function TypeIcon({ name, className, color }: { name?: string | null; className?: string; color?: string | null }) {
  const style = color ? { color } : undefined
  if (name && KNOWN.has(name)) {
    return (
      <DynamicIcon
        name={name as IconName}
        className={cn('size-4 shrink-0', className)}
        style={style}
        fallback={() => <Circle className={cn('size-4 shrink-0', className)} style={style} />}
      />
    )
  }
  return <Circle className={cn('size-4 shrink-0', className)} style={style} />
}
