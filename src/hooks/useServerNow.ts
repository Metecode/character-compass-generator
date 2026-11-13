import { useEffect, useState } from 'react'

/** Sunucu saatine göre şimdi (ms); saniyede birkaç kez güncellenir. */
export function useServerNow(clockOffset: number, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now() + clockOffset)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + clockOffset), intervalMs)
    return () => clearInterval(id)
  }, [clockOffset, intervalMs])
  return now
}

/** Kalan süre "m:ss" (yukarı yuvarlanır; 0'ın altına inmez). */
export const formatRemaining = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
