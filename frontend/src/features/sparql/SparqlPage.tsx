/**
 * Consola SPARQL: editor con resaltado y autocompletado, destino local o
 * federado (Wikidata/DBpedia), consultas de ejemplo y guardadas, resultados
 * en tabla con exportación CSV.
 */
import type { EditorView } from '@codemirror/view'
import { AlertTriangle, Braces, Loader2, Play } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Schemas } from '@/api/client'
import { useSparql } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { prefixDeclarations } from './completions'
import { QueriesPanel } from './QueriesPanel'
import { ResultsView } from './ResultsView'
import { SaveQueryDialog } from './SaveQueryDialog'
import { SparqlEditor } from './SparqlEditor'

type Destino = Schemas['ConsultaSparql']['destino']

const DESTINOS: Destino[] = ['local', 'wikidata', 'dbpedia']
const LIMITE_POR_DEFECTO = 200
const CONSULTA_INICIAL = `SELECT ?entidad ?tipo WHERE {
  ?entidad a ?tipo .
}
LIMIT 25`

function storageKey(cid: string) {
  return `loregraph.sparql.${cid}`
}

function readStored(cid: string): string | null {
  try {
    return sessionStorage.getItem(storageKey(cid))
  } catch {
    return null
  }
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function SparqlPage() {
  const { t } = useTranslation('sparql')
  const camp = useCampaign()
  const { cid } = camp
  const [consulta, setConsulta] = useState(() => readStored(cid) ?? CONSULTA_INICIAL)
  const [destino, setDestino] = useState<Destino>('local')
  const [limite, setLimite] = useState<string>(String(LIMITE_POR_DEFECTO))
  const sparql = useSparql(cid)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(cid), consulta)
    } catch {
      /* almacenamiento no disponible */
    }
  }, [cid, consulta])

  const limiteNum = Number(limite)
  const limiteValido = limite.trim() === '' || (Number.isInteger(limiteNum) && limiteNum > 0)

  const ejecutar = useCallback(() => {
    if (!consulta.trim() || !limiteValido || sparql.isPending) return
    sparql.mutate({
      consulta,
      destino,
      limite: limite.trim() === '' ? undefined : limiteNum,
    })
  }, [consulta, destino, limite, limiteNum, limiteValido, sparql])

  const insertarPrefijos = () => {
    const decl = prefixDeclarations(camp.info.prefijos, consulta)
    if (!decl) return
    const nuevo = `${decl}\n\n${consulta}`
    const view = viewRef.current
    if (view) {
      view.dispatch({ changes: { from: 0, insert: `${decl}\n\n` } })
      view.focus()
    } else {
      setConsulta(nuevo)
    }
  }

  const atajo = isMac ? '⌘ Enter' : 'Ctrl Enter'

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('titulo')}
        subtitle={t('subtitulo')}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <Card className="gap-3 py-3">
            <CardContent className="space-y-3 px-3">
              <SparqlEditor
                value={consulta}
                onChange={setConsulta}
                onRun={ejecutar}
                prefijos={camp.info.prefijos}
                ariaLabel={t('editor.etiqueta')}
                placeholder={t('editor.placeholder')}
                onCreateView={(v) => {
                  viewRef.current = v
                }}
              />
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="sparql-destino" className="text-xs">
                    {t('destino.etiqueta')}
                  </Label>
                  <Select value={destino} onValueChange={(v) => setDestino(v as Destino)}>
                    <SelectTrigger id="sparql-destino" size="sm" className="min-w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DESTINOS.map((d) => (
                        <SelectItem key={d} value={d}>
                          {t(`destino.${d}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sparql-limite" className="text-xs">
                    {t('limite')}
                  </Label>
                  <Input
                    id="sparql-limite"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    value={limite}
                    onChange={(e) => setLimite(e.target.value)}
                    aria-invalid={!limiteValido}
                    className="h-7 w-24"
                  />
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {Object.keys(camp.info.prefijos).length > 0 && (
                    <Button variant="ghost" size="sm" onClick={insertarPrefijos} title={t('prefijos.desc')}>
                      <Braces /> {t('prefijos.insertar')}
                    </Button>
                  )}
                  <SaveQueryDialog cid={cid} consulta={consulta} disabled={!consulta.trim()} />
                  <Button size="sm" onClick={ejecutar} disabled={!consulta.trim() || !limiteValido || sparql.isPending}>
                    {sparql.isPending ? <Loader2 className="animate-spin" /> : <Play />}
                    {t('ejecutar')}
                    <kbd className="ml-1 hidden rounded border border-current/30 px-1 text-[10px] opacity-80 sm:inline">{atajo}</kbd>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {destino === 'local' ? t('destino.ayudaLocal') : t('destino.ayudaRemoto', { destino: t(`destino.${destino}`) })}
              </p>
              {sparql.isError && (
                <Alert variant="destructive" role="alert">
                  <AlertTriangle />
                  <AlertTitle>{t('error')}</AlertTitle>
                  <AlertDescription className="font-mono text-xs break-words whitespace-pre-wrap">
                    {sparql.error.message}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {sparql.isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" /> {t('ejecutando')}
            </p>
          )}
          {sparql.data && !sparql.isPending && (
            <ResultsView res={sparql.data} nombreArchivo={`sparql-${cid}`} />
          )}
          {!sparql.data && !sparql.isPending && !sparql.isError && (
            <p className="text-sm text-muted-foreground">{t('ayuda', { atajo })}</p>
          )}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto" aria-label={t('consultas.titulo')}>
          <QueriesPanel
            cid={cid}
            onLoad={(q) => {
              setConsulta(q.consulta)
              sparql.reset()
            }}
          />
        </aside>
      </div>
    </div>
  )
}
