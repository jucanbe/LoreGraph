import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle2,
  Database,
  Globe2,
  Loader2,
  PlugZap,
  RotateCcw,
  Save,
  Swords,
  Terminal,
  UserRound,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useAjustes, useGuardarAjustes, useProbarLLM, type Ajustes, type AjustesEntrada } from '@/api/hooks'
import { Preferences } from '@/components/common/Preferences'
import { QueryState } from '@/components/common/States'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

type Clave = keyof Omit<AjustesEntrada, 'restablecer'>
type Borrador = Partial<Record<Clave, string | number | boolean | null>>

const PRESETS = [
  { id: 'ollama', proveedor: 'ollama', url: 'http://localhost:11434/v1' },
  { id: 'lmstudio', proveedor: 'openai', url: 'http://localhost:1234/v1' },
  { id: 'llamacpp', proveedor: 'openai', url: 'http://localhost:8080/v1' },
] as const

/** Cómo pide el generador de IA el JSON estructurado al modelo (PydanticAI output modes). */
const MODOS_SALIDA = ['tool', 'native', 'prompted'] as const

/** Ajustes de la aplicación: modelo del asistente, identidad, mundo real y SPARQL. */
export function SettingsPage() {
  const { t } = useTranslation('ajustes')
  const location = useLocation()
  const desde = (location.state as { desde?: string } | null)?.desde ?? '/'
  const ajustes = useAjustes()

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4 sm:px-6">
          <Swords className="size-6" />
          <p className="flex-1 font-heading text-lg font-semibold">{t('common:app.nombre')}</p>
          <Preferences />
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to={desde}>
            <ArrowLeft /> {t('common:nav.volver')}
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('titulo')}</h1>
          <p className="text-muted-foreground">{t('subtitulo')}</p>
        </div>
        <QueryState query={ajustes}>{(data) => <SettingsForm data={data} />}</QueryState>
      </main>
    </div>
  )
}

