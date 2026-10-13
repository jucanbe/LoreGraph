import { BookOpen, Bookmark, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { Schemas } from '@/api/client'
import { useBorrarConsulta, useEjemplosSparql } from '@/api/hooks'
import { QueryState } from '@/components/common/States'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type ConsultaEjemplo = Schemas['ConsultaEjemplo']

function QueryItem({
  q,
  onLoad,
  onDelete,
  deleting,
}: {
  q: ConsultaEjemplo
  onLoad: (q: ConsultaEjemplo) => void
  onDelete?: (q: ConsultaEjemplo) => void
  deleting?: boolean
}) {
  const { t } = useTranslation('sparql')
  const [confirmar, setConfirmar] = useState(false)
  return (
    <li className="group rounded-md border bg-background">
      <button
        type="button"
        onClick={() => onLoad(q)}
        className="w-full space-y-0.5 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        title={t('consultas.cargar')}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {q.titulo}
          {q.modulo && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
              {q.modulo}
            </Badge>
          )}
        </span>
        {q.descripcion && <span className="line-clamp-2 block text-xs text-muted-foreground">{q.descripcion}</span>}
      </button>
      {onDelete && (
        <div className="flex justify-end gap-1 px-2 pb-1.5">
          {confirmar ? (
            <>
              <Button size="xs" variant="ghost" onClick={() => setConfirmar(false)}>
                {t('common:acciones.cancelar')}
              </Button>
              <Button size="xs" variant="destructive" disabled={deleting} onClick={() => onDelete(q)}>
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} {t('consultas.confirmarBorrar')}
              </Button>
            </>
          ) : (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={t('consultas.borrar', { titulo: q.titulo })}
              onClick={() => setConfirmar(true)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** Consultas de ejemplo (de los módulos) y guardadas (de la campaña). */
export function QueriesPanel({ cid, onLoad }: { cid: string; onLoad: (q: ConsultaEjemplo) => void }) {
  const { t } = useTranslation('sparql')
  const query = useEjemplosSparql(cid)
  const borrar = useBorrarConsulta(cid)

  const onDelete = (q: ConsultaEjemplo) =>
    borrar.mutate(q.id, {
      onSuccess: () => toast.success(t('consultas.borrada')),
      onError: (e) => toast.error(e.message),
    })

  return (
    <QueryState query={query}>
      {(lista) => {
        const guardadas = lista.filter((q) => q.guardada)
        const ejemplos = lista.filter((q) => !q.guardada)
        return (
          <div className="space-y-5">
            <section className="space-y-2" aria-labelledby="sparql-guardadas">
              <h2 id="sparql-guardadas" className="flex items-center gap-1.5 text-sm font-semibold">
                <Bookmark className="size-4 text-muted-foreground" /> {t('consultas.guardadas')}
              </h2>
              {guardadas.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('consultas.sinGuardadas')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {guardadas.map((q) => (
                    <QueryItem
                      key={q.id}
                      q={q}
                      onLoad={onLoad}
                      onDelete={onDelete}
                      deleting={borrar.isPending && borrar.variables === q.id}
                    />
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2" aria-labelledby="sparql-ejemplos">
              <h2 id="sparql-ejemplos" className="flex items-center gap-1.5 text-sm font-semibold">
                <BookOpen className="size-4 text-muted-foreground" /> {t('consultas.ejemplos')}
              </h2>
              {ejemplos.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('consultas.sinEjemplos')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {ejemplos.map((q) => (
                    <QueryItem key={q.id} q={q} onLoad={onLoad} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )
      }}
    </QueryState>
  )
}
