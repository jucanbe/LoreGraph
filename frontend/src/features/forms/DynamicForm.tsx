import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Campo, Formulario } from '@/api/hooks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { FieldInput } from './FieldInput'
import type { FieldErrors, FormValues } from './model'

/**
 * Formulario generado a partir del esquema que devuelve la API (derivado de
 * SHACL). No sabe nada del módulo de juego: solo interpreta tipos de campo.
 */
export function DynamicForm({
  form,
  values,
  onChange,
  errors,
}: {
  form: Formulario
  values: FormValues
  onChange: (v: FormValues) => void
  errors: FieldErrors
}) {
  const { t } = useTranslation('formulario')
  const visibles = form.campos.filter((c) => !c.oculto)
  const sinGrupo = visibles.filter((c) => !c.grupo || !form.grupos.some((g) => g.id === c.grupo))
  const secciones = [
    ...(sinGrupo.length ? [{ id: '__general', etiqueta: t('general'), campos: sinGrupo }] : []),
    ...form.grupos.map((g) => ({ id: g.id, etiqueta: g.etiqueta, campos: visibles.filter((c) => c.grupo === g.id) })),
  ].filter((s) => s.campos.length > 0)

  return (
    <div className="space-y-4">
      {secciones.map((s) => {
        const conErrores = s.campos.some((c) => errors[c.id]?.length)
        return (
          <Card key={s.id} className={cn(conErrores && 'border-destructive/60')}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                {s.etiqueta}
                {conErrores && <AlertCircle className="size-4 text-destructive" aria-label={t('hayErrores')} />}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FieldsSection campos={s.campos} values={values} onChange={onChange} errors={errors} />
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/** Lista de campos con su etiqueta, ayuda y errores. Reutilizada en subformularios. */
export function FieldsSection({
  campos,
  values,
  onChange,
  errors,
  idPrefix = 'campo',
  compact = false,
}: {
  campos: Campo[]
  values: FormValues
  onChange: (v: FormValues) => void
  errors: FieldErrors
  idPrefix?: string
  compact?: boolean
}) {
  const { t } = useTranslation('formulario')
  return (
    <div className={cn('grid', compact ? 'gap-3' : 'gap-5')}>
      {campos.map((c) => {
        const id = `${idPrefix}-${c.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
        const errs = errors[c.id] ?? []
        const helpId = `${id}-ayuda`
        const errId = `${id}-error`
        const required = c.cardinalidad.min > 0
        return (
          <div key={c.id} className="space-y-1.5" aria-describedby={[c.ayuda ? helpId : '', errs.length ? errId : ''].join(' ').trim() || undefined}>
            <Label htmlFor={id} className="flex items-center gap-1">
              {c.etiqueta}
              {required && (
                <span className="text-destructive" aria-label={t('obligatorio')}>
                  *
                </span>
              )}
              {c.modulo && c.modulo !== 'core' && (
                <span className="ml-1 rounded bg-muted px-1 text-[10px] font-normal text-muted-foreground uppercase">
                  {c.modulo}
                </span>
              )}
            </Label>
            <FieldInput
              id={id}
              campo={c}
              values={values[c.id] ?? []}
              invalid={errs.length > 0}
              nestedErrors={errors}
              onChange={(v) => onChange({ ...values, [c.id]: v })}
            />
            {c.ayuda && (
              <p id={helpId} className="text-xs text-muted-foreground">
                {c.ayuda}
              </p>
            )}
            {errs.length > 0 && (
              <ul id={errId} className="space-y-0.5 text-sm text-destructive" role="alert">
                {errs.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
