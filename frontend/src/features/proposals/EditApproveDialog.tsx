/**
 * «Editar y aprobar»: carga las tripletas crudas de la propuesta
 * (`usePropuestaEditable`), deja quitar tripletas sueltas y corregir valores
 * literales, y aprueba con `{ anadir, eliminar, nota }`.
 */
import { Check, Loader2, Minus, Undo2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import {
  usePropuestaEditable,
  useRevisarPropuesta,
  type PropuestaDetalle,
  type Termino,
  type TripletaEntrada,
} from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { ErrorState, LoadingState } from '@/components/common/States'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ErrorRevision } from './ReviewDialog'
import {
  claveEntrada,
  compactIri,
  convertirLiteral,
  datatypeVisible,
  errorAfecta,
  esNodoAnidado,
  indiceTerminos,
  propietario,
  RDF_TYPE,
} from './utils'

interface Fila {
  clave: string
  entrada: TripletaEntrada
  incluida: boolean
  /** Texto editable (solo literales). */
  texto: string
}

function filasDe(entradas: TripletaEntrada[]): Fila[] {
  const vistas = new Map<string, number>()
  return entradas.map((entrada) => {
    const base = claveEntrada(entrada)
    const n = vistas.get(base) ?? 0
    vistas.set(base, n + 1)
    return { clave: n ? `${base}#${n}` : base, entrada, incluida: true, texto: String(entrada.o) }
  })
}

function resultado(filas: Fila[]): TripletaEntrada[] {
  return filas
    .filter((f) => f.incluida)
    .map((f) => (f.entrada.literal ? { ...f.entrada, o: convertirLiteral(f.entrada.o, f.texto) } : f.entrada))
}

