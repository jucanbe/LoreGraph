import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Campo } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { FieldsSection } from './DynamicForm'
import { isMulti, isNested, newKey, type FieldValue, type NestedValue } from './model'

/**
 * Lista editable de nodos anidados (relaciones cualificadas, disciplinas…),
 * cada uno con su subformulario derivado de `sh:node`.
 */
export function NestedObjectField({
  campo,
  values,
  onChange,
  errors,
}: {
  campo: Campo
  values: FieldValue[]
  onChange: (v: FieldValue[]) => void
  errors: Record<string, string[]>
}) {
  const { t } = useTranslation('formulario')
  const items = values.filter(isNested)
  const sub = campo.subformulario
  if (!sub) return null
  const campos = sub.campos.filter((c) => !c.oculto)
  const canAdd = isMulti(campo) || items.length === 0

  const update = (key: string, patch: Partial<NestedValue>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const prefix = `${campo.id}#${it.key}.`
        const itemErrors: Record<string, string[]> = {}
        for (const [k, v] of Object.entries(errors)) if (k.startsWith(prefix)) itemErrors[k.slice(prefix.length)] = v
        return (
          <fieldset key={it.key} className="relative rounded-lg border bg-muted/20 p-3 pt-2">
            <legend className="px-1 text-xs font-medium text-muted-foreground">
              {sub.etiqueta || campo.etiqueta} {i + 1}
            </legend>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 size-7"
              aria-label={t('quitarElemento', { n: i + 1 })}
              onClick={() => onChange(items.filter((x) => x.key !== it.key))}
            >
              <Trash2 />
            </Button>
            <FieldsSection
              campos={campos}
              values={it.valores}
              onChange={(v) => update(it.key, { valores: v })}
              errors={itemErrors}
              idPrefix={`${campo.id}-${it.key}`}
              compact
            />
          </fieldset>
        )
      })}
      {canAdd && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, { kind: 'nested', valores: {}, key: newKey() }])}
        >
          <Plus /> {t('anadirElemento', { tipo: (sub.etiqueta || campo.etiqueta).toLowerCase() })}
        </Button>
      )}
    </div>
  )
}
