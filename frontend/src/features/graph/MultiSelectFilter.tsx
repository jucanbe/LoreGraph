import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface OpcionFiltro {
  value: string
  label: string
  /** Decoración opcional (icono, muestra de color). */
  adorno?: ReactNode
}

/** Selector múltiple compacto (botón + lista de casillas en un popover). */
export function MultiSelectFilter({
  label,
  options,
  value,
  onChange,
  emptyText,
}: {
  label: string
  options: OpcionFiltro[]
  value: string[]
  onChange: (v: string[]) => void
  emptyText?: string
}) {
  const { t } = useTranslation('grafo')
  const baseId = useId()
  const selected = new Set(value)
  const toggle = (v: string, on: boolean) => {
    const next = new Set(selected)
    if (on) next.add(v)
    else next.delete(v)
    onChange(options.map((o) => o.value).filter((o) => next.has(o)).concat([...next].filter((x) => !options.some((o) => o.value === x))))
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={label}>
          {label}
          {value.length > 0 && (
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">
              {value.length}
            </Badge>
          )}
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">{label}</span>
          {value.length > 0 && (
            <Button variant="ghost" size="xs" onClick={() => onChange([])}>
              {t('filtros.ninguno')}
            </Button>
          )}
        </div>
        {options.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{emptyText ?? t('filtros.sinOpciones')}</p>
        ) : (
          <div className="max-h-72 overflow-y-auto">
            <ul className="space-y-0.5 p-1.5" role="group" aria-label={label}>
              {options.map((o, i) => {
                const id = `${baseId}-${i}`
                return (
                  <li key={o.value}>
                    <label
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <Checkbox
                        id={id}
                        checked={selected.has(o.value)}
                        onCheckedChange={(c) => toggle(o.value, c === true)}
                      />
                      {o.adorno}
                      <span className="truncate">{o.label}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