export function EditApproveDialog({
  propuesta,
  open,
  onOpenChange,
  onDone,
}: {
  propuesta: PropuestaDetalle
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const { t } = useTranslation('propuestas')
  const camp = useCampaign()
  const editable = usePropuestaEditable(camp.cid, propuesta.id, open)
  const revisar = useRevisarPropuesta(camp.cid)

  const cambiarApertura = (o: boolean) => {
    if (revisar.isPending) return
    if (!o) revisar.reset()
    onOpenChange(o)
  }

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('edicion.titulo')}</DialogTitle>
          <DialogDescription>{t('edicion.ayuda')}</DialogDescription>
        </DialogHeader>
        {editable.isPending ? (
          <LoadingState rows={4} />
        ) : editable.isError ? (
          <ErrorState error={editable.error} onRetry={() => void editable.refetch()} />
        ) : (
          <Editor
            // Al recargar las tripletas, el editor empieza de cero.
            key={editable.dataUpdatedAt}
            propuesta={propuesta}
            anadir={editable.data.anadir}
            eliminar={editable.data.eliminar}
            enviando={revisar.isPending}
            error={revisar.error}
            onCancel={() => cambiarApertura(false)}
            onSubmit={(body) =>
              revisar.mutate(
                { pid: propuesta.id, accion: 'aprobar', body },
                {
                  onSuccess: () => {
                    toast.success(t('avisos.aprobadaEditada'))
                    revisar.reset()
                    onOpenChange(false)
                    onDone()
                  },
                },
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Editor({
  propuesta,
  anadir,
  eliminar,
  enviando,
  error,
  onCancel,
  onSubmit,
}: {
  propuesta: PropuestaDetalle
  anadir: TripletaEntrada[]
  eliminar: TripletaEntrada[]
  enviando: boolean
  error: unknown
  onCancel: () => void
  onSubmit: (body: { nota: string | null; anadir: TripletaEntrada[]; eliminar: TripletaEntrada[] }) => void
}) {
  const { t } = useTranslation('propuestas')
  const camp = useCampaign()
  const [filasAnadir, setFilasAnadir] = useState(() => filasDe(anadir))
  const [filasEliminar, setFilasEliminar] = useState(() => filasDe(eliminar))
  const [nota, setNota] = useState('')
  const notaId = useId()

  // Etiquetas legibles: el detalle ya trae cada término etiquetado.
  const terminos = useMemo(
    () =>
      indiceTerminos(
        [...propuesta.anadidas, ...propuesta.eliminadas].flatMap((x) => [x.sujeto, x.predicado, x.objeto]),
      ),
    [propuesta],
  )
  // Tipo de cada nodo anidado, para nombrarlo («Nivel de disciplina» en vez de un hash).
  const tiposNodo = useMemo(() => {
    const m = new Map<string, string>()
    for (const x of [...propuesta.anadidas, ...propuesta.eliminadas]) {
      if (x.predicado.valor === RDF_TYPE && esNodoAnidado(x.sujeto.valor) && !m.has(x.sujeto.valor)) {
        m.set(x.sujeto.valor, x.objeto.etiqueta)
      }
    }
    return m
  }, [propuesta])

  const errores = error instanceof ApiError ? error.errores : []
  const total = filasAnadir.filter((f) => f.incluida).length + filasEliminar.filter((f) => f.incluida).length

  const enviar = () =>
    onSubmit({ nota: nota.trim() || null, anadir: resultado(filasAnadir), eliminar: resultado(filasEliminar) })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        enviar()
      }}
    >
      {error !== null && error !== undefined && <ErrorRevision error={error} />}
      <ListaFilas
        titulo={t('edicion.anadir', { count: filasAnadir.length })}
        tipo="anadida"
        filas={filasAnadir}
        setFilas={setFilasAnadir}
        terminos={terminos}
        tiposNodo={tiposNodo}
        prefijos={camp.info.prefijos}
        errores={errores}
      />
      {filasEliminar.length > 0 && (
        <ListaFilas
          titulo={t('edicion.eliminar', { count: filasEliminar.length })}
          tipo="eliminada"
          filas={filasEliminar}
          setFilas={setFilasEliminar}
          terminos={terminos}
          tiposNodo={tiposNodo}
          prefijos={camp.info.prefijos}
          errores={errores}
        />
      )}
      <div className="space-y-1.5">
        <Label htmlFor={notaId}>{t('revision.nota')}</Label>
        <Textarea
          id={notaId}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder={t('revision.notaPlaceholder')}
        />
      </div>
      {total === 0 && <p className="text-sm text-muted-foreground">{t('edicion.nadaQueAprobar')}</p>}
      <DialogFooter className="sticky bottom-0 -mx-4 -mb-4 border-t bg-popover p-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={enviando}>
          {t('acciones.cancelar', { ns: 'common' })}
        </Button>
        <Button type="submit" disabled={enviando || total === 0}>
          {enviando ? <Loader2 className="animate-spin" /> : <Check />}
          {t('edicion.aprobar', { count: total })}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ListaFilas({
  titulo,
  tipo,
  filas,
  setFilas,
  terminos,
  tiposNodo,
  prefijos,
  errores,
}: {
  titulo: string
  tipo: 'anadida' | 'eliminada'
  filas: Fila[]
  setFilas: (f: (prev: Fila[]) => Fila[]) => void
  terminos: Map<string, Termino>
  tiposNodo: Map<string, string>
  prefijos: Record<string, string>
  errores: ApiError['errores']
}) {
  const { t } = useTranslation('propuestas')
  const actualizar = (clave: string, cambio: Partial<Fila>) =>
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...cambio } : f)))

  /** Nombre legible de un recurso (entidad, nodo anidado o término de la ontología). */
  const nombre = (iri: string): string => {
    const tipoNodo = tiposNodo.get(iri)
    if (tipoNodo) {
      const dueno = propietario(iri)
      const nombreDueno = dueno ? (terminos.get(dueno)?.etiqueta ?? compactIri(dueno, prefijos)) : null
      return nombreDueno ? `${nombreDueno} › ${tipoNodo}` : tipoNodo
    }
    return terminos.get(iri)?.etiqueta ?? compactIri(iri, prefijos)
  }

  return (
    <fieldset className="space-y-2">
      <legend
        className={cn(
          'mb-2 text-sm font-semibold',
          tipo === 'anadida' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
        )}
      >
        {titulo}
      </legend>
      <ul className="divide-y rounded-md border">
        {filas.map((f) => {
          const sujeto = nombre(f.entrada.s)
          const predicado = terminos.get(f.entrada.p)?.etiqueta ?? compactIri(f.entrada.p, prefijos)
          const objeto = f.entrada.literal ? f.texto : nombre(String(f.entrada.o))
          const descripcion = `${sujeto} · ${predicado} → ${objeto}`
          const conError = errores.some((e) => errorAfecta(e, f.entrada, prefijos))
          return (
            <li
              key={f.clave}
              data-incluida={f.incluida}
              aria-invalid={conError || undefined}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm sm:flex-nowrap',
                !f.incluida && 'bg-muted/50 text-muted-foreground',
                conError && 'bg-destructive/5 ring-1 ring-destructive/40 ring-inset',
              )}
            >
              <div className={cn('min-w-0 flex-1 basis-60', !f.incluida && 'line-through')}>
                <span className="font-medium break-words">{sujeto}</span>
                <span className="text-muted-foreground"> · {predicado} →</span>{' '}
                {!f.entrada.literal && <span className="break-words">{objeto}</span>}
              </div>
              {f.entrada.literal && (
                <div className="flex min-w-0 flex-1 basis-48 items-center gap-1.5">
                  <Input
                    value={f.texto}
                    disabled={!f.incluida}
                    onChange={(e) => actualizar(f.clave, { texto: e.target.value })}
                    aria-label={t('edicion.valorDe', { descripcion: `${sujeto} · ${predicado}` })}
                    aria-invalid={conError || undefined}
                    className="h-8"
                  />
                  {(f.entrada.idioma || datatypeVisible(f.entrada.datatype)) && (
                    <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">
                      {f.entrada.idioma ? `@${f.entrada.idioma}` : compactIri(f.entrada.datatype ?? '', prefijos)}
                    </span>
                  )}
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={
                  f.incluida ? t('edicion.quitar', { descripcion }) : t('edicion.restaurar', { descripcion })
                }
                onClick={() => actualizar(f.clave, { incluida: !f.incluida })}
              >
                {f.incluida ? <Minus /> : <Undo2 />}
                <span className="hidden sm:inline">{f.incluida ? t('edicion.quitarCorto') : t('edicion.restaurarCorto')}</span>
              </Button>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}
