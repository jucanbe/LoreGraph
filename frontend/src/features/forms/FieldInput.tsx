import { Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Campo } from '@/api/hooks'
import { DotsInput } from '@/components/common/Dots'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { isMulti, isRef, type FieldValue, type FormValues, type RefValue } from './model'
import { NestedObjectField } from './NestedObjectField'
import { ReferencePicker } from './ReferencePicker'

const NONE = '__ninguno__'

interface Props {
  campo: Campo
  values: FieldValue[]
  onChange: (v: FieldValue[]) => void
  invalid?: boolean
  id: string
  /** Errores de los subformularios (clave «campo#nodo.subcampo»). */
  nestedErrors?: Record<string, string[]>
}

/** Control de un campo según su tipo (derivado de SHACL). */
export function FieldInput({ campo, values, onChange, invalid, id, nestedErrors }: Props) {
  const { t } = useTranslation('formulario')
  const multi = isMulti(campo)
  const r = campo.restricciones

  switch (campo.tipo) {
    case 'referencia':
      return (
        <ReferencePicker
          id={id}
          campo={campo}
          value={values.filter(isRef)}
          onChange={(v: RefValue[]) => onChange(v)}
          multiple={multi}
          invalid={invalid}
        />
      )
    case 'objeto':
      return <NestedObjectField campo={campo} values={values} onChange={onChange} errors={nestedErrors ?? {}} />
    case 'enum': {
      const opciones = campo.valores ?? []
      if (multi) {
        const selected = new Set(values.map(String))
        return (
          <div id={id} role="group" aria-invalid={invalid || undefined} className="grid gap-2 sm:grid-cols-2">
            {opciones.map((o) => {
              const v = String(o.valor)
              return (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.has(v)}
                    onCheckedChange={(on) =>
                      onChange(on === true ? [...values, v] : values.filter((x) => String(x) !== v))
                    }
                  />
                  <span title={o.descripcion ?? undefined}>{o.etiqueta}</span>
                </label>
              )
            })}
          </div>
        )
      }
      return (
        <Select value={values[0] !== undefined ? String(values[0]) : NONE} onValueChange={(v) => onChange(v === NONE ? [] : [v])}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full sm:w-80">
            <SelectValue placeholder={t('sinValor')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{t('sinValor')}</SelectItem>
            {opciones.map((o) => (
              <SelectItem key={String(o.valor)} value={String(o.valor)}>
                {o.etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case 'booleano': {
      const v = values[0]
      return (
        <Select
          value={v === true ? 'true' : v === false ? 'false' : NONE}
          onValueChange={(x) => onChange(x === NONE ? [] : [x === 'true'])}
        >
          <SelectTrigger id={id} className="w-40" aria-invalid={invalid || undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            <SelectItem value="true">{t('si')}</SelectItem>
            <SelectItem value="false">{t('no')}</SelectItem>
          </SelectContent>
        </Select>
      )
    }
    default:
      break
  }

  if ((campo.tipo === 'entero' || campo.tipo === 'decimal') && campo.widget === 'puntos') {
    const current = typeof values[0] === 'number' ? values[0] : values[0] !== undefined ? Number(values[0]) : null
    return (
      <DotsInput
        id={id}
        label={campo.etiqueta}
        value={current}
        min={r.minInclusive ?? 0}
        max={r.maxInclusive ?? 5}
        invalid={invalid}
        onChange={(v) => onChange(v === null ? [] : [v])}
      />
    )
  }

  // Campos escalares (texto, números, fechas, IRIs), uno o varios valores.
  const list = values.length ? values : ['']
  const single = (v: FieldValue, i: number) => (
    <ScalarInput
      key={i}
      id={i === 0 ? id : `${id}-${i}`}
      campo={campo}
      value={v}
      invalid={invalid}
      onChange={(nv) => {
        const next = [...list]
        next[i] = nv
        onChange(next.filter((x) => x !== '' || !multi))
      }}
    />
  )
  if (!multi) return single(list[0]!, 0)
  return (
    <div className="space-y-2">
      {list.map((v, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">{single(v, i)}</div>
          {list.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('quitarValor')}
              onClick={() => onChange(list.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, ''])}>
        <Plus /> {t('otroValor')}
      </Button>
    </div>
  )
}

function ScalarInput({
  campo,
  value,
  onChange,
  invalid,
  id,
}: {
  campo: Campo
  value: FieldValue
  onChange: (v: FieldValue) => void
  invalid?: boolean
  id: string
}) {
  const r = campo.restricciones
  const str = typeof value === 'object' ? '' : String(value)
  const common = { id, 'aria-invalid': invalid || undefined }
  switch (campo.tipo) {
    case 'textoLargo':
      return <Textarea {...common} value={str} rows={4} onChange={(e) => onChange(e.target.value)} />
    case 'entero':
    case 'decimal':
      return (
        <Input
          {...common}
          type="number"
          inputMode={campo.tipo === 'entero' ? 'numeric' : 'decimal'}
          step={campo.tipo === 'entero' ? 1 : 'any'}
          min={r.minInclusive ?? undefined}
          max={r.maxInclusive ?? undefined}
          className="w-40"
          value={str}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      )
    case 'fecha':
      return <Input {...common} type="date" className="w-48" value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value)} />
    case 'fechaHora':
      return (
        <Input {...common} type="datetime-local" className="w-64" value={str.slice(0, 16)} onChange={(e) => onChange(e.target.value)} />
      )
    case 'iri':
      return (
        <Input
          {...common}
          type="url"
          placeholder="https://www.wikidata.org/entity/Q…"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className={cn('font-mono text-xs')}
        />
      )
    default:
      return (
        <Input
          {...common}
          value={str}
          minLength={r.minLength ?? undefined}
          maxLength={r.maxLength ?? undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      )
  }
}

export type { FormValues }
