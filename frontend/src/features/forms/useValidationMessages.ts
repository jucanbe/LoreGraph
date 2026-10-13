import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Messages } from './model'

/** Mensajes de validación en cliente, traducidos. */
export function useValidationMessages(): Messages {
  const { t, i18n } = useTranslation('formulario')
  return useMemo(
    () => ({
      requerido: t('validacion.requerido'),
      maximo: (n: number) => t('validacion.maximo', { count: n }),
      minimo: (n: number) => t('validacion.minimo', { count: n }),
      numero: t('validacion.numero'),
      entero: t('validacion.entero'),
      menorQue: (n: number) => t('validacion.menorQue', { n }),
      mayorQue: (n: number) => t('validacion.mayorQue', { n }),
      longitudMin: (n: number) => t('validacion.longitudMin', { n }),
      longitudMax: (n: number) => t('validacion.longitudMax', { n }),
      formato: t('validacion.formato'),
      iri: t('validacion.iri'),
      anidado: t('validacion.anidado'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  )
}