function SettingsForm({ data }: { data: Ajustes }) {
  const { t } = useTranslation('ajustes')
  const guardar = useGuardarAjustes()
  const probar = useProbarLLM()
  const [borrador, setBorrador] = useState<Borrador>({})
  const [restablecer, setRestablecer] = useState<Clave[]>([])
  const [errores, setErrores] = useState<Record<string, string>>({})

  // Al recibir datos nuevos (tras guardar), se descarta el borrador.
  useEffect(() => {
    setBorrador({})
    setRestablecer([])
  }, [data])

  const a = data.ajustes
  const valor = (k: Clave): string | number | boolean | null => {
    if (k in borrador) return borrador[k] ?? null
    if (restablecer.includes(k)) return (a[k]?.porDefecto as string | number | boolean | null) ?? null
    return (a[k]?.valor as string | number | boolean | null) ?? null
  }
  const set = (k: Clave, v: string | number | boolean | null) => {
    setBorrador((b) => ({ ...b, [k]: v }))
    setRestablecer((r) => r.filter((x) => x !== k))
  }
  const reset = (k: Clave) => {
    setBorrador((b) => {
      const n = { ...b }
      delete n[k]
      return n
    })
    setRestablecer((r) => (r.includes(k) ? r : [...r, k]))
  }
  const sucio = Object.keys(borrador).length > 0 || restablecer.length > 0

  const submit = () => {
    const body: AjustesEntrada = { ...(borrador as AjustesEntrada), restablecer }
    setErrores({})
    guardar.mutate(body, {
      onSuccess: () => toast.success(t('guardado')),
      onError: (err) => {
        if (err instanceof ApiError && err.errores.length) {
          setErrores(Object.fromEntries(err.errores.map((e) => [e.campo ?? '', e.mensaje])))
        }
        toast.error(err.message)
      },
    })
  }

  const modelosDisponibles = useMemo(() => probar.data?.modelos ?? [], [probar.data])

  const campo = (k: Clave, etiqueta: string, control: ReactNode, ayuda?: string) => (
    <Field
      key={k}
      id={`ajuste-${k}`}
      etiqueta={etiqueta}
      ayuda={ayuda}
      error={errores[k]}
      origen={k in borrador ? 'editado' : restablecer.includes(k) ? 'env' : (a[k]?.origen ?? 'env')}
      onReset={a[k]?.origen === 'ajustes' || k in borrador ? () => reset(k) : undefined}
    >
      {control}
    </Field>
  )
  const numero = (k: Clave, props: { min?: number; max?: number; step?: number } = {}) => (
    <Input
      id={`ajuste-${k}`}
      type="number"
      className="w-40"
      value={String(valor(k) ?? '')}
      onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))}
      aria-invalid={!!errores[k] || undefined}
      {...props}
    />
  )
  const texto = (k: Clave, props: { placeholder?: string; type?: string } = {}) => (
    <Input
      id={`ajuste-${k}`}
      value={String(valor(k) ?? '')}
      onChange={(e) => set(k, e.target.value)}
      aria-invalid={!!errores[k] || undefined}
      {...props}
    />
  )

  const claveGuardada = a.llm_api_key?.configurado && !('llm_api_key' in borrador)

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Alert>
        <Database />
        <AlertTitle>{t('almacen.titulo')}</AlertTitle>
        <AlertDescription>{t('almacen.texto')}</AlertDescription>
      </Alert>

      <Section icon={<BrainCircuit className="size-5" />} titulo={t('llm.titulo')} descripcion={t('llm.descripcion')}>
        <div className="flex flex-wrap gap-2">
          <span className="self-center text-sm text-muted-foreground">{t('llm.presets')}:</span>
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                set('llm_provider', p.proveedor)
                set('llm_base_url', p.url)
              }}
            >
              {t(`llm.preset.${p.id}`)}
            </Button>
          ))}
        </div>
        {campo(
          'llm_provider',
          t('llm.proveedor'),
          <Select value={String(valor('llm_provider') ?? 'ollama')} onValueChange={(v) => set('llm_provider', v)}>
            <SelectTrigger id="ajuste-llm_provider" className="w-72">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ollama">Ollama</SelectItem>
              <SelectItem value="openai">{t('llm.compatibleOpenAI')}</SelectItem>
            </SelectContent>
          </Select>,
        )}
        {campo('llm_base_url', t('llm.url'), texto('llm_base_url', { placeholder: 'http://localhost:11434/v1' }))}
        {campo(
          'llm_model',
          t('llm.modelo'),
          <>
            <Input
              id="ajuste-llm_model"
              list="modelos-disponibles"
              value={String(valor('llm_model') ?? '')}
              onChange={(e) => set('llm_model', e.target.value)}
              aria-invalid={!!errores.llm_model || undefined}
            />
            <datalist id="modelos-disponibles">
              {modelosDisponibles.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </>,
          t('llm.modeloAyuda'),
        )}
        {campo(
          'llm_api_key',
          t('llm.clave'),
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="ajuste-llm_api_key"
              type="password"
              autoComplete="off"
              className="max-w-sm"
              placeholder={claveGuardada ? t('llm.claveGuardada') : t('llm.sinClave')}
              value={'llm_api_key' in borrador ? String(borrador.llm_api_key ?? '') : ''}
              onChange={(e) => set('llm_api_key', e.target.value)}
            />
            {claveGuardada && (
              <Button type="button" variant="outline" size="sm" onClick={() => set('llm_api_key', '')}>
                {t('llm.quitarClave')}
              </Button>
            )}
          </div>,
          t('llm.claveAyuda'),
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {campo('llm_context_tokens', t('llm.contexto'), numero('llm_context_tokens', { min: 512, step: 512 }), t('llm.contextoAyuda'))}
          {campo('llm_timeout_s', t('llm.timeout'), numero('llm_timeout_s', { min: 5 }))}
          {campo('llm_max_retries', t('llm.reintentos'), numero('llm_max_retries', { min: 0, max: 10 }), t('llm.reintentosAyuda'))}
        </div>
        {campo(
          'llm_output_mode',
          t('llm.modoSalida'),
          <>
            <Select value={String(valor('llm_output_mode') ?? 'tool')} onValueChange={(v) => set('llm_output_mode', v)}>
              <SelectTrigger id="ajuste-llm_output_mode" className="w-full sm:w-80">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODOS_SALIDA.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`llm.modo.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {MODOS_SALIDA.includes(valor('llm_output_mode') as (typeof MODOS_SALIDA)[number]) && (
              <p className="text-xs text-muted-foreground">{t(`llm.modoDesc.${valor('llm_output_mode') as string}`)}</p>
            )}
          </>,
          t('llm.modoSalidaAyuda'),
        )}
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => probar.mutate()} disabled={probar.isPending || sucio}>
              {probar.isPending ? <Loader2 className="animate-spin" /> : <PlugZap />} {t('llm.probar')}
            </Button>
            {sucio && <span className="text-xs text-muted-foreground">{t('llm.guardaAntes')}</span>}
          </div>
          {probar.data && (
            <div role="status" className="space-y-2 text-sm">
              {probar.data.ok ? (
                <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" /> {t('llm.conectado', { count: probar.data.modelos.length })}
                  {probar.data.modeloDisponible === false && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">
                      {t('llm.modeloNoEncontrado')}
                    </Badge>
                  )}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-destructive">
                  <XCircle className="size-4" /> {probar.data.error}
                </p>
              )}
              {modelosDisponibles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {modelosDisponibles.map((m) => (
                    <Button key={m} type="button" size="xs" variant={valor('llm_model') === m ? 'default' : 'outline'} onClick={() => set('llm_model', m)}>
                      {m}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          {probar.isError && <p className="text-sm text-destructive">{probar.error.message}</p>}
        </div>
      </Section>

      <Section icon={<UserRound className="size-5" />} titulo={t('identidad.titulo')} descripcion={t('identidad.descripcion')}>
        {campo('user_name', t('identidad.nombre'), texto('user_name'), t('identidad.nombreAyuda'))}
      </Section>

      <Section icon={<Globe2 className="size-5" />} titulo={t('mundo.titulo')} descripcion={t('mundo.descripcion')}>
        {campo(
          'federation_enabled',
          t('mundo.activo'),
          <Switch
            id="ajuste-federation_enabled"
            checked={valor('federation_enabled') === true}
            onCheckedChange={(v) => set('federation_enabled', v)}
          />,
        )}
        {campo('federation_user_agent', t('mundo.agente'), texto('federation_user_agent'), t('mundo.agenteAyuda'))}
        {campo('federation_timeout_s', t('mundo.timeout'), numero('federation_timeout_s', { min: 1, max: 120 }))}
      </Section>

      <Section icon={<Terminal className="size-5" />} titulo={t('sparql.titulo')} descripcion={t('sparql.descripcion')}>
        <div className="grid gap-4 sm:grid-cols-2">
          {campo('sparql_max_results', t('sparql.limite'), numero('sparql_max_results', { min: 1 }))}
          {campo('sparql_timeout_s', t('sparql.timeout'), numero('sparql_timeout_s', { min: 1, max: 600 }))}
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        <Button
          type="button"
          variant="outline"
          disabled={!sucio || guardar.isPending}
          onClick={() => {
            setBorrador({})
            setRestablecer([])
          }}
        >
          {t('descartar')}
        </Button>
        <Button type="submit" disabled={!sucio || guardar.isPending}>
          {guardar.isPending ? <Loader2 className="animate-spin" /> : <Save />} {t('common:acciones.guardar')}
        </Button>
      </div>
    </form>
  )
}

function Section({ icon, titulo, descripcion, children }: { icon: ReactNode; titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {titulo}
        </CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  )
}

function Field({
  id,
  etiqueta,
  ayuda,
  error,
  origen,
  onReset,
  children,
}: {
  id: string
  etiqueta: string
  ayuda?: string
  error?: string
  origen: 'env' | 'ajustes' | 'editado'
  onReset?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation('ajustes')
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id}>{etiqueta}</Label>
        <Badge variant={origen === 'env' ? 'outline' : 'secondary'} className="font-normal">
          {t(`origen.${origen}`)}
        </Badge>
        {onReset && (
          <Button type="button" variant="ghost" size="xs" onClick={onReset} title={t('restablecerAyuda')}>
            <RotateCcw /> {t('restablecer')}
          </Button>
        )}
      </div>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
