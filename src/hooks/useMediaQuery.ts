import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Tailwind sm kırılımının altı: mobil düzen (alt çubuk, menüler alt sayfa). */
export const useIsMobile = () => useMediaQuery('(max-width: 639.98px)')

/** Tailwind lg kırılımı ile aynı. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)')
