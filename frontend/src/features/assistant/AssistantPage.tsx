/**
 * Asistente interno (PydanticAI con un modelo LOCAL, p. ej. Ollama).
 *
 * Interfaz de petición única tipo chat: cada mensaje es una petición
 * independiente al backend. El asistente consulta el grafo y, si procede,
 * crea PROPUESTAS que una persona revisa después: nunca escribe en el canon.
 * La conversación vive solo en el estado del componente.
 */
import { BookOpen, Bot, Cpu, Eraser, Inbox, Loader2, RotateCcw, Send, ShieldCheck, UserRound, Wrench } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError, type Schemas } from '@/api/client'
import { useContextoLLM, useEstadoAgente, usePedirAgente } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type RespuestaAgente = Schemas['RespuestaAgente']

interface Turno {
  id: number
  peticion: string
  estado: 'pendiente' | 'ok' | 'error'
  respuesta?: RespuestaAgente
  error?: unknown
}

/** Estados HTTP que indican que el servidor del modelo no responde. */
const SIN_MODELO = new Set([0, 502, 503, 504])

export function AssistantPage() {
  const { t } = useTranslation('asistente')
  const camp = useCampaign()
  const pedir = usePedirAgente(camp.cid)
  const [texto, setTexto] = useState('')
  const [turnos, setTurnos] = useState<Turno[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const finalRef = useRef<HTMLDivElement>(null)
  const siguienteId = useRef(1)
  const textareaId = useId()
  const ayudaId = useId()
  const enCurso = turnos.some((x) => x.estado === 'pendiente')

  // Lleva a la vista el último turno cuando cambia la conversación.
  useEffect(() => {
    finalRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [turnos])

  const enviar = (peticion: string) => {
    const limpia = peticion.trim()
    if (!limpia || enCurso) return
    const id = siguienteId.current++
    setTurnos((prev) => [...prev, { id, peticion: limpia, estado: 'pendiente' }])
    setTexto('')
    pedir.mutate(limpia, {
      onSuccess: (respuesta) =>
        setTurnos((prev) => prev.map((x) => (x.id === id ? { ...x, estado: 'ok', respuesta } : x))),
      onError: (error) => setTurnos((prev) => prev.map((x) => (x.id === id ? { ...x, estado: 'error', error } : x))),
      onSettled: () => textareaRef.current?.focus(),
    })
  }

  const reintentar = (turno: Turno) => {
    setTurnos((prev) => prev.filter((x) => x.id !== turno.id))
    enviar(turno.peticion)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titulo')}
        subtitle={t('subtitulo')}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
        actions={
          turnos.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setTurnos([])} disabled={enCurso}>
              <Eraser /> {t('limpiar')}
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="order-2 min-w-0 space-y-4 lg:order-1">
          <section aria-label={t('conversacion')} className="space-y-4">
            {turnos.length === 0 ? (
              <Vacio onEjemplo={(e) => {
                setTexto(e)
                textareaRef.current?.focus()
              }} />
            ) : (
              <ol className="space-y-5" aria-live="polite" aria-relevant="additions text">
                {turnos.map((turno) => (
                  <TurnoView key={turno.id} turno={turno} onReintentar={() => reintentar(turno)} />
                ))}
              </ol>
            )}
            <div ref={finalRef} />
          </section>

          <form
            className="sticky bottom-0 space-y-2 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur"
            onSubmit={(e) => {
              e.preventDefault()
              enviar(texto)
            }}
          >
            <Label htmlFor={textareaId}>{t('formulario.etiqueta')}</Label>
            <Textarea
              id={textareaId}
              ref={textareaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  enviar(texto)
                }
              }}
              placeholder={t('formulario.placeholder')}
              aria-describedby={ayudaId}
              rows={3}
              className="max-h-64"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p id={ayudaId} className="text-xs text-muted-foreground">
                {t('formulario.atajo')}
              </p>
              <Button type="submit" disabled={!texto.trim() || enCurso}>
                {enCurso ? <Loader2 className="animate-spin" /> : <Send />}
                {t('formulario.enviar')}
              </Button>
            </div>
          </form>
        </div>

        <aside className="order-1 space-y-4 lg:order-2">
          <ConfigModelo />
          <ContextoModelo />
          <Alert role="note">
            <ShieldCheck />
            <AlertTitle>{t('seguridad.titulo')}</AlertTitle>
            <AlertDescription>
              <p>{t('seguridad.texto')}</p>
              <Link to={camp.path('propuestas')} className="font-medium text-primary underline-offset-4 hover:underline">
                {t('seguridad.enlace')}
              </Link>
            </AlertDescription>
          </Alert>
        </aside>
      </div>
    </div>
  )
}

