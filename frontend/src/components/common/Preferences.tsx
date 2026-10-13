import { Languages, Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type ThemeMode } from '@/theme/ThemeProvider'

/** Selector de tema (claro/oscuro/sistema) e idioma. */
export function Preferences() {
  const { t, i18n } = useTranslation()
  const { mode, resolved, setMode } = useTheme()
  const Icon = resolved === 'dark' ? Moon : Sun
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('tema.cambiar')}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{t('tema.cambiar')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
          <DropdownMenuRadioItem value="light">
            <Sun /> {t('tema.claro')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> {t('tema.oscuro')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> {t('tema.sistema')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-2">
          <Languages className="size-4" /> {t('idioma.cambiar')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={i18n.language?.startsWith('en') ? 'en' : 'es'}
          onValueChange={(v) => void i18n.changeLanguage(v)}
        >
          <DropdownMenuRadioItem value="es">{t('idioma.es')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en">{t('idioma.en')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
