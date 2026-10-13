/**
 * Diff visual de una propuesta: tripletas añadidas (verde, «+») y eliminadas
 * (rojo, «−») en lenguaje legible, agrupadas por sujeto y con los nodos
 * cualificados anidados bajo su dueño.
 */
import { ArrowRight, Sparkles } from 'lucide-react'
import { createContext, useContext, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Termino, TripletaLegible } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { EntityLink, TypeBadge } from '@/components/common/EntityLink'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { agruparTripletas, entidadesNuevas, type GrupoDiff } from './diff'
import { compactIri, datatypeVisible, esNodoAnidado } from './utils'

type Tipo = 'anadida' | 'eliminada'

interface DiffCtx {
  tipo: Tipo
  verIris: boolean
  prefijos: Record<string, string>
  /** Entidades que crea la propuesta: aún no tienen ficha. */
  nuevas: Set<string>
}

const Ctx = createContext<DiffCtx>({ tipo: 'anadida', verIris: false, prefijos: {}, nuevas: new Set() })

const ESTILO: Record<Tipo, { marca: string; borde: string; fondo: string; texto: string }> = {
  anadida: {
    marca: '+',
    borde: 'border-emerald-500/40',
    fondo: 'bg-emerald-500/5',
    texto: 'text-emerald-700 dark:text-emerald-400',
  },
  eliminada: {
    marca: '−',
    borde: 'border-red-500/40',
    fondo: 'bg-red-500/5',
    texto: 'text-red-700 dark:text-red-400',
  },
}

export function TripleDiff({
  anadidas,
  eliminadas,
  verIris,
}: {
  anadidas: TripletaLegible[]
  eliminadas: TripletaLegible[]
  verIris: boolean
}) {
  const { t } = useTranslation('propuestas')
  const nuevas = useMemo(() => entidadesNuevas(anadidas), [anadidas])
  if (anadidas.length === 0 && eliminadas.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('diff.vacio')}</p>
  }
  return (
    <div className="space-y-6">
      {anadidas.length > 0 && (
        <SeccionDiff tipo="anadida" tripletas={anadidas} verIris={verIris} nuevas={nuevas} titulo={t('diff.anadidas', { count: anadidas.length })} />
      )}
      {eliminadas.length > 0 && (
        <SeccionDiff tipo="eliminada" tripletas={eliminadas} verIris={verIris} nuevas={nuevas} titulo={t('diff.eliminadas', { count: eliminadas.length })} />
      )}
    </div>
  )
}

function SeccionDiff({
  tipo,
  tripletas,
  verIris,
  nuevas,
  titulo,
}: {
  tipo: Tipo
  tripletas: TripletaLegible[]
  verIris: boolean
  nuevas: Set<string>
  titulo: string
}) {
  const camp = useCampaign()
  const grupos = useMemo(() => agruparTripletas(tripletas), [tripletas])
  const ctx = useMemo<DiffCtx>(
    () => ({ tipo, verIris, prefijos: camp.info.prefijos, nuevas }),
    [tipo, verIris, camp.info.prefijos, nuevas],
  )
  const id = `diff-${tipo}`
  return (
    <section aria-labelledby={id} data-diff={tipo} className="space-y-2">
      <h4 id={id} className={cn('flex items-center gap-2 text-sm font-semibold', ESTILO[tipo].texto)}>
        <span aria-hidden className="font-mono text-base">
          {ESTILO[tipo].marca}
        </span>
        {titulo}
      </h4>
      <Ctx.Provider value={ctx}>
        <ul className="space-y-3">
          {grupos.map((g) => (
            <BloqueSujeto key={g.clave} grupo={g} />
          ))}
        </ul>
      </Ctx.Provider>
    </section>
  )
}

/** Marca «+»/«−» visible, con texto para lectores de pantalla. */
function Marca() {
  const { t } = useTranslation('propuestas')
  const { tipo } = useContext(Ctx)
  return (
    <>
      <span aria-hidden className={cn('w-3 shrink-0 text-center font-mono font-semibold', ESTILO[tipo].texto)}>
        {ESTILO[tipo].marca}
      </span>
      <span className="sr-only">{t(`diff.marca.${tipo}`)}</span>
    </>
  )
}

