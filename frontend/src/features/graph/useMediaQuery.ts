import { useSyncExternalStore } from 'react'

/** ¿Se cumple la media query? (p. ej. `(min-width: 1024px)`). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia?.(query)
      if (!mq) return () => undefined
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => !!window.matchMedia?.(query).matches,
    () => false,
  )
}
