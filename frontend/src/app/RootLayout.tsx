import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, ScrollRestoration } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { useTheme } from '@/theme/ThemeProvider'

/** Raíz: avisos, restauración del desplazamiento y atributo de idioma del documento. */
export function RootLayout() {
  const { i18n } = useTranslation()
  const { resolved } = useTheme()
  useEffect(() => {
    document.documentElement.lang = i18n.language?.startsWith('en') ? 'en' : 'es'
  }, [i18n.language])
  return (
    <>
      <Outlet />
      <ScrollRestoration />
      <Toaster theme={resolved} richColors closeButton position="bottom-right" />
    </>
  )
}
