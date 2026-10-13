/**
 * Internacionalización. Español primero; inglés preparado.
 * Cada funcionalidad tiene su espacio de nombres en `locales/<idioma>/<ns>.json`.
 */
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

type Resources = Record<string, Record<string, Record<string, unknown>>>

const files = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*/*.json', { eager: true })

export const resources: Resources = {}
for (const [path, mod] of Object.entries(files)) {
  const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path)
  if (!match) continue
  const [, lang, ns] = match as unknown as [string, string, string]
  resources[lang] ??= {}
  resources[lang][ns] = mod.default
}

export const SUPPORTED_LANGUAGES = ['es', 'en'] as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'es',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: true,
    defaultNS: 'common',
    ns: Object.keys(resources.es ?? { common: {} }),
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
    returnNull: false,
  })

export default i18n
