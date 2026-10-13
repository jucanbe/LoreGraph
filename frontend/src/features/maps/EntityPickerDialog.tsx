/** Diálogo con búsqueda para elegir la entidad de un marcador nuevo. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEntidades, type EntidadRef } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDebounced } from '@/lib/useDebounced'

export function EntityPickerDialog({
  open,
  onOpenChange,
  onPick,
  excluir = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (entidad: EntidadRef) => void
  /** Ids que no se ofrecen (p. ej. el propio mapa). */
  excluir?: string[]
}) {
  const { t } = useTranslation('mapas')
  const camp = useCampaign()
  const [texto, setTexto] = useState('')
  const q = useDebounced(texto, 200)
  const query = useEntidades(
    camp.cid,
    { q: q.trim() || undefined, limite: 25, orden: q.trim() ? 'relevancia' : 'nombre' },
    open,
  )
  const fuera = new Set(excluir)
  const items = (query.data?.elementos ?? []).filter((e) => !fuera.has(e.id))

  const cambiar = (o: boolean) => {
    if (!o) setTexto('')
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="gap-3 p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{t('picker.titulo')}</DialogTitle>
          <DialogDescription>{t('picker.desc')}</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="border-t">
          <CommandInput value={texto} onValueChange={setTexto} placeholder={t('picker.buscar')} aria-label={t('picker.buscar')} />
          <CommandList className="max-h-72">
            {!query.isFetching && <CommandEmpty>{t('picker.sinResultados')}</CommandEmpty>}
            {query.isFetching && items.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground" role="status">
                {t('picker.buscando')}
              </div>
            )}
            {items.length > 0 && (
              <CommandGroup>
                {items.map((e) => {
                  const estilo = camp.estilo(e.tipo?.clave)
                  return (
                    <CommandItem
                      key={e.id}
                      value={e.id}
                      onSelect={() => {
                        onPick(e)
                        cambiar(false)
                      }}
                    >
                      <TypeIcon name={estilo.icono} color={estilo.color} className="size-3.5" />
                      <span className="truncate">{e.etiqueta}</span>
                      {e.tipo && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{e.tipo.etiqueta}</span>}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
