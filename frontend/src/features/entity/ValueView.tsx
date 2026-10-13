import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Valor } from '@/api/hooks'
import type { Schemas } from '@/api/client'
import { EntityLink } from '@/components/common/EntityLink'
import { Dots } from '@/components/common/Dots'
import { formatDate } from '@/lib/format'

type CampoValores = Schemas['CampoValores']

const XSD = 'http://www.w3.org/2001/XMLSchema#'

/** Muestra un valor de la ficha según su naturaleza (entidad, enlace externo, literal, objeto anidado). */
export function ValueView({ valor, widget }: { valor: Valor; widget?: string | null }) {
  const { t, i18n } = useTranslation('entidad')
  if (valor.tipo === 'objeto') {
    return <NestedValue campos={valor.campos ?? []} />
  }
  if (valor.tipo === 'iri') {
    if (valor.id) return <EntityLink id={valor.id} etiqueta={valor.etiqueta} tipo={valor.clase} />
    if (valor.clave && valor.etiqueta !== valor.clave) return <span>{valor.etiqueta}</span>
    const href = String(valor.valor)
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1 break-all text-primary underline-offset-4 hover:underline"
      >
        {valor.etiqueta !== href ? valor.etiqueta : href.replace(/^https?:\/\//, '')}
        <ExternalLink className="size-3 shrink-0" />
      </a>
    )
  }
  if (widget === 'puntos' && typeof valor.valor === 'number') {
    return <Dots value={valor.valor} max={valor.valor > 5 ? 10 : 5} />
  }
  if (valor.datatype === `${XSD}boolean`) return <span>{valor.valor ? t('si') : t('no')}</span>
  if (valor.datatype === `${XSD}date`) return <span>{formatDate(String(valor.valor), i18n.language)}</span>
  if (valor.datatype === `${XSD}dateTime`) return <span>{formatDate(String(valor.valor), i18n.language, true)}</span>
  return <span className="whitespace-pre-wrap">{valor.etiqueta}</span>
}

/** Nodo anidado (relación cualificada, disciplina…): pequeña tabla de sus campos. */
export function NestedValue({ campos }: { campos: CampoValores[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
      {campos.map((c) => (
        <div key={c.id} className="contents">
          <dt className="text-muted-foreground">{c.etiqueta}</dt>
          <dd className="flex flex-wrap gap-x-2 gap-y-1">
            {c.valores.map((v, i) => (
              <ValueView key={i} valor={v} widget={c.widget} />
            ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Lista de valores de un campo (separados o en bloque si son objetos). */
export function FieldValues({ campo }: { campo: CampoValores }) {
  const objects = campo.valores.some((v) => v.tipo === 'objeto')
  if (objects) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {campo.valores.map((v, i) => (
          <ValueView key={i} valor={v} widget={campo.widget} />
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {campo.valores.map((v, i) => (
        <ValueView key={i} valor={v} widget={campo.widget} />
      ))}
    </div>
  )
}
