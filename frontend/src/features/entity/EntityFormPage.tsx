import { AlertTriangle, Save, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '@/api/client'
import { useEntidad, useFormulario, useGuardarEntidad, type Entidad, type Formulario } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { PageHeader } from '@/components/common/PageHeader'
import { ErrorState, LoadingState } from '@/components/common/States'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import { DynamicForm } from '@/features/forms/DynamicForm'
import {
  initialValuesForNew,
  initialValuesFromEntity,
  mapServerErrors,
  toEntrada,
  validateValues,
  type FieldErrors,
  type FormValues,
} from '@/features/forms/model'
import { useValidationMessages } from '@/features/forms/useValidationMessages'

/** Alta (`/nueva/:clase?variante=…`) y edición (`/e/:eid/editar`) de entidades. */
export function EntityFormPage() {
  const { clase: claseParam, eid: rawEid } = useParams()
  const eid = rawEid ? decodeURIComponent(rawEid) : undefined
  const camp = useCampaign()
  const entidad = useEntidad(camp.cid, eid)

  if (eid) {
    if (entidad.isPending) return <LoadingState rows={6} />
    if (entidad.isError) return <ErrorState error={entidad.error} onRetry={() => void entidad.refetch()} />
    return <FormLoader key={eid} entidad={entidad.data} clasesIniciales={entidad.data.clases.map((c) => c.clave)} />
  }
  return <NewEntity clase={decodeURIComponent(claseParam ?? '')} />
}

function NewEntity({ clase }: { clase: string }) {
  const [params] = useSearchParams()
  const variantes = params.getAll('variante')
  return <FormLoader key={[clase, ...variantes].join('|')} clasesIniciales={[clase, ...variantes]} />
}

function FormLoader({ entidad, clasesIniciales }: { entidad?: Entidad; clasesIniciales: string[] }) {
  const [clases, setClases] = useState(clasesIniciales)
  const camp = useCampaign()
  const form = useFormulario(camp.cid, clases)
  if (form.isError) return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
  if (!form.data) return <LoadingState rows={6} />
  return <EntityForm form={form.data} entidad={entidad} clases={clases} onClasesChange={setClases} refreshing={form.isFetching} />
}

function EntityForm({
  form,
  entidad,
  clases,
  onClasesChange,
  refreshing,
}: {
  form: Formulario
  entidad?: Entidad
  clases: string[]
  onClasesChange: (c: string[]) => void
  refreshing: boolean
}) {
  const { t } = useTranslation('formulario')
  const camp = useCampaign()
  const navigate = useNavigate()
  const guardar = useGuardarEntidad(camp.cid)
  const messages = useValidationMessages()
  const initial = useMemo(
    () => (entidad ? initialValuesFromEntity(form, entidad) : initialValuesForNew(form)),
    // Solo al montar: cambiar de variante conserva lo ya escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [general, setGeneral] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  const principal = clases[0]!
  const tipoInfo = camp.tipoPorClave.get(principal)
  const titulo = entidad
    ? t('editar', { nombre: entidad.etiqueta })
    : t('nueva', { tipo: form.etiqueta })

  const change = (v: FormValues) => {
    setValues(v)
    setDirty(true)
  }

  const toggleVariante = (clave: string, on: boolean) =>
    onClasesChange(on ? [...clases, clave] : clases.filter((c) => c !== clave))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validateValues(form, values, messages)
    setErrors(errs)
    setGeneral([])
    if (Object.keys(errs).length) {
      toast.error(t('revisaErrores'))
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    guardar.mutate(
      { eid: entidad?.id, body: toEntrada(form, clases, values) },
      {
        onSuccess: (res) => {
          setDirty(false)
          toast.success(t('guardada'))
          void navigate(camp.entityPath(res.id))
        },
        onError: (err) => {
          if (err instanceof ApiError && err.errores.length) {
            const m = mapServerErrors(form, err.errores, entidad?.id)
            setErrors(m.porCampo)
            setGeneral(m.generales)
            toast.error(t('errorServidor'))
          } else {
            setGeneral([err.message])
          }
        },
      },
    )
  }

  const cancelTo = entidad ? camp.entityPath(entidad.id) : camp.path(`explorar/${encodeURIComponent(principal)}`)

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <PageHeader
        title={titulo}
        subtitle={form.descripcion}
        migas={[
          { label: camp.info.campana.nombre, to: camp.path() },
          { label: tipoInfo?.clase.etiqueta ?? form.etiqueta, to: camp.path(`explorar/${encodeURIComponent(principal)}`) },
          ...(entidad ? [{ label: entidad.etiqueta, to: camp.entityPath(entidad.id) }] : []),
          { label: entidad ? t('common:acciones.editar') : t('common:acciones.nuevo') },
        ]}
        actions={
          <>
            <Button asChild variant="outline" type="button">
              <Link to={cancelTo}>
                <X /> {t('common:acciones.cancelar')}
              </Link>
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              <Save /> {t('common:acciones.guardar')}
            </Button>
          </>
        }
      >
        {form.variantes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-sm text-muted-foreground">{t('variantes')}:</span>
            {form.variantes.map((v) => (
              <Toggle
                key={v.clave}
                variant="outline"
                size="sm"
                pressed={clases.includes(v.clave)}
                onPressedChange={(on) => toggleVariante(v.clave, on)}
                disabled={refreshing}
              >
                {v.etiqueta}
              </Toggle>
            ))}
          </div>
        )}
      </PageHeader>

      {general.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t('noSePudoGuardar')}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {general.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className={refreshing ? 'pointer-events-none opacity-60 transition-opacity' : undefined}>
        <DynamicForm form={form} values={values} onChange={change} errors={errors} />
      </div>

      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" type="button">
          <Link to={cancelTo}>{t('common:acciones.cancelar')}</Link>
        </Button>
        <Button type="submit" disabled={guardar.isPending}>
          <Save /> {t('common:acciones.guardar')}
        </Button>
      </div>
    </form>
  )
}
