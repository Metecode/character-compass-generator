import { Compass as CompassIcon } from '@phosphor-icons/react'
import { forwardRef, useRef } from 'react'
import { CANVAS_SIZE, SITE_URL } from '../../constants'
import { useAutoFitText } from '../../hooks/useAutoFitText'
import { formatDuration, formatPoints, locative } from '../../lib/play'

interface Props {
  title: string
  points2: number
  total: number
  /** Çözme süresi (sn); bilinmiyorsa gösterilmez. */
  durationSeconds?: number | null
}

/**
 * Paylaşılabilir skor kartı (1080×1080). Yalnızca oyun başlığı, skor, kısa bir
 * çağrı ve site adresi; başkalarının adı ya da fotoğrafı yer almaz.
 */
export const ScoreCard = forwardRef<HTMLDivElement, Props>(function ScoreCard({ title, points2, total, durationSeconds }, ref) {
  const titleRef = useRef<HTMLDivElement>(null)
  useAutoFitText(titleRef, 72, 36, [title])

  return (
    <div
      ref={ref}
      className="flex flex-col bg-paper font-sans text-ink"
      style={{
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        padding: 80,
        backgroundImage: 'radial-gradient(rgb(18 18 18 / 0.13) 3px, transparent 3px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="flex items-center gap-5">
        <span className="flex size-24 items-center justify-center rounded-2xl border-[6px] border-ink bg-accent shadow-[8px_8px_0_0_#121212]">
          <CompassIcon size={60} weight="bold" />
        </span>
        <span className="text-[44px] font-black tracking-tight">Character Compass</span>
      </div>

      <div className="mt-16 flex flex-1 flex-col justify-center rounded-[28px] border-[6px] border-ink bg-surface px-16 py-12 shadow-[14px_14px_0_0_#121212]">
        <p className="text-[34px] font-bold text-muted">Bu kim? oyunu</p>
        <div ref={titleRef} className="mt-2 max-h-[180px] overflow-hidden leading-[1.05] font-black tracking-tight">
          {title || 'Karakter pusulası'}
        </div>
        <p className="mt-10 flex items-baseline gap-4 font-black tracking-tight">
          <span className="text-[150px] leading-none">
            {total}
            {locative(total)} {formatPoints(points2)}
          </span>
        </p>
        <p className="mt-2 flex items-center gap-6">
          <span className="bg-accent px-4 text-[72px] leading-tight font-black">bildim!</span>
          {durationSeconds != null && (
            <span className="text-[56px] font-black text-muted">· {formatDuration(durationSeconds)}</span>
          )}
        </p>
      </div>

      <div className="mt-12 flex items-center justify-between gap-6">
        <p className="text-[36px] leading-tight font-bold whitespace-nowrap">Sen kaç yaparsın?</p>
        <p className="rounded-xl border-[5px] border-ink bg-surface px-6 py-3 text-[40px] font-black whitespace-nowrap shadow-[8px_8px_0_0_#121212]">
          {SITE_URL}
        </p>
      </div>
    </div>
  )
})
