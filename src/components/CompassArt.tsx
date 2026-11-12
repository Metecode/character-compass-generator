import { forwardRef, useRef } from 'react'
import {
  BAND_LABEL_WIDTH,
  CANVAS_SIZE,
  CELL_SCALE,
  LABEL_BAND,
  LINE_THICK,
  LINE_THIN,
  SIGNATURE_BAND,
  SITE_URL,
} from '../constants'
import { useAutoFitText } from '../hooks/useAutoFitText'
import { cellsOfRegion } from '../lib/grid'
import type { Compass, Region } from '../types'
import { CompassCell } from './CompassCell'

interface Props {
  compass: Compass
  selectedId: string | null
  onSelect: (id: string) => void
}

const QUADRANTS = [0, 1, 2, 3] as const
const BANDS = [0, 1, 2] as const

/** 3x3 bandının solundaki dar etiket kutusu; metin aşağıdan yukarı okunur. */
function BandLabel({ region }: { region: Region }) {
  const ref = useRef<HTMLDivElement>(null)
  useAutoFitText(ref, 30, 14, [region.label])
  return (
    <div
      className="shrink-0 overflow-hidden"
      style={{ width: BAND_LABEL_WIDTH, background: region.color }}
    >
      <div
        ref={ref}
        className="flex size-full rotate-180 items-center justify-center overflow-hidden px-1 py-3 text-center leading-[1.05] font-black tracking-wide uppercase [writing-mode:vertical-rl]"
      >
        {region.label ?? ''}
      </div>
    </div>
  )
}

/**
 * Pusulanın kendisi: her zaman CANVAS_SIZE x CANVAS_SIZE px. Ekranda dışarıdan
 * transform: scale ile küçültülür; export bu düğümden alınır.
 */
export const CompassArt = forwardRef<HTMLDivElement, Props>(function CompassArt(
  { compass, selectedId, onSelect },
  ref,
) {
  const { quadrants, bands, cells, gridSize, uppercaseNames } = compass
  const scale = CELL_SCALE[gridSize]

  const renderCell = (i: number, color: string) => {
    const cell = cells[i]
    if (!cell) return null
    return (
      <CompassCell
        key={cell.id}
        cell={cell}
        index={i}
        color={color}
        scale={scale}
        uppercase={uppercaseNames}
        selected={cell.id === selectedId}
        onSelect={onSelect}
      />
    )
  }

  let grid: React.ReactNode
  if (gridSize === 3) {
    const showLabels = bands.some((b) => b.label)
    grid = (
      <div className="grid min-h-0 flex-1 grid-rows-3" style={{ gap: LINE_THICK }}>
        {BANDS.map((b) => (
          <div key={b} className="flex min-h-0 min-w-0" style={{ gap: LINE_THICK }}>
            {showLabels && <BandLabel region={bands[b]} />}
            <div
              className="grid min-h-0 min-w-0 flex-1 grid-cols-3"
              style={{ gap: LINE_THIN }}
            >
              {cellsOfRegion(b, 3).map((i) => renderCell(i, bands[b].color))}
            </div>
          </div>
        ))}
      </div>
    )
  } else {
    const half = gridSize / 2
    const topBand = Boolean(quadrants[0].label || quadrants[1].label)
    const bottomBand = Boolean(quadrants[2].label || quadrants[3].label)
    const band = (qs: readonly [0 | 1, 0 | 1] | readonly [2 | 3, 2 | 3]) => (
      <div className="grid grid-cols-2" style={{ height: LABEL_BAND, gap: LINE_THICK }}>
        {qs.map((q) => (
          <div
            key={q}
            className="flex items-center justify-center overflow-hidden px-4 text-[30px] leading-none font-black tracking-wide whitespace-nowrap uppercase"
            style={{ background: quadrants[q].color }}
          >
            {quadrants[q].label ?? ''}
          </div>
        ))}
      </div>
    )
    grid = (
      <>
        {topBand && band([0, 1] as const)}
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2" style={{ gap: LINE_THICK }}>
          {QUADRANTS.map((q) => (
            <div
              key={q}
              className="grid min-h-0 min-w-0"
              style={{
                gridTemplateColumns: `repeat(${half}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${half}, minmax(0, 1fr))`,
                gap: LINE_THIN,
              }}
            >
              {cellsOfRegion(q, gridSize).map((i) => renderCell(i, quadrants[q].color))}
            </div>
          ))}
        </div>
        {bottomBand && band([2, 3] as const)}
      </>
    )
  }

  return (
    <div
      ref={ref}
      className="flex flex-col bg-ink font-sans text-ink"
      style={{
        width: CANVAS_SIZE,
        height: CANVAS_SIZE,
        padding: `${LINE_THICK}px ${LINE_THICK}px 0`,
        gap: LINE_THICK,
      }}
    >
      {grid}
      {/* İmza şeridi: hücrelerin üstüne binmez, ızgaranın altında yer alır. */}
      <div
        className="flex shrink-0 items-center justify-end px-2 text-[17px] leading-none font-bold tracking-wide text-paper/55"
        style={{ height: SIGNATURE_BAND - LINE_THICK }}
      >
        {SITE_URL}
      </div>
    </div>
  )
})
