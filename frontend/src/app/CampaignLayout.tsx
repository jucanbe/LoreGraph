import {
  Bot,
  Calendar,
  FileSearch,
  History,
  Inbox,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Network,
  Settings2,
  ShieldAlert,
  Swords,
  Terminal,
} from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useParams } from 'react-router'
import { useCampana, usePanel } from '@/api/hooks'
import { CampaignProvider, useCampaign } from '@/app/campaign-context'
import { CommandPalette } from '@/app/CommandPalette'
import { Preferences } from '@/components/common/Preferences'
import { SettingsButton } from '@/components/common/SettingsButton'
import { ErrorState, LoadingState } from '@/components/common/States'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { ModuleTheme } from '@/theme/ModuleTheme'

/** Diseño de una campaña: barra lateral fija, cabecera con búsqueda global y contenido. */
export function CampaignLayout() {
  const { cid = '' } = useParams()
  const info = useCampana(cid)
  if (info.isPending) return <LoadingState className="p-8" />
  if (info.isError) {
    return (
      <div className="p-8">
        <ErrorState error={info.error} onRetry={() => void info.refetch()} />
      </div>
    )
  }
  return (
    <CampaignProvider cid={cid} info={info.data}>
      <ModuleTheme tema={info.data.tema} />
      <Shell />
    </CampaignProvider>
  )
}

function Shell() {
  const { t } = useTranslation()
  const camp = useCampaign()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
        <SidebarContent />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('nav.panel')}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">{camp.info.campana.nombre}</SheetTitle>
              <SheetDescription className="sr-only">{t('nav.panel')}</SheetDescription>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <CommandPalette />
          </div>
          <SettingsButton />
          <Preferences />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

interface NavItemDef {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
  badge?: number
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()
  const camp = useCampaign()
  const panel = usePanel(camp.cid)
  const pending = panel.data?.propuestasPendientes ?? 0
  const incoherencias = panel.data?.incoherencias ?? 0
  const items: NavItemDef[] = [
    { to: camp.path(), label: t('nav.panel'), icon: LayoutDashboard, end: true },
    { to: camp.path('explorar'), label: t('nav.explorar'), icon: FileSearch, end: true },
    { to: camp.path('grafo'), label: t('nav.grafo'), icon: Network },
    { to: camp.path('sesiones'), label: t('nav.sesiones'), icon: Calendar },
    { to: camp.path('mapas'), label: t('nav.mapas'), icon: MapIcon },
    { to: camp.path('propuestas'), label: t('nav.propuestas'), icon: Inbox, badge: pending },
    { to: camp.path('sparql'), label: t('nav.sparql'), icon: Terminal },
    { to: camp.path('coherencia'), label: t('nav.coherencia'), icon: ShieldAlert, badge: incoherencias },
    { to: camp.path('historial'), label: t('nav.historial'), icon: History },
    { to: camp.path('asistente'), label: t('nav.asistente'), icon: Bot },
    { to: camp.path('ajustes'), label: t('nav.ajustesCampana'), icon: Settings2 },
  ]
  return (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2 border-b border-current/10 px-4 py-4" onClick={onNavigate}>
        <Swords className="size-5 opacity-80" />
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-semibold leading-tight">{camp.info.campana.nombre}</p>
          <p className="truncate text-xs opacity-70">{camp.info.campana.sistema}</p>
        </div>
      </Link>
      <ScrollArea className="flex-1">
        <nav className="space-y-1 p-2" aria-label={camp.info.campana.nombre}>
          {items.map((it) => (
            <SideLink key={it.to} {...it} onNavigate={onNavigate} />
          ))}
          <p className="px-3 pt-4 pb-1 text-xs font-medium tracking-wide uppercase opacity-60">{t('nav.tipos')}</p>
          {camp.info.tipos.map((tipo) => (
            <NavLink
              key={tipo.clase.clave}
              to={camp.path(`explorar/${encodeURIComponent(tipo.clase.clave)}`)}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm opacity-85 hover:bg-current/10 hover:opacity-100',
                  isActive && 'bg-current/15 font-medium opacity-100',
                )
              }
            >
              <TypeIcon name={tipo.estilo.icono} color={tipo.estilo.color} />
              <span className="flex-1 truncate">{tipo.clase.etiqueta}</span>
              <span className="text-xs tabular-nums opacity-60">{tipo.recuento}</span>
            </NavLink>
          ))}
        </nav>
      </ScrollArea>
      <Link
        to="/"
        onClick={onNavigate}
        className="border-t border-current/10 px-4 py-3 text-xs opacity-70 hover:opacity-100"
      >
        ← {t('nav.campanas')}
      </Link>
    </div>
  )
}

function SideLink({ to, label, icon: Icon, end, badge, onNavigate }: NavItemDef & { onNavigate?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-current/10',
          isActive && 'bg-current/15 font-medium',
        )
      }
    >
      <Icon className="size-4" />
      <span className="flex-1">{label}</span>
      {!!badge && <Badge className="h-5 min-w-5 justify-center px-1.5 tabular-nums">{badge}</Badge>}
    </NavLink>
  )
}
