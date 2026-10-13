/** Ajustes de una campaña: datos generales, lore para la IA, modelo propio, sesión en curso, exportar y borrar. */
import {
  BookOpenText,
  BrainCircuit,
  CalendarClock,
  Download,
  Loader2,
  Save,
  Settings2,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError, type ErrorValidacion } from '@/api/client'
import {
  exportarCampanaUrl,
  useAjustes,
  useAjustesCampana,
  useBorrarCampana,
  useEditarCampana,
  useGuardarAjustesCampana,
  useModulos,
  useSesiones,
  type AjustesCampana,
  type AjustesCampanaEntrada,
} from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { LoadingState, QueryState } from '@/components/common/States'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { StringListEditor } from './StringListEditor'

/** Valor del Select para «sin sesión fijada» (Radix no admite la cadena vacía). */
const AUTO = '__auto__'

export function CampaignSettingsPage() {
  const { t } = useTranslation('ajustesCampana')
  const camp = useCampaign()
  const ajustes = useAjustesCampana(camp.cid)
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t('titulo')}
        subtitle={t('subtitulo')}
        migas={[{ label: camp.info.campana.nombre, to: camp.path() }, { label: t('titulo') }]}
      />
      <GeneralSection key={JSON.stringify([camp.info.campana.nombre, camp.info.campana.descripcion, camp.info.campana.modulos])} />
      {/* La clave remonta el formulario al llegar datos nuevos (tras guardar): el borrador parte de ellos. */}
      <QueryState query={ajustes}>{(data) => <AjustesForm key={JSON.stringify(data)} data={data} />}</QueryState>
      <ExportSection />
      <DangerZone />
    </div>
  )
}