function BloqueSujeto({
  grupo,
  anidado = false,
  sinCabecera = false,
}: {
  grupo: GrupoDiff
  anidado?: boolean
  /** Nodo anidado bajo una línea que ya lo nombra: la cabecera sobra (salvo al ver IRIs). */
  sinCabecera?: boolean
}) {
  const { t } = useTranslation('propuestas')
  const { tipo, verIris, nuevas } = useContext(Ctx)
  const estilo = ESTILO[tipo]
  const esNueva = nuevas.has(grupo.clave)
  const Elemento = anidado ? 'div' : 'li'
  return (
    <Elemento
      className={cn(
        'min-w-0 rounded-md border-l-4 py-2 pr-2 pl-3',
        estilo.borde,
        anidado ? 'mt-1.5 ml-1 border-dashed bg-muted/40' : estilo.fondo,
      )}
      data-sujeto={grupo.clave}
    >
      {!(sinCabecera && !verIris) && (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {grupo.anidado && grupo.tipos.length > 0 ? (
          // Un nodo cualificado se reconoce por su tipo; su id local no dice nada.
          <span className="text-sm font-medium">{grupo.tipos.map((x) => x.etiqueta).join(' · ')}</span>
        ) : (
          <EtiquetaSujeto sujeto={grupo.sujeto} enlazar={!esNueva} />
        )}
        {esNueva && (
          <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[0.7rem]">
            <Sparkles className="size-3" aria-hidden />
            {t('diff.nueva')}
          </Badge>
        )}
        {!grupo.anidado &&
          grupo.tipos.map((tp) => (
            <span key={tp.valor} className="inline-flex items-center gap-0.5">
              <Marca />
              <TypeBadge tipo={{ iri: tp.valor, clave: tp.clave ?? tp.valor, etiqueta: tp.etiqueta }} />
            </span>
          ))}
      </div>
      )}
      {verIris && <IriSujeto grupo={grupo} />}
      {grupo.lineas.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {grupo.lineas.map((l, i) => (
            <li key={`${l.tripleta.predicado.valor}-${l.tripleta.objeto.valor}-${i}`} className="min-w-0">
              <LineaTripleta tripleta={l.tripleta} nodo={l.anidado} />
              {l.anidado && (
                <div className="ml-5">
                  <BloqueSujeto grupo={l.anidado} anidado sinCabecera />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {grupo.hijos.length > 0 && (
        <div className="ml-5">
          {grupo.hijos.map((h) => (
            <BloqueSujeto key={h.clave} grupo={h} anidado />
          ))}
        </div>
      )}
    </Elemento>
  )
}

function IriSujeto({ grupo }: { grupo: GrupoDiff }) {
  const { prefijos } = useContext(Ctx)
  return (
    <div className="mt-1 space-y-0.5">
      <code className="block font-mono text-xs break-all text-muted-foreground">{grupo.sujeto.valor}</code>
      {grupo.anidado &&
        grupo.tipos.map((tp) => (
          <code key={tp.valor} className="block font-mono text-xs break-all text-muted-foreground">
            a {tp.clave ?? compactIri(tp.valor, prefijos)}
          </code>
        ))}
      {!grupo.anidado && grupo.tipos.length > 0 && (
        <code className="block font-mono text-xs break-all text-muted-foreground">
          a {grupo.tipos.map((tp) => tp.clave ?? compactIri(tp.valor, prefijos)).join(', ')}
        </code>
      )}
    </div>
  )
}

function EtiquetaSujeto({ sujeto, enlazar }: { sujeto: Termino; enlazar: boolean }) {
  if (sujeto.tipo === 'iri' && sujeto.id && enlazar && !esNodoAnidado(sujeto.id)) {
    return <EntityLink id={sujeto.id} etiqueta={sujeto.etiqueta} showIcon={false} className="text-sm font-semibold" />
  }
  return <span className="text-sm font-semibold break-words">{sujeto.etiqueta}</span>
}

/** «predicado → objeto», o sus IRIs/claves si se ha pedido verlas. */
function LineaTripleta({ tripleta, nodo }: { tripleta: TripletaLegible; nodo?: GrupoDiff }) {
  const { verIris, prefijos } = useContext(Ctx)
  const p = tripleta.predicado
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-sm">
      <Marca />
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {verIris ? (
          <code className="font-mono text-xs break-all" title={p.valor}>
            {p.clave ?? compactIri(p.valor, prefijos)}
          </code>
        ) : (
          <span className="text-muted-foreground" title={p.clave ?? p.valor}>
            {p.etiqueta}
          </span>
        )}
        <ArrowRight className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" aria-label="→" />
        {nodo && !verIris && nodo.tipos.length > 0 ? (
          // El objeto es un nodo cualificado que se detalla justo debajo.
          <span className="font-medium">{nodo.tipos.map((x) => x.etiqueta).join(' · ')}</span>
        ) : (
          <ValorObjeto termino={tripleta.objeto} />
        )}
      </span>
    </div>
  )
}

function ValorObjeto({ termino }: { termino: Termino }) {
  const { verIris, prefijos, nuevas } = useContext(Ctx)
  if (verIris) {
    if (termino.tipo === 'literal') {
      const sufijo = termino.idioma
        ? `@${termino.idioma}`
        : datatypeVisible(termino.datatype)
          ? `^^${compactIri(termino.datatype ?? '', prefijos)}`
          : ''
      return (
        <code className="font-mono text-xs break-all whitespace-pre-wrap">
          {JSON.stringify(termino.valor)}
          {sufijo}
        </code>
      )
    }
    return (
      <code className="font-mono text-xs break-all" title={termino.valor}>
        {termino.clave ?? compactIri(termino.valor, prefijos)}
      </code>
    )
  }
  if (termino.tipo === 'literal') {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-baseline gap-1">
        <span className="rounded bg-muted px-1 break-words whitespace-pre-wrap">{termino.valor}</span>
        {termino.idioma && <span className="text-xs text-muted-foreground">@{termino.idioma}</span>}
        {!termino.idioma && datatypeVisible(termino.datatype) && (
          <span className="font-mono text-[0.7rem] text-muted-foreground" title={termino.datatype ?? undefined}>
            {compactIri(termino.datatype ?? '', prefijos)}
          </span>
        )}
      </span>
    )
  }
  if (termino.tipo === 'blanco') return <span className="italic">{termino.etiqueta}</span>
  if (termino.id && !esNodoAnidado(termino.id)) {
    const nueva = nuevas.has(termino.valor)
    return <EntityLink id={nueva ? null : termino.id} etiqueta={termino.etiqueta} showIcon={false} className="font-medium" />
  }
  if (termino.id) return <span className="text-muted-foreground italic">{termino.etiqueta}</span>
  // Término de la ontología o concepto de un vocabulario.
  return (
    <span className="rounded border px-1 text-[0.8rem]" title={termino.clave ?? termino.valor}>
      {termino.etiqueta}
    </span>
  )
}
