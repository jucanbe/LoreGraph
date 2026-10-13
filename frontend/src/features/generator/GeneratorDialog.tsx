import { AlertTriangle, ArrowRight, Loader2, Settings, Sparkles } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '@/api/client'
import { useGenerar, type ResultadoGeneracion } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { TypeIcon } from '@/components/common/TypeIcon'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const SIN_VARIANTE = '__ninguna__'
/** Estados que indican que el modelo no está disponible o falló su salida. */
const FALLO_MODELO = new Set([0, 502, 503, 504])
const MAX_VALORES = 6

/** Botón «Generar con IA» que abre el diálogo del generador. */
export function GenerateButton({
  clase,
  variant = 'outline',
}: {
  clase?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
}) {
  const { t } = useTranslation('generador')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Sparkles /> {t('boton')}
      </Button>
      <GeneratorDialog open={open} onOpenChange={setOpen} claseInicial={clase} />
    </>
  )
}

/** Generación de entidades con el modelo local: el resultado es una propuesta pendiente de revisión. */
export function GeneratorDialog({
  open,
  onOpenChange,
  claseInicial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  claseInicial?: string
}) {
  const { t } = useTranslation('generador')
  const camp = useCampaign()
  const generar = useGenerar(camp.cid)
  const tipos = camp.info.tipos
  const porDefecto = claseInicial && camp.tipoPorClave.has(claseInicial) ? claseInicial : (tipos[0]?.clase.clave ?? '')

  const [clase, setClase] = useState(porDefecto)
  const [variante, setVariante] = useState(SIN_VARIANTE)
  const [peticion, setPeticion] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [historia, setHistoria] = useState(true)
  const [cancelada, setCancelada] = useState(false)

  useEffect(() => {
    if (open) {
      setClase(porDefecto)
      setVariante(SIN_VARIANTE)
      setCancelada(false)
      generar.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, porDefecto])

  const tipo = camp.tipoPorClave.get(clase)
  const variantes = tipo?.variantes ?? []

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!clase || generar.isPending) return
    setCancelada(false)
    generar.mutate({
      clase,
      variantes: variante !== SIN_VARIANTE ? [variante] : [],
      peticion: peticion.trim(),
      cantidad: clampCantidad(cantidad),
      historia,
    })
  }

  const dejarDeEsperar = () => {
    // El hook no admite abortar la petición: dejamos de observarla (el servidor termina igualmente).
    generar.reset()
    setCancelada(true)
  }

  const close = () => onOpenChange(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && generar.isPending) dejarDeEsperar()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> {t('titulo')}
          </DialogTitle>
          <DialogDescription>{t('descripcion')}</DialogDescription>
        </DialogHeader>

        {generar.isSuccess ? (
          <Resultado res={generar.data} onClose={close} onAgain={() => generar.reset()} />
        ) : generar.isPending ? (
          <div role="status" aria-live="polite" className="space-y-4 py-4 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-primary" />
            <p className="font-medium">{t('generando')}</p>
            <p className="text-sm text-muted-foreground">{t('generandoAyuda')}</p>
            <Button variant="outline" onClick={dejarDeEsperar}>
              {t('dejarDeEsperar')}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="gen-clase">{t('clase')}</Label>
                <Select
                  value={clase}
                  onValueChange={(v) => {
                    setClase(v)
                    setVariante(SIN_VARIANTE)
                  }}
                >
                  <SelectTrigger id="gen-clase" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((tp) => (
                      <SelectItem key={tp.clase.clave} value={tp.clase.clave}>
                        <TypeIcon name={tp.estilo.icono} color={tp.estilo.color} className="size-3.5" />
                        {tp.clase.etiqueta}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {variantes.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="gen-variante">{t('variante')}</Label>
                  <Select value={variante} onValueChange={setVariante}>
                    <SelectTrigger id="gen-variante" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_VARIANTE}>{t('sinVariante')}</SelectItem>
                      {variantes.map((v) => (
                        <SelectItem key={v.clave} value={v.clave}>
                          {v.etiqueta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="gen-peticion">{t('peticion')}</Label>
              <Textarea
                id="gen-peticion"
                value={peticion}
                onChange={(e) => setPeticion(e.target.value)}
                placeholder={t('peticionPlaceholder')}
                rows={3}
              />
            </div>

            <div className="flex flex-wrap items-end gap-6">
              <div className="space-y-2">
                <Label htmlFor="gen-cantidad">{t('cantidad')}</Label>
                <Input
                  id="gen-cantidad"
                  type="number"
                  min={1}
                  max={5}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  onBlur={() => setCantidad(String(clampCantidad(cantidad)))}
                  className="w-24"
                />
              </div>
              <div className="flex items-start gap-2 pb-2">
                <Checkbox id="gen-historia" checked={historia} onCheckedChange={(v) => setHistoria(v === true)} />
                <div className="space-y-0.5">
                  <Label htmlFor="gen-historia">{t('historia')}</Label>
                  <p className="text-xs text-muted-foreground">{t('historiaAyuda')}</p>
                </div>
              </div>
            </div>

            {cancelada && (
              <Alert>
                <AlertDescription>
                  {t('esperaCancelada')}{' '}
                  <Link to={camp.path('propuestas')} onClick={close}>
                    {t('verBandeja')}
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            {generar.isError && <GenerationError error={generar.error} onNavigate={close} />}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t('common:acciones.cancelar')}
              </Button>
              <Button type="submit" disabled={!clase}>
                <Sparkles /> {t('generar')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function GenerationError({ error, onNavigate }: { error: Error; onNavigate: () => void }) {
  const { t } = useTranslation('generador')
  const modelo = error instanceof ApiError && FALLO_MODELO.has(error.status)
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{t('error.titulo')}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        {modelo && (
          <>
            <p>{t('error.modelo')}</p>
            <Link to="/ajustes" onClick={onNavigate} className="inline-flex items-center gap-1">
              <Settings className="size-3.5" /> {t('error.irAjustes')}
            </Link>
          </>
        )}
      </AlertDescription>
    </Alert>
  )
}

function Resultado({ res, onClose, onAgain }: { res: ResultadoGeneracion; onClose: () => void; onAgain: () => void }) {
  const { t } = useTranslation('generador')
  const camp = useCampaign()
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="font-medium">{t('resultado.titulo', { count: res.entidades.length })}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="font-normal">
            {t('resultado.modelo', { modelo: res.modelo })}
          </Badge>
          <Badge variant={res.reintentos > 0 ? 'secondary' : 'outline'} className="font-normal">
            {t('resultado.reintentos', { count: res.reintentos })}
          </Badge>
        </div>
      </div>
      <ul className="space-y-3">
        {res.entidades.map((e, k) => {
          const valores = Object.entries(e.valores).filter(([p]) => p !== 'rdfs:label')
          return (
            <li key={`${e.nombre}-${k}`} className="rounded-lg border bg-card p-3">
              <p className="font-medium">{e.nombre}</p>
              {valores.length > 0 && (
                <dl className="mt-2 grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(6rem,auto)_1fr]">
                  {valores.slice(0, MAX_VALORES).map(([p, vs]) => (
                    <div key={p} className="contents">
                      <dt className="truncate text-xs text-muted-foreground">{p}</dt>
                      <dd className="line-clamp-2 min-w-0 break-words">{vs.map(formatValor).join(', ')}</dd>
                    </div>
                  ))}
                  {valores.length > MAX_VALORES && <dd className="text-xs text-muted-foreground sm:col-start-2">…</dd>}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
      <Alert>
        <AlertDescription>
          <p>{t('resultado.revisar')}</p>
        </AlertDescription>
      </Alert>
      <DialogFooter>
        <Button variant="outline" onClick={onAgain}>
          <Sparkles /> {t('resultado.otra')}
        </Button>
        <Button asChild>
          <Link to={camp.path(`propuestas/${encodeURIComponent(res.propuesta.id)}`)} onClick={onClose}>
            {t('resultado.verPropuesta')} <ArrowRight />
          </Link>
        </Button>
      </DialogFooter>
    </div>
  )
}

function clampCantidad(v: string): number {
  return Math.min(5, Math.max(1, Math.round(Number(v) || 1)))
}

/** Representación compacta de un valor generado (texto, número o referencia). */
function formatValor(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    for (const k of ['etiqueta', 'nombre', 'valor', 'ref', 'id']) {
      if (typeof o[k] === 'string' || typeof o[k] === 'number') return String(o[k])
    }
    return JSON.stringify(v)
  }
  return String(v)
}
