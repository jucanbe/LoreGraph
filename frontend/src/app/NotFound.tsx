import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { EmptyState } from '@/components/common/States'
import { Button } from '@/components/ui/button'

export function NotFound() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto max-w-lg p-8">
      <EmptyState
        title={t('errores.noEncontrado')}
        action={
          <Button asChild variant="outline">
            <Link to="/">{t('nav.campanas')}</Link>
          </Button>
        }
      />
    </div>
  )
}
