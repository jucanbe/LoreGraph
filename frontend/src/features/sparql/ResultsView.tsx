import { CheckCircle2, Database, Download, Timer, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ResultadoSparql } from '@/api/hooks'
import { EmptyState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { downloadText } from '@/lib/format'
import { hasRows, resultToCsv, type ModoCsv } from './results'
import { TermView } from './TermView'

/** Máximo de filas que se pintan (el CSV exporta todas). */
const MAX_FILAS_VISIBLES = 2000

function formatDuracion(segundos: number, lang: string): string {
  if (segundos < 1) return `${Math.round(segundos * 1000)} ms`
  return `${new Intl.NumberFormat(lang, { maximumFractionDigits: 2 }).format(segundos)} s`
}

function SelectTable({ res }: { res: ResultadoSparql }) {
  const { t } = useTranslation('sparql')
  const vars = res.variables ?? []
  const filas = res.filas ?? []
  const visibles = filas.slice(0, MAX_FILAS_VISIBLES)
  return (
    <div className="max-h-[60svh] overflow-auto rounded-lg border">
      <table className="w-full caption-bottom border-collapse text-sm">
        <caption className="sr-only">{t('resultados.tabla')}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 z-10 w-10 border-b bg-muted px-2 py-2 text-right text-xs font-medium text-muted-foreground">
              #
            </th>
            {vars.map((v) => (
              <th
                key={v}
                scope="col"
                className="sticky top-0 z-10 border-b bg-muted px-3 py-2 text-left font-mono text-xs font-semibold whitespace-nowrap"
              >
                ?{v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibles.map((f, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
              <td className="px-2 py-1.5 text-right align-top text-xs text-muted-foreground tabular-nums">{i + 1}</td>
              {vars.map((v) => (
                <td key={v} className="max-w-md min-w-24 px-3 py-1.5 align-top">
                  <TermView term={f[v]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length > MAX_FILAS_VISIBLES && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          {t('resultados.recortadas', { visibles: MAX_FILAS_VISIBLES, total: filas.length })}
        </p>
      )}
    </div>
  )
}

function TripleList({ res }: { res: ResultadoSparql }) {
  const { t } = useTranslation('sparql')
  const tripletas = (res.tripletas ?? []).slice(0, MAX_FILAS_VISIBLES)
  return (
    <ul className="max-h-[60svh] divide-y overflow-auto rounded-lg border text-sm" aria-label={t('resultados.tripletas')}>
      {tripletas.map((tr, i) => (
        <li key={i} className="grid gap-x-3 gap-y-0.5 px-3 py-2 sm:grid-cols-[1fr_auto_1fr]">
          <TermView term={tr.sujeto} />
          <span className="text-muted-foreground">
            <TermView term={tr.predicado} />
          </span>
          <TermView term={tr.objeto} />
        </li>
      ))}
    </ul>
  )
}

/** Resultado de una consulta: metadatos, exportación CSV y tabla / booleano / tripletas. */
export function ResultsView({ res, nombreArchivo }: { res: ResultadoSparql; nombreArchivo: string }) {
  const { t, i18n } = useTranslation('sparql')
  const [modo, setModo] = useState<ModoCsv>('etiquetas')
  const n = res.tipo === 'select' ? (res.filas?.length ?? 0) : res.tipo === 'construct' ? (res.tripletas?.length ?? 0) : null

  const exportar = () => {
    const csv = resultToCsv(res, modo, [t('resultados.sujeto'), t('resultados.predicado'), t('resultados.objeto')])
    downloadText(`${nombreArchivo}.csv`, csv, 'text/csv')
  }

  return (
    <section className="space-y-3" aria-labelledby="sparql-resultados">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="sparql-resultados" className="text-base font-semibold">
          {t('resultados.titulo')}
        </h2>
        <Badge variant="secondary" className="uppercase">
          {res.tipo}
        </Badge>
        {n !== null && <Badge variant="outline">{t('resultados.filas', { count: n })}</Badge>}
        <Badge variant="outline" className="gap-1 font-normal">
          <Timer className="size-3" /> {formatDuracion(res.duracion, i18n.language)}
        </Badge>
        {res.cache && (
          <Badge variant="outline" className="gap-1 font-normal" title={t('resultados.cacheDesc')}>
            <Database className="size-3" /> {t('resultados.cache')}
          </Badge>
        )}
        {res.truncado && (
          <Badge variant="outline" className="border-amber-500/50 font-normal text-amber-700 dark:text-amber-400" title={t('resultados.truncadoDesc')}>
            {t('resultados.truncado')}
          </Badge>
        )}
        {res.tipo !== 'ask' && hasRows(res) && (
          <div className="ml-auto flex items-center gap-2">
            <Select value={modo} onValueChange={(v) => setModo(v as ModoCsv)}>
              <SelectTrigger size="sm" aria-label={t('csv.modo')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="etiquetas">{t('csv.etiquetas')}</SelectItem>
                <SelectItem value="valores">{t('csv.valores')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportar}>
              <Download /> {t('csv.exportar')}
            </Button>
          </div>
        )}
      </div>

      {res.tipo === 'ask' ? (
        <div className="flex items-center gap-3 rounded-lg border p-4">
          {res.booleano ? (
            <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="size-6 text-destructive" />
          )}
          <Badge variant={res.booleano ? 'secondary' : 'destructive'} className="px-3 text-sm">
            {res.booleano ? t('resultados.verdadero') : t('resultados.falso')}
          </Badge>
        </div>
      ) : !hasRows(res) ? (
        <EmptyState title={t('resultados.vacio')} className="p-6" />
      ) : res.tipo === 'select' ? (
        <SelectTable res={res} />
      ) : (
        <TripleList res={res} />
      )}
    </section>
  )
}
