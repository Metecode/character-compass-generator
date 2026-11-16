import { Trophy } from '@phosphor-icons/react'
import { useEffect, useRef } from 'react'
import type { RoomPlayer, ScoreRow } from '../../lib/roomApi'
import { stripScrollLeft } from '../../lib/scoreStrip'

/**
 * Açılış sırasında ara skor: yatay kayan küçük şerit. Az önce puan alanların
 * (`fresh`) çipinde skorun yanında "+1" çıkar ve o çip görünür alana kaydırılır
 * (önce kendi çipin).
 */
export function ScoreStrip({
  scores,
  players,
  meId,
  fresh,
}: {
  scores: readonly ScoreRow[]
  players: ReadonlyMap<string, RoomPlayer>
  meId: string
  fresh: ReadonlySet<string>
}) {
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = scroller.current
    if (!box || fresh.size === 0) return
    const focusId = fresh.has(meId) ? meId : scores.find((s) => fresh.has(s.playerId))?.playerId
    const chip = focusId ? box.querySelector<HTMLElement>(`[data-score-id="${CSS.escape(focusId)}"]`) : null
    if (!chip) return
    const left = stripScrollLeft(
      { left: chip.offsetLeft, width: chip.offsetWidth },
      { scrollLeft: box.scrollLeft, width: box.clientWidth, scrollWidth: box.scrollWidth },
    )
    if (left === box.scrollLeft) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    box.scrollTo({ left, behavior: reduce ? 'auto' : 'smooth' })
  }, [fresh, meId, scores])

  return (
    <section aria-label="Ara skor" className="relative">
      <div ref={scroller} data-room-scroll="scores" className="-mx-1 overflow-x-auto overscroll-x-contain px-1 py-0.5">
        <ol className="relative flex w-max gap-1.5">
          <li className="flex items-center gap-1 pr-1 text-xs font-black tracking-wide text-muted uppercase">
            <Trophy size={16} weight="fill" aria-hidden />
            Skor
          </li>
          {scores.map((s) => {
            const p = players.get(s.playerId)
            const me = s.playerId === meId
            const gained = fresh.has(s.playerId)
            return (
              <li
                key={s.playerId}
                data-score-id={s.playerId}
                className={`flex items-center gap-1.5 rounded-full border-2 border-ink py-0.5 pr-1 pl-0.5 text-sm ${
                  me ? 'bg-ink text-surface' : 'bg-surface'
                }`}
              >
                {p && <img src={p.photo} alt="" className="size-7 rounded-full border border-ink object-cover" />}
                <span className="max-w-[7rem] truncate font-bold">{me ? 'Sen' : (p?.name ?? 'Oyuncu')}</span>
                <span className={`font-black tabular-nums ${gained ? '' : 'pr-1.5'}`}>{s.score}</span>
                {gained && (
                  <span className="rounded-full border-2 border-ink bg-accent px-1.5 text-xs leading-4 font-black text-ink motion-safe:animate-cheer">
                    +1<span className="sr-only"> puan</span>
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
