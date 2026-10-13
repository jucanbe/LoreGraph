import { Search, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NodoGrafo } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { TypeIcon } from '@/components/common/TypeIcon'
import { findNodes } from '@/components/graph/graph-style'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Buscador de nodos por etiqueta: Enter elige el primero, flechas para moverse, Escape limpia. */
export function GraphSearch({
  nodos,
  onPick,
  onClear,
  className,
}: {
  nodos: NodoGrafo[]
  onPick: (n: NodoGrafo) => void
  onClear?: () => void
  className?: string
}) {
  const { t } = useTranslation('grafo')
  const camp = useCampaign()
  const listId = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => findNodes(nodos, q), [nodos, q])

  const pick = (n: NodoGrafo | undefined) => {
    if (!n) return
    onPick(n)
    setQ(n.etiqueta)
    setOpen(false)
  }
  const clear = () => {
    setQ('')
    setOpen(false)
    onClear?.()
  }

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        role="combobox"
        aria-label={t('buscar.etiqueta')}
        aria-expanded={open && q.trim() !== ''}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        placeholder={t('buscar.placeholder')}
        className="h-8 pr-8 pl-8"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            pick(matches[active] ?? matches[0])
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, Math.max(matches.length - 1, 0)))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            clear()
          }
        }}
      />
      {q && (
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={t('common:acciones.limpiar')}
          onClick={clear}
        >
          <X className="size-4" />
        </button>
      )}
      {open && q.trim() !== '' && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('buscar.resultados')}
          className="absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {matches.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{t('common:estado.sinResultados')}</li>
          ) : (
            matches.map((n, i) => {
              const estilo = camp.estilo(n.tipo)
              return (
                <li
                  key={n.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    i === active && 'bg-muted',
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(n)}
                >
                  <TypeIcon name={n.icono ?? estilo.icono} color={n.color ?? estilo.color} className="size-3.5" />
                  <span className="truncate">{n.etiqueta}</span>
                  {n.tipo && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {camp.tipoPorClave.get(n.tipo)?.clase.etiqueta ?? n.tipo}
                    </span>
                  )}
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
