import { useQueries } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, unwrap } from '@/api/client'
import type { Campo, EntidadRef } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDebounced } from '@/lib/useDebounced'
import { cn } from '@/lib/utils'
import type { RefValue } from './model'
import { QuickCreateDialog } from './QuickCreateDialog'

/** Busca entidades de cualquiera de las clases admitidas (una consulta por clase). */
function useCandidates(cid: string, clases: string[], q: string, enabled: boolean): { items: EntidadRef[]; loading: boolean } {
  const { i18n } = useTranslation()
  const results = useQueries({
    queries: clases.map((clase) => ({
      queryKey: ['c', cid, 'candidatos', clase, q, i18n.language],
      queryFn: () =>
        unwrap(
          api.GET('/campanas/{cid}/entidades', {
            params: { path: { cid }, query: { clase, q: q || undefined, limite: 25, orden: q ? 'relevancia' : 'nombre' } },
          }),
        ),
      enabled,
      staleTime: 10_000,
    })),
  })
  const seen = new Set<string>()
  const items: EntidadRef[] = []
  for (const r of results) {
    for (const e of r.data?.elementos ?? []) {
      if (!seen.has(e.iri)) {
        seen.add(e.iri)
        items.push(e)
      }
    }
  }
  return { items, loading: results.some((r) => r.isFetching) }
}

/**
 * Selector con búsqueda para referencias a otras entidades. Permite elegir una o
 * varias (según la cardinalidad) y crear una entidad nueva sin salir del formulario.
 */
export function ReferencePicker({
  campo,
  value,
  onChange,
  multiple,
  invalid,
  id,
}: {
  campo: Campo
  value: RefValue[]
  onChange: (v: RefValue[]) => void
  multiple: boolean
  invalid?: boolean
  id?: string
}) {
  const { t } = useTranslation('formulario')
  const camp = useCampaign()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const q = useDebounced(text, 200)
  const clases = (campo.clases ?? []).map((c) => c.clave)
  const { items, loading } = useCandidates(camp.cid, clases, q, open)
  const [creating, setCreating] = useState(false)
  const selected = new Set(value.map((v) => v.ref))
  const creables = campo.clasesCreables ?? []

  const pick = (e: EntidadRef) => {
    const ref: RefValue = { kind: 'ref', ref: e.id, etiqueta: e.etiqueta, tipo: e.tipo }
    if (multiple) {
      onChange(selected.has(e.id) ? value.filter((v) => v.ref !== e.id) : [...value, ref])
    } else {
      onChange([ref])
      setOpen(false)
    }
    setText('')
  }

  return (
    <div className="space-y-2">
      {multiple && value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => {
            const estilo = camp.estilo(v.tipo?.clave)
            return (
              <li key={v.ref}>
                <Badge variant="secondary" className="gap-1 py-1 pr-1">
                  <TypeIcon name={estilo.icono} color={estilo.color} className="size-3" />
                  {v.etiqueta}
                  <button
                    type="button"
                    className="ml-0.5 rounded-sm p-0.5 hover:bg-foreground/10"
                    aria-label={t('quitar', { nombre: v.etiqueta })}
                    onClick={() => onChange(value.filter((x) => x.ref !== v.ref))}
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-invalid={invalid || undefined}
              className={cn('flex-1 justify-between font-normal', invalid && 'border-destructive')}
            >
              <span className={cn('truncate', !(!multiple && value[0]) && 'text-muted-foreground')}>
                {!multiple && value[0] ? value[0].etiqueta : t('elegir', { clases: (campo.clases ?? []).map((c) => c.etiqueta).join(' / ') })}
              </span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(26rem,calc(100vw-2rem))] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder={t('buscarEntidad')} value={text} onValueChange={setText} />
              <CommandList>
                <CommandEmpty>{loading ? t('common:estado.cargando') : t('common:estado.sinResultados')}</CommandEmpty>
                {items.length > 0 && (
                  <CommandGroup>
                    {items.map((e) => {
                      const estilo = camp.estilo(e.tipo?.clave)
                      return (
                        <CommandItem key={e.iri} value={e.iri} onSelect={() => pick(e)}>
                          <TypeIcon name={estilo.icono} color={estilo.color} />
                          <span className="truncate">{e.etiqueta}</span>
                          <span className="ml-auto text-xs text-muted-foreground">{e.tipo?.etiqueta}</span>
                          {selected.has(e.id) && <Check className="size-4" />}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                )}
                {creables.length > 0 && (
                  <CommandGroup heading={t('crearNueva')}>
                    <CommandItem
                      value="__crear__"
                      onSelect={() => {
                        setOpen(false)
                        setCreating(true)
                      }}
                    >
                      <Plus /> {text ? t('crearConNombre', { nombre: text }) : t('crearEntidad')}
                    </CommandItem>
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {!multiple && value[0] && (
          <Button type="button" variant="ghost" size="icon" aria-label={t('vaciar')} onClick={() => onChange([])}>
            <X />
          </Button>
        )}
      </div>
      <QuickCreateDialog
        open={creating}
        onOpenChange={setCreating}
        clases={creables}
        nombreInicial={text}
        onCreated={(e) => {
          const ref: RefValue = { kind: 'ref', ref: e.id, etiqueta: e.etiqueta, tipo: e.tipo }
          onChange(multiple ? [...value, ref] : [ref])
          setText('')
        }}
      />
    </div>
  )
}
