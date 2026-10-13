import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import type { Termino } from '@/api/hooks'
import { useCampaign } from '@/app/campaign-context'
import { isHttpIri, shortDatatype } from './results'

/** Un término RDF legible: entidad → enlace a su ficha; IRI externa → enlace nuevo; literal → valor. */
export function TermView({ term }: { term: Termino | undefined }) {
  const camp = useCampaign()
  if (!term) return null
  if (term.tipo === 'iri') {
    if (term.id) {
      return (
        <Link
          to={camp.entityPath(term.id)}
          className="font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          title={term.valor}
        >
          {term.etiqueta || term.clave || term.valor}
        </Link>
      )
    }
    const texto = term.clave || term.etiqueta || term.valor
    if (isHttpIri(term.valor)) {
      return (
        <a
          href={term.valor}
          target="_blank"
          rel="noopener noreferrer"
          title={term.valor}
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          <span className="break-all">{texto}</span>
          <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
        </a>
      )
    }
    return (
      <span className="break-all" title={term.valor}>
        {texto}
      </span>
    )
  }
  if (term.tipo === 'blanco') {
    return <span className="font-mono text-xs text-muted-foreground">_:{term.valor}</span>
  }
  const dt = shortDatatype(term.datatype)
  return (
    <span className="whitespace-pre-wrap">
      {term.valor}
      {term.idioma && <span className="ml-1 text-xs text-muted-foreground">@{term.idioma}</span>}
      {!term.idioma && dt && <span className="ml-1 text-xs text-muted-foreground">^^{dt}</span>}
    </span>
  )
}
