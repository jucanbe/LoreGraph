import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** Botón de engranaje que lleva a la página de Ajustes (recordando desde dónde se llegó). */
export function SettingsButton() {
  const { t } = useTranslation('ajustes')
  const location = useLocation()
  const desde = location.pathname.startsWith('/ajustes') ? undefined : location.pathname + location.search
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon" aria-label={t('titulo')}>
          <Link to="/ajustes" state={desde ? { desde } : undefined}>
            <Settings />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('titulo')}</TooltipContent>
    </Tooltip>
  )
}
