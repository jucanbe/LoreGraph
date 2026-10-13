import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useEntidades, type FiltrosEntidades } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink, TypeBadge } from '@/components/common/EntityLink'
import { PageHeader } from '@/components/common/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GenerateButton } from '@/features/generator/GeneratorDialog'
import { relativeTime } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'

const PAGE = 24
const TODOS = '__todos__'

/** Explorador de entidades por tipo, con búsqueda, filtro por facción, orden y paginación. */
export function ExplorerPage() {
  const { t, i18n } = useTranslation('explorar')
  const camp = useCampaign()
  const navigate = useNavigate()
  const { tipo: tipoParam } = useParams()
  const [params, setParams] = useSearchParams()
  const tipo = tipoParam ? decodeURIComponent(tipoParam) : undefined
  const tipoInfo = tipo ? camp.tipoPorClave.get(tipo) : undefined

  const [texto, setTexto] = useState(params.get('q') ?? '')
  const q = useDebounced(texto, 250)
  const orden = (params.get('orden') as FiltrosEntidades['orden']) ?? 'nombre'
  const pagina = Math.max(0, Number(params.get('p') ?? 0))
  const faccion = params.get('faccion') ?? ''

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q: q || null, p: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const filtros: FiltrosEntidades = {
    clase: tipo,
    q: q || undefined,
    orden: q && orden === 'nombre' ? 'relevancia' : orden,
    limite: PAGE,
    desplazamiento: pagina * PAGE,
    filtro: faccion ? [`rpg:memberOf=${faccion}`] : undefined,
  }
  const lista = useEntidades(camp.cid, filtros)
  const facciones = useEntidades(camp.cid, { clase: 'rpg:Faction', limite: 200 })
  const total = lista.data?.pagina.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / PAGE))
  const titulo = tipoInfo?.clase.etiqueta ?? t('todas')

  return (
    <div className="space-y-5">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {tipoInfo && <TypeIcon name={tipoInfo.estilo.icono} color={tipoInfo.estilo.color} className="size-6" />}
            {titulo}
          </span>
        }
        subtitle={tipoInfo?.descripcion}
        migas={[
          { label: camp.info.campana.nombre, to: camp.path() },
          { label: t('common:nav.explorar'), to: camp.path('explorar') },
          ...(tipoInfo ? [{ label: tipoInfo.clase.etiqueta }] : []),
        ]}
        actions={
          <>
            <GenerateButton clase={tipoInfo?.clase.clave} />
            {tipoInfo && <NewEntityButton clave={tipoInfo.clase.clave} />}
          </>
        }
      />

      <Tabs
        value={tipo ?? TODOS}
        onValueChange={(v) =>
          void navigate(v === TODOS ? camp.path('explorar') : camp.path(`explorar/${encodeURIComponent(v)}`))
        }
      >
        <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pb-1">
          <TabsList className="w-max">
            <TabsTrigger value={TODOS}>{t('todas')}</TabsTrigger>
            {camp.info.tipos.map((tp) => (
              <TabsTrigger key={tp.clase.clave} value={tp.clase.clave} className="gap-1.5">
                <TypeIcon name={tp.estilo.icono} color={tp.estilo.color} className="size-3.5" />
                {tp.clase.etiqueta}
                <span className="text-xs tabular-nums text-muted-foreground">{tp.recuento}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={t('buscar')}
            aria-label={t('buscar')}
            className="pl-8"
          />
          {texto && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
              aria-label={t('common:acciones.limpiar')}
              onClick={() => setTexto('')}
            >
              <X />
            </Button>
          )}
        </div>
        <Select value={faccion || TODOS} onValueChange={(v) => update({ faccion: v === TODOS ? null : v, p: null })}>
          <SelectTrigger className="w-48" aria-label={t('faccion')}>
            <SelectValue placeholder={t('faccion')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>{t('cualquierFaccion')}</SelectItem>
            {facciones.data?.elementos.map((f) => (
              <SelectItem key={f.iri} value={f.id}>
                {f.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={orden} onValueChange={(v) => update({ orden: v, p: null })}>
          <SelectTrigger className="w-40" aria-label={t('orden.etiqueta')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nombre">{t('orden.nombre')}</SelectItem>
            <SelectItem value="reciente">{t('orden.reciente')}</SelectItem>
            <SelectItem value="relevancia">{t('orden.relevancia')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {lista.isPending ? (
        <LoadingState rows={6} />
      ) : lista.isError ? (
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      ) : lista.data.elementos.length === 0 ? (
        <EmptyState
          title={q || faccion ? t('sinResultados') : t('vacio', { tipo: titulo.toLowerCase() })}
          action={tipoInfo && !q && <NewEntityButton clave={tipoInfo.clase.clave} />}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {t('common:comun.total', { count: total })}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy={lista.isFetching}>
            {lista.data.elementos.map((e) => (
              <li key={e.iri} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <EntityLink id={e.id} etiqueta={e.etiqueta} tipo={e.tipo} className="text-base" />
                  {!e.editable && <Badge variant="outline">{t('common:comun.soloLectura')}</Badge>}
                </div>
                {e.descripcion && <p className="line-clamp-3 text-sm text-muted-foreground">{e.descripcion}</p>}
                <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                  {!tipo ? <TypeBadge tipo={e.tipo} /> : <span />}
                  {e.modificada && (
                    <span className="text-xs text-muted-foreground">{relativeTime(e.modificada, i18n.language)}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav className="flex items-center justify-center gap-2" aria-label={t('paginacion')}>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 0}
                onClick={() => update({ p: String(pagina - 1) })}
              >
                <ChevronLeft /> {t('common:comun.anterior')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('common:comun.pagina', { page: pagina + 1, pages: paginas })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina + 1 >= paginas}
                onClick={() => update({ p: String(pagina + 1) })}
              >
                {t('common:comun.siguiente')} <ChevronRight />
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}

/** Botón «Nuevo» que, si la clase admite variantes (p. ej. vástago, ghoul), ofrece elegirla. */
export function NewEntityButton({ clave }: { clave: string }) {
  const { t } = useTranslation('explorar')
  const camp = useCampaign()
  const tipo = camp.tipoPorClave.get(clave)
  const base = camp.path(`nueva/${encodeURIComponent(clave)}`)
  if (!tipo || tipo.variantes.length === 0) {
    return (
      <Button asChild>
        <Link to={base}>
          <Plus /> {t('nuevo', { tipo: tipo?.clase.etiqueta ?? '' })}
        </Link>
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus /> {t('nuevo', { tipo: tipo.clase.etiqueta })}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('variante')}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to={base}>{t('sinVariante')}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {tipo.variantes.map((v) => (
          <DropdownMenuItem key={v.clave} asChild>
            <Link to={`${base}?variante=${encodeURIComponent(v.clave)}`}>{v.etiqueta}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