// ------------------------------------------------------------------ utilidades
function Section({
  icon,
  titulo,
  descripcion,
  children,
  className,
}: {
  icon: ReactNode
  titulo: string
  descripcion: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
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
  children,
}: {
  id: string
  etiqueta: string
  ayuda?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
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

/** Errores de validación por campo: admite `campo` completo («lore.tono») o solo el último segmento. */
function erroresPorCampo(errores: ErrorValidacion[]): Record<string, string> {
  const res: Record<string, string> = {}
  for (const e of errores) {
    if (!e.campo) continue
    res[e.campo] = e.mensaje
    const ultimo = e.campo.split('.').pop()
    if (ultimo) res[ultimo] ??= e.mensaje
  }
  return res
}

function ErroresAlert({ errores }: { errores: ErrorValidacion[] }) {
  const { t } = useTranslation()
  if (errores.length === 0) return null
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>{t('estado.error')}</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {errores.map((e, i) => (
            <li key={i}>
              {e.campo && <span className="font-mono text-xs">{e.campo}: </span>}
              {e.mensaje}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

// --------------------------------------------------------------------- general
function GeneralSection() {
  const { t } = useTranslation('ajustesCampana')
  const camp = useCampaign()
  const c = camp.info.campana
  const modulos = useModulos()
  const editar = useEditarCampana(camp.cid)
  const [nombre, setNombre] = useState(c.nombre)
  const [descripcion, setDescripcion] = useState(c.descripcion)
  const [elegidos, setElegidos] = useState<string[]>(c.modulos)
  const [errores, setErrores] = useState<ErrorValidacion[]>([])

  const seleccionables = (modulos.data ?? []).filter((m) => m.categoria !== 'nucleo')
  // Módulos de la campaña que ya no están instalados: se conservan y se muestran igualmente.
  const huerfanos = elegidos.filter((id) => !seleccionables.some((m) => m.id === id))
  const sucio =
    nombre !== c.nombre ||
    descripcion !== c.descripcion ||
    [...elegidos].sort().join() !== [...c.modulos].sort().join()

  const toggle = (id: string, on: boolean) =>
    setElegidos((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setErrores([])
    editar.mutate(
      { id: camp.cid, nombre: nombre.trim(), descripcion: descripcion.trim(), modulos: elegidos },
      {
        onSuccess: () => toast.success(t('general.guardado')),
        onError: (err) => {
          if (err instanceof ApiError) setErrores(err.errores)
          toast.error(err.message)
        },
      },
    )
  }
  const porCampo = erroresPorCampo(errores)

  return (
    <Section icon={<Settings2 className="size-5" />} titulo={t('general.titulo')} descripcion={t('general.descripcion')}>
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Field id="camp-id" etiqueta={t('general.id')} ayuda={t('general.idAyuda')}>
            <Input id="camp-id" value={camp.cid} readOnly disabled className="font-mono" />
          </Field>
          <Field id="camp-nombre" etiqueta={t('general.nombre')} error={porCampo.nombre}>
            <Input id="camp-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </Field>
        </div>
        <Field id="camp-desc" etiqueta={t('general.descripcionCampo')} error={porCampo.descripcion}>
          <Textarea id="camp-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} />
        </Field>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('general.modulos')}</legend>
          {modulos.isPending ? (
            <LoadingState rows={2} />
          ) : seleccionables.length === 0 && huerfanos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('general.sinModulos')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {seleccionables.map((m) => (
                <li key={m.id}>
                  <label className="flex h-full cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50">
                    <Checkbox
                      checked={elegidos.includes(m.id)}
                      onCheckedChange={(v) => toggle(m.id, v === true)}
                      className="mt-0.5"
                    />
                    <span className="space-y-1">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {m.nombre}
                        <Badge variant="outline">v{m.version}</Badge>
                        {m.categoria === 'extension' && <Badge variant="secondary">{t('general.extension')}</Badge>}
                      </span>
                      {m.descripcion && <span className="block text-xs text-muted-foreground">{m.descripcion}</span>}
                    </span>
                  </label>
                </li>
              ))}
              {huerfanos.map((id) => (
                <li key={id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-3">
                    <Checkbox checked onCheckedChange={(v) => toggle(id, v === true)} />
                    <span className="font-mono text-sm">{id}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">{t('general.modulosAyuda')}</p>
          {porCampo.modulos && <p className="text-sm text-destructive">{porCampo.modulos}</p>}
        </fieldset>
        <ErroresAlert errores={errores.filter((e) => !e.campo)} />
        <div className="flex justify-end">
          <Button type="submit" disabled={!sucio || !nombre.trim() || editar.isPending}>
            {editar.isPending ? <Loader2 className="animate-spin" /> : <Save />} {t('general.guardar')}
          </Button>
        </div>
      </form>
    </Section>
  )
}

// ------------------------------------------------- lore, asistente y sesión
interface Borrador {
  resumen: string
  tono: string
  reglasCasa: string[]
  evitar: string[]
  notas: string
  modelo: string
  contexto: string
  sesion: string
}

function desdeDatos(d: AjustesCampana): Borrador {
  return {
    resumen: d.lore.resumen,
    tono: d.lore.tono,
    reglasCasa: d.lore.reglasCasa,
    evitar: d.lore.evitar,
    notas: d.lore.notas,
    modelo: d.asistente.modelo ?? '',
    contexto: d.asistente.contextoTokens === null || d.asistente.contextoTokens === undefined ? '' : String(d.asistente.contextoTokens),
    sesion: d.sesionActual ?? '',
  }
}

function aEntrada(b: Borrador): AjustesCampanaEntrada {
  const limpia = (l: string[]) => l.map((x) => x.trim()).filter(Boolean)
  return {
    lore: {
      resumen: b.resumen,
      tono: b.tono,
      reglasCasa: limpia(b.reglasCasa),
      evitar: limpia(b.evitar),
      notas: b.notas,
    },
    asistente: {
      modelo: b.modelo.trim() || null,
      contextoTokens: b.contexto.trim() === '' ? null : Number(b.contexto),
    },
    sesionActual: b.sesion || null,
  }
}

function AjustesForm({ data }: { data: AjustesCampana }) {
  const { t } = useTranslation('ajustesCampana')
  const camp = useCampaign()
  const location = useLocation()
  const guardar = useGuardarAjustesCampana(camp.cid)
  const globales = useAjustes()
  const sesiones = useSesiones(camp.cid)
  const inicial = useMemo(() => desdeDatos(data), [data])
  const [b, setB] = useState<Borrador>(inicial)
  const [errores, setErrores] = useState<ErrorValidacion[]>([])

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setB((prev) => ({ ...prev, [k]: v }))
  const sucio = JSON.stringify(b) !== JSON.stringify(inicial)
  const porCampo = erroresPorCampo(errores)

  const global = (clave: string): string => {
    const v = globales.data?.ajustes[clave]?.valor
    return v === null || v === undefined || v === '' ? '' : t('asistente.global', { valor: String(v) })
  }

  const listaSesiones = sesiones.data ?? []
  // Una sesión fijada que ya no existe sigue apareciendo como opción para no perderla en silencio.
  const sesionDesconocida = b.sesion && !listaSesiones.some((s) => s.sesion.entidad.id === b.sesion) ? b.sesion : null

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setErrores([])
    guardar.mutate(aEntrada(b), {
      onSuccess: () => toast.success(t('guardado')),
      onError: (err) => {
        if (err instanceof ApiError) setErrores(err.errores)
        toast.error(err.message)
      },
    })
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <Section icon={<BookOpenText className="size-5" />} titulo={t('lore.titulo')} descripcion={t('lore.descripcion')}>
        <Field id="lore-resumen" etiqueta={t('lore.resumen')} ayuda={t('lore.resumenAyuda')} error={porCampo.resumen}>
          <Textarea id="lore-resumen" rows={6} value={b.resumen} onChange={(e) => set('resumen', e.target.value)} />
        </Field>
        <Field id="lore-tono" etiqueta={t('lore.tono')} error={porCampo.tono}>
          <Input id="lore-tono" value={b.tono} placeholder={t('lore.tonoPlaceholder')} onChange={(e) => set('tono', e.target.value)} />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field id="lore-reglasCasa" etiqueta={t('lore.reglasCasa')} ayuda={t('lore.reglasCasaAyuda')} error={porCampo.reglasCasa}>
            <StringListEditor id="lore-reglasCasa" values={b.reglasCasa} onChange={(v) => set('reglasCasa', v)} />
          </Field>
          <Field id="lore-evitar" etiqueta={t('lore.evitar')} ayuda={t('lore.evitarAyuda')} error={porCampo.evitar}>
            <StringListEditor id="lore-evitar" values={b.evitar} onChange={(v) => set('evitar', v)} />
          </Field>
        </div>
        <Field id="lore-notas" etiqueta={t('lore.notas')} ayuda={t('lore.notasAyuda')} error={porCampo.notas}>
          <Textarea id="lore-notas" rows={4} value={b.notas} onChange={(e) => set('notas', e.target.value)} />
        </Field>
      </Section>

      <Section
        icon={<BrainCircuit className="size-5" />}
        titulo={t('asistente.titulo')}
        descripcion={
          <>
            {t('asistente.descripcion')}{' '}
            <Link to="/ajustes" state={{ desde: location.pathname }} className="underline underline-offset-4">
              {t('asistente.irGlobales')}
            </Link>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field id="asist-modelo" etiqueta={t('asistente.modelo')} error={porCampo.modelo}>
            <Input id="asist-modelo" value={b.modelo} placeholder={global('llm_model')} onChange={(e) => set('modelo', e.target.value)} />
          </Field>
          <Field id="asist-contexto" etiqueta={t('asistente.contexto')} error={porCampo.contextoTokens}>
            <Input
              id="asist-contexto"
              type="number"
              min={512}
              value={b.contexto}
              placeholder={global('llm_context_tokens')}
              onChange={(e) => set('contexto', e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section icon={<CalendarClock className="size-5" />} titulo={t('sesion.titulo')} descripcion={t('sesion.descripcion')}>
        <Field
          id="sesion-actual"
          etiqueta={t('sesion.campo')}
          error={porCampo.sesionActual}
          ayuda={!sesiones.isPending && listaSesiones.length === 0 ? t('sesion.sinSesiones') : undefined}
        >
          <Select value={b.sesion || AUTO} onValueChange={(v) => set('sesion', v === AUTO ? '' : v)}>
            <SelectTrigger id="sesion-actual" className="w-full sm:w-96">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>{t('sesion.auto')}</SelectItem>
              {listaSesiones.map(({ sesion: s }) => (
                <SelectItem key={s.entidad.id} value={s.entidad.id}>
                  {s.numero !== null && s.numero !== undefined
                    ? t('sesion.opcion', { n: s.numero, nombre: s.entidad.etiqueta })
                    : s.entidad.etiqueta}
                </SelectItem>
              ))}
              {sesionDesconocida && <SelectItem value={sesionDesconocida}>{sesionDesconocida}</SelectItem>}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <ErroresAlert errores={errores.filter((e) => !e.campo || !porCampo[e.campo.split('.').pop() ?? ''])} />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
        {sucio && <span className="mr-auto text-sm text-muted-foreground">{t('sinGuardar')}</span>}
        <Button type="button" variant="outline" disabled={!sucio || guardar.isPending} onClick={() => setB(inicial)}>
          {t('descartar')}
        </Button>
        <Button type="submit" disabled={!sucio || guardar.isPending}>
          {guardar.isPending ? <Loader2 className="animate-spin" /> : <Save />} {t('common:acciones.guardar')}
        </Button>
      </div>
    </form>
  )
}

// --------------------------------------------------------------------- exportar
function ExportSection() {
  const { t } = useTranslation('ajustesCampana')
  const camp = useCampaign()
  return (
    <Section icon={<Download className="size-5" />} titulo={t('exportar.titulo')} descripcion={t('exportar.descripcion')}>
      <Button asChild variant="outline">
        <a href={exportarCampanaUrl(camp.cid)} download={`${camp.cid}.zip`}>
          <Download /> {t('exportar.accion')}
        </a>
      </Button>
    </Section>
  )
}

// ---------------------------------------------------------------- zona peligrosa
function DangerZone() {
  const { t } = useTranslation('ajustesCampana')
  const camp = useCampaign()
  const navigate = useNavigate()
  const borrar = useBorrarCampana()
  const [abierto, setAbierto] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const coincide = confirmacion.trim() === camp.cid

  return (
    <Section
      className="border-destructive/50"
      icon={<TriangleAlert className="size-5 text-destructive" />}
      titulo={t('peligro.titulo')}
      descripcion={t('peligro.descripcion')}
    >
      <Button
        variant="destructive"
        onClick={() => {
          setConfirmacion('')
          setAbierto(true)
        }}
      >
        <Trash2 /> {t('peligro.accion')}
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!coincide) return
              borrar.mutate(camp.cid, {
                onSuccess: () => {
                  toast.success(t('peligro.hecho'))
                  setAbierto(false)
                  void navigate('/')
                },
                onError: (err) => toast.error(err.message),
              })
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('peligro.dialogoTitulo', { nombre: camp.info.campana.nombre })}</DialogTitle>
              <DialogDescription>{t('peligro.dialogoAviso')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirmar-borrado" className="block font-normal">
                <Trans
                  t={t}
                  i18nKey="peligro.escribe"
                  values={{ id: camp.cid }}
                  components={{ 1: <code className="rounded bg-muted px-1 font-mono font-semibold" /> }}
                />
              </Label>
              <Input
                id="confirmar-borrado"
                autoComplete="off"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                className="font-mono"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAbierto(false)}>
                {t('common:acciones.cancelar')}
              </Button>
              <Button type="submit" variant="destructive" disabled={!coincide || borrar.isPending}>
                {borrar.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />} {t('common:acciones.borrar')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
