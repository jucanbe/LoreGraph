import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Lista editable de textos cortos: cada elemento se puede editar o quitar, y se añaden con Intro. */
export function StringListEditor({
  id,
  values,
  onChange,
}: {
  id: string
  values: string[]
  onChange: (values: string[]) => void
}) {
  const { t } = useTranslation('ajustesCampana')
  const [nuevo, setNuevo] = useState('')
  const anadir = () => {
    const v = nuevo.trim()
    if (!v) return
    onChange([...values, v])
    setNuevo('')
  }
  return (
    <div className="space-y-2">
      {values.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t('lore.listaVacia')}</p>
      ) : (
        <ul className="space-y-1.5">
          {values.map((v, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Input
                value={v}
                aria-label={v || t('lore.nuevoElemento')}
                onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('lore.quitarElemento', { texto: v })}
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          value={nuevo}
          placeholder={t('lore.nuevoElemento')}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              anadir()
            }
          }}
        />
        <Button type="button" variant="outline" size="icon" aria-label={t('common:acciones.anadir')} onClick={anadir} disabled={!nuevo.trim()}>
          <Plus />
        </Button>
      </div>
    </div>
  )
}
