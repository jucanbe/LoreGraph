import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/api/client'
import { useFormulario, useGuardarEntidad, type ClaseRef } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { LoadingState } from '@/components/common/States'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FieldsSection } from './DynamicForm'
import { mapServerErrors, toEntrada, validateValues, visibleFields, type FieldErrors, type FormValues } from './model'
import { useValidationMessages } from './useValidationMessages'

export interface CreatedEntity {
  id: string
  etiqueta: string
  tipo: ClaseRef
}

/** Creación rápida de una entidad referenciada, sin salir del formulario principal. */
export function QuickCreateDialog({
  open,
  onOpenChange,
  clases,
  nombreInicial,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  clases: ClaseRef[]
  nombreInicial: string
  onCreated: (e: CreatedEntity) => void
}) {
  const { t } = useTranslation('formulario')
  const camp = useCampaign()
  const [clase, setClase] = useState<string>(clases[0]?.clave ?? '')
  const form = useFormulario(camp.cid, clase ? [clase] : [])
  const guardar = useGuardarEntidad(camp.cid)
  const messages = useValidationMessages()
  const [values, setValues] = useState<FormValues>({})
  const [errors, setErrors] = useState<FieldErrors>({})
  const [general, setGeneral] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setValues(nombreInicial ? { 'rdfs:label': [nombreInicial] } : {})
      setErrors({})
      setGeneral([])
      if (!clases.some((c) => c.clave === clase)) setClase(clases[0]?.clave ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Solo los campos obligatorios y la descripción: lo demás se completa en la ficha.
  const campos = form.data
    ? visibleFields(form.data).filter((c) => c.cardinalidad.min > 0 || c.id === 'schema:description')
    : []

  const submit = (e: FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!form.data) return
    const subset = { campos }
    const errs = validateValues(subset, values, messages)
    setErrors(errs)
    if (Object.keys(errs).length) return
    guardar.mutate(
      { body: toEntrada({ ...form.data, campos }, [clase], values) },
      {
        onSuccess: (res) => {
          const tipo = clases.find((c) => c.clave === clase)!
          const etiqueta = String(values['rdfs:label']?.[0] ?? res.id)
          onCreated({ id: res.id, etiqueta, tipo })
          onOpenChange(false)
        },
        onError: (err) => {
          if (err instanceof ApiError && err.errores.length) {
            const m = mapServerErrors(subset, err.errores, undefined)
            setErrors(m.porCampo)
            setGeneral(m.generales)
          } else setGeneral([err.message])
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('rapida.titulo')}</DialogTitle>
            <DialogDescription>{t('rapida.descripcion')}</DialogDescription>
          </DialogHeader>
          {clases.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="quick-clase">{t('rapida.tipo')}</Label>
              <Select value={clase} onValueChange={setClase}>
                <SelectTrigger id="quick-clase" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clases.map((c) => (
                    <SelectItem key={c.clave} value={c.clave}>
                      {c.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.isPending ? (
            <LoadingState rows={2} />
          ) : (
            <FieldsSection campos={campos} values={values} onChange={setValues} errors={errors} />
          )}
          {general.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                {general.map((g) => (
                  <p key={g}>{g}</p>
                ))}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common:acciones.cancelar')}
            </Button>
            <Button type="submit" disabled={guardar.isPending || !form.data}>
              {t('common:acciones.crear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
