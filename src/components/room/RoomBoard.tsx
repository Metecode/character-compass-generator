import { forwardRef, useMemo } from 'react'
import { boardCompass } from '../../lib/boardCompass'
import type { OpenCell, RoomItem, RoomPlayer } from '../../lib/roomApi'
import { CompassArt } from '../CompassArt'
import { PlayBoard } from '../play/PlayBoard'
import { PlayCell } from '../play/PlayCell'

const NO_REGIONS: never[] = []

interface CellsProps {
  gridSize: 2 | 3 | 4
  cells: readonly OpenCell[]
  players: ReadonlyMap<string, RoomPlayer>
  /** Açılıştaki o anki hücre (tahmin adımında: maddeler açık, kim olduğu kapalı). */
  current?: { cell: number; items: RoomItem[] } | null
  /** Foto adresi yerine kullanılacak adres (PNG için önceden indirilmiş blob adresleri). */
  photoOf?: (playerId: string) => string | null
}

function useRenderCell({ cells, players, current, photoOf }: Omit<CellsProps, 'gridSize'>) {
  const byCell = useMemo(() => new Map(cells.map((c) => [c.cell, c])), [cells])
  return (i: number, color: string, scale: number) => {
    const open = byCell.get(i)
    if (open) {
      const p = players.get(open.playerId)
      return (
        <PlayCell
          index={i}
          color={color}
          scale={scale}
          bullets={open.items.map((it) => it.text)}
          playable={false}
          assigned={null}
          hint={null}
          selected={false}
          reveal={{
            name: p?.name ?? '',
            photo: (photoOf ? photoOf(open.playerId) : p?.photo) ?? null,
            correct: null,
            hinted: false,
            guess: null,
          }}
        />
      )
    }
    if (current && current.cell === i) {
      return (
        <div className="relative grid min-h-0 min-w-0">
          <PlayCell
            index={i}
            color={color}
            scale={scale}
            bullets={current.items.map((it) => it.text)}
            playable
            assigned={null}
            hint={null}
            selected={false}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_8px_var(--color-focus)] motion-safe:animate-pulse"
          />
        </div>
      )
    }
    return <PlayCell index={i} color={color} scale={scale} bullets={[]} playable={false} assigned={null} hint={null} selected={false} />
  }
}

/** Ekrandaki oda pusulası (ölçeklenir). */
export function RoomBoard({ gridSize, maxWidth, ...rest }: CellsProps & { maxWidth?: number }) {
  const renderCell = useRenderCell(rest)
  return <PlayBoard gridSize={gridSize} regions={NO_REGIONS} renderCell={renderCell} maxWidth={maxWidth} />
}

/** PNG için tam boy (1080) çizim; ekran dışında tutulur. */
export const RoomBoardArt = forwardRef<HTMLDivElement, CellsProps>(function RoomBoardArt({ gridSize, ...rest }, ref) {
  const renderCell = useRenderCell(rest)
  const compass = useMemo(() => boardCompass(gridSize, NO_REGIONS), [gridSize])
  return <CompassArt ref={ref} compass={compass} selectedId={null} onSelect={() => {}} renderCell={renderCell} />
})
