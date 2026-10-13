import { FileSearch, Inbox, LayoutDashboard, Network, Plus, Search, Terminal, Calendar, Bot } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useBusqueda } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useDebounced } from '@/lib/useDebounced'

/** Paleta de órdenes (Ctrl/Cmd+K): saltar a entidades, secciones o acciones. */
export function CommandPalette() {
  const { t } = useTranslation()
  const camp = useCampaign()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const debounced = useDebounced(q, 150)
  const busqueda = useBusqueda(debounced, camp.cid)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const go = (to: string) => {
    setOpen(false)
    setQ('')
    void navigate(to)
  }

  const secciones = [
    { to: camp.path(), label: t('nav.panel'), icon: LayoutDashboard },
    { to: camp.path('explorar'), label: t('nav.explorar'), icon: FileSearch },
    { to: camp.path('grafo'), label: t('nav.grafo'), icon: Network },
    { to: camp.path('sesiones'), label: t('nav.sesiones'), icon: Calendar },
    { to: camp.path('propuestas'), label: t('nav.propuestas'), icon: Inbox },
    { to: camp.path('sparql'), label: t('nav.sparql'), icon: Terminal },
    { to: camp.path('asistente'), label: t('nav.asistente'), icon: Bot },
  ]

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-full justify-start gap-2 text-muted-foreground sm:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">{t('paleta.abrir')}</span>
        <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">{t('paleta.atajo')}</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title={t('paleta.abrir')} description={t('paleta.placeholder')}>
        <CommandInput placeholder={t('paleta.placeholder')} value={q} onValueChange={setQ} />
        <CommandList>
          <CommandEmpty>{t('estado.sinResultados')}</CommandEmpty>
          {debounced && (busqueda.data?.length ?? 0) > 0 && (
            <CommandGroup heading={t('paleta.entidades')}>
              {busqueda.data!.map((r) => {
                const estilo = camp.estilo(r.entidad.tipo?.clave)
                return (
                  <CommandItem
                    key={r.entidad.iri}
                    value={`entidad ${r.entidad.etiqueta} ${r.entidad.iri}`}
                    onSelect={() => go(camp.entityPath(r.entidad.id))}
                  >
                    <TypeIcon name={estilo.icono} color={estilo.color} />
                    <span className="truncate">{r.entidad.etiqueta}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{r.entidad.tipo?.etiqueta}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}
          <CommandSeparator />
          <CommandGroup heading={t('paleta.irA')}>
            {secciones.map((s) => (
              <CommandItem key={s.to} value={`ir ${s.label}`} onSelect={() => go(s.to)}>
                <s.icon /> {s.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading={t('paleta.acciones')}>
            {camp.info.tipos.map((tipo) => (
              <CommandItem
                key={tipo.clase.clave}
                value={`nuevo ${tipo.clase.etiqueta}`}
                onSelect={() => go(camp.path(`nueva/${encodeURIComponent(tipo.clase.clave)}`))}
              >
                <Plus /> {t('paleta.nuevaEntidad', { tipo: tipo.clase.etiqueta })}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  )
}