/** Mismo reparto que el backend: ~30 % del contexto del modelo para el sistema de juego. */
const CHARS_POR_TOKEN = 3.5
const PARTE_CONTEXTO_JUEGO = 0.3

/** Lo que el modelo sabe del sistema de juego (lore, estadísticas, reglas), tal como lo recibe. */
function ContextoModelo() {
  const { t } = useTranslation('asistente')
  const camp = useCampaign()
  const estado = useEstadoAgente(camp.cid)
  const presupuesto = estado.data ? Math.round(estado.data.contexto * CHARS_POR_TOKEN * PARTE_CONTEXTO_JUEGO) : undefined
  const contexto = useContextoLLM(camp.cid, presupuesto, presupuesto !== undefined)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <BookOpen className="size-4" aria-hidden /> {t('contexto.titulo')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">{t('contexto.explicacion')}</p>
        {contexto.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : contexto.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {t('contexto.error')}
          </p>
        ) : (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              {t('contexto.ver', { count: contexto.data.texto.length })}
              {contexto.data.recortado && (
                <Badge variant="outline" className="ml-2 font-normal">
                  {t('contexto.recortado')}
                </Badge>
              )}
            </summary>
            <pre className="mt-2 max-h-96 overflow-auto rounded-md border bg-muted/40 p-2 font-sans text-xs whitespace-pre-wrap">
              {contexto.data.texto}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function ConfigModelo() {
  const { t } = useTranslation('asistente')
  const camp = useCampaign()
  const estado = useEstadoAgente(camp.cid)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Cpu className="size-4" aria-hidden /> {t('modelo.titulo')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {estado.isPending ? (
          <div className="space-y-2" role="status" aria-label={t('modelo.cargando')}>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : estado.isError ? (
          <p className="text-sm text-destructive" role="alert">
            {t('modelo.error')}
          </p>
        ) : (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('modelo.proveedor')}</dt>
            <dd className="truncate">{estado.data.proveedor}</dd>
            <dt className="text-muted-foreground">{t('modelo.modelo')}</dt>
            <dd className="truncate font-mono text-xs leading-5">{estado.data.modelo}</dd>
            <dt className="text-muted-foreground">{t('modelo.url')}</dt>
            <dd className="font-mono text-xs leading-5 break-all">{estado.data.url}</dd>
            <dt className="text-muted-foreground">{t('modelo.contexto')}</dt>
            <dd className="tabular-nums">{t('modelo.tokens', { count: estado.data.contexto })}</dd>
          </dl>
        )}
      </CardContent>
    </Card>
  )
}

function Vacio({ onEjemplo }: { onEjemplo: (texto: string) => void }) {
  const { t } = useTranslation('asistente')
  const ejemplos = t('vacio.ejemplos', { returnObjects: true }) as unknown
  const lista = Array.isArray(ejemplos) ? (ejemplos as string[]) : []
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
      <Bot className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{t('vacio.titulo')}</p>
      <p className="text-sm text-muted-foreground">{t('vacio.texto')}</p>
      {lista.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {lista.map((e) => (
            <Button key={e} type="button" variant="outline" size="sm" className="h-auto py-1 whitespace-normal" onClick={() => onEjemplo(e)}>
              {e}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

function TurnoView({ turno, onReintentar }: { turno: Turno; onReintentar: () => void }) {
  const { t } = useTranslation('asistente')
  return (
    <li className="space-y-3">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-lg rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
          <p className="sr-only">{t('turno.tu')}</p>
          <p className="break-words whitespace-pre-wrap">{turno.peticion}</p>
        </div>
        <UserRound className="mt-1 ml-2 size-5 shrink-0 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex">
        <Bot className="mt-1 mr-2 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className={cn('max-w-[85%] min-w-0 rounded-lg rounded-tl-sm border bg-card px-3 py-2 text-sm', turno.estado === 'error' && 'border-destructive/40 bg-destructive/5')}>
          <p className="sr-only">{t('turno.asistente')}</p>
          {turno.estado === 'pendiente' && <Pensando />}
          {turno.estado === 'ok' && turno.respuesta && <Respuesta respuesta={turno.respuesta} />}
          {turno.estado === 'error' && <ErrorTurno error={turno.error} onReintentar={onReintentar} />}
        </div>
      </div>
    </li>
  )
}

/** Indicador de espera con segundos transcurridos: los modelos locales pueden tardar. */
function Pensando() {
  const { t } = useTranslation('asistente')
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  return (
    <div role="status" className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{t('turno.pensando')}</span>
      {segundos >= 3 && <span className="text-xs tabular-nums">{t('turno.segundos', { count: segundos })}</span>}
    </div>
  )
}

function Respuesta({ respuesta }: { respuesta: RespuestaAgente }) {
  const { t } = useTranslation('asistente')
  const camp = useCampaign()
  return (
    <div className="space-y-2.5">
      <p className="break-words whitespace-pre-wrap">{respuesta.respuesta}</p>
      {respuesta.propuestas.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            {t('turno.propuestas', { count: respuesta.propuestas.length })}
          </p>
          <ul className="flex flex-wrap gap-2">
            {respuesta.propuestas.map((pid) => (
              <li key={pid}>
                <Button asChild variant="outline" size="sm">
                  <Link to={camp.path(`propuestas/${encodeURIComponent(pid)}`)}>
                    <Inbox /> {t('turno.verPropuesta', { id: pid })}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {respuesta.propuestas.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('turno.sinPropuestas')}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
        {respuesta.herramientas.length > 0 && (
          <>
            <Wrench className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="sr-only">{t('turno.herramientas')}</span>
            <ul className="flex flex-wrap gap-1" aria-label={t('turno.herramientas')}>
              {respuesta.herramientas.map((h, i) => (
                <li key={`${h}-${i}`}>
                  <Badge variant="secondary" className="font-mono text-[0.7rem] font-normal">
                    {h}
                  </Badge>
                </li>
              ))}
            </ul>
          </>
        )}
        <span className="ml-auto font-mono text-[0.7rem] text-muted-foreground">{respuesta.modelo}</span>
      </div>
    </div>
  )
}

function ErrorTurno({ error, onReintentar }: { error: unknown; onReintentar: () => void }) {
  const { t } = useTranslation('asistente')
  const sinModelo = error instanceof ApiError && SIN_MODELO.has(error.status)
  const detalle = error instanceof Error ? error.message : t('errores.desconocido', { ns: 'common' })
  return (
    <div role="alert" className="space-y-2">
      <p className="font-medium text-destructive">{sinModelo ? t('error.sinModelo') : t('error.titulo')}</p>
      {sinModelo && <p>{t('error.ayudaModelo')}</p>}
      <p className="text-xs break-words text-muted-foreground">{detalle}</p>
      <Button variant="outline" size="sm" onClick={onReintentar}>
        <RotateCcw /> {t('error.reintentar')}
      </Button>
    </div>
  )
}
