import { Trophy } from '@phosphor-icons/react'
import type { RoomPlayer, ScoreRow } from '../../lib/roomApi'

/**
 * Açılış sırasında ara skor: yatay kayan küçük şerit. Az önce puan alanlar
 * (`fresh`) "+1" ile vurgulanır.
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
  return (
    <section aria-label="Ara skor" className="-mx-1 -mt-2 overflow-x-auto px-1 pt-2.5 pb-1">
      <ol className="flex w-max gap-1.5">
        <li className="flex items-center gap-1 pr-1 text-xs font-black tracking-wide text-muted uppercase">
          <Trophy size={16} weight="fill" aria-hidden />
          Skor
        </li>
        {scores.map((s) => {
          const p = players.get(s.playerId)
          const me = s.playerId === meId
          return (
            <li
              key={s.playerId}
              className={`relative flex items-center gap-1.5 rounded-full border-2 border-ink py-0.5 pr-2.5 pl-0.5 text-sm ${
                me ? 'bg-ink text-surface' : 'bg-surface'
              }`}
            >
              {p && <img src={p.photo} alt="" className="size-7 rounded-full border border-ink object-cover" />}
              <span className="max-w-[7rem] truncate font-bold">{me ? 'Sen' : (p?.name ?? 'Oyuncu')}</span>
              <span className="font-black tabular-nums">{s.score}</span>
              {fresh.has(s.playerId) && (
                <span
                  aria-hidden
                  className="absolute -top-2 -right-1 rounded-full border-2 border-ink bg-accent px-1 text-[11px] leading-4 font-black text-ink motion-safe:animate-cheer"
                >
                  +1
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
