import { useState } from 'react'
import { formatPoints, visibleRows, type RankingRow } from '../../lib/play'

interface Props<T extends RankingRow> {
  rows: readonly T[]
  total: number
  /** Satırın sonuna eklenecek işlem (kurucu görünümünde "Kaldır"). */
  action?: (row: T) => React.ReactNode
}

/** Sıralama: puan azalan, eşitlikte önce gönderen (sunucu sıralar). Cevap içermez. */
export function Ranking<T extends RankingRow>({ rows, total, action }: Props<T>) {
  const [expanded, setExpanded] = useState(false)
  const shown = visibleRows(rows, expanded)
  const hidden = rows.length - shown.length

  if (rows.length === 0) return <p className="text-sm text-muted">Henüz kimse oynamadı.</p>

  return (
    <div>
      <ol className="divide-y-2 divide-ink/10 rounded-lg border-2 border-ink bg-surface">
        {shown.map((r, i) => {
          const gap = i > 0 && shown[i - 1]!.rank < r.rank - 1 && r.me && !expanded && i === shown.length - 1
          return (
            <li
              key={`${r.rank}-${r.name}-${i}`}
              className={`flex items-center gap-3 px-3 py-2 ${r.me ? 'bg-accent/40 font-bold' : ''} ${gap ? 'border-t-4 border-dotted' : ''}`}
            >
              <span className="w-7 shrink-0 text-right text-sm font-black tabular-nums">{r.rank}.</span>
              <span className="min-w-0 flex-1 truncate">
                {r.name}
                {r.me && <span className="ml-1.5 text-xs font-bold text-muted">(sen)</span>}
              </span>
              <span className="shrink-0 font-black tabular-nums">
                {formatPoints(r.points2)}
                <span className="text-xs font-bold text-muted">/{total}</span>
              </span>
              {action?.(r)}
            </li>
          )
        })}
      </ol>
      {hidden > 0 && (
        <button type="button" className="btn mt-2" onClick={() => setExpanded(true)}>
          Tümünü göster ({rows.length})
        </button>
      )}
    </div>
  )
}
