import { Timer } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { ROOM_COUNTDOWN_URGENT_SECONDS } from '../../constants'
import { formatRemaining } from '../../hooks/useServerNow'

/**
 * Yazma geri sayımı (sunucu saatiyle). Son 30 saniyede kırmızıya döner ve
 * ekran okuyucuya bir kez duyurulur.
 */
export function Countdown({ endsAt, now, right }: { endsAt: number; now: number; right?: ReactNode }) {
  const remaining = endsAt - now
  const over = remaining <= 0
  const urgent = !over && remaining <= ROOM_COUNTDOWN_URGENT_SECONDS * 1000
  return (
    <div
      className={`sticky top-2 z-10 flex items-center justify-between gap-3 rounded-2xl border-[3px] border-ink px-4 py-2 shadow-brutal transition-colors ${
        urgent ? 'bg-danger text-white' : over ? 'bg-surface' : 'bg-accent'
      }`}
    >
      <span className="flex items-center gap-2">
        <Timer size={26} weight="bold" aria-hidden className={urgent ? 'motion-safe:animate-pulse' : ''} />
        <span className="sr-only">Kalan süre</span>
        <span
          role="timer"
          aria-live="off"
          className={`font-black tabular-nums ${urgent ? 'text-3xl' : 'text-2xl'}`}
        >
          {over ? 'Süre doldu' : formatRemaining(remaining)}
        </span>
      </span>
      {right && <span className="text-sm font-bold">{right}</span>}
      <span className="sr-only" aria-live="assertive">
        {urgent ? 'Son 30 saniye' : ''}
      </span>
    </div>
  )
}
