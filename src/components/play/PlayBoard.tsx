import { useMemo, useRef, type ReactNode } from 'react'
import { CANVAS_SIZE, DEFAULT_BAND_COLORS, DEFAULT_QUADRANT_COLORS } from '../../constants'
import { useFitScale } from '../../hooks/useFitScale'
import { createEmptyCell } from '../../lib/grid'
import type { Bands, Compass, GridSize, Quadrants, Region } from '../../types'
import { CompassArt } from '../CompassArt'

interface Props {
  gridSize: GridSize
  regions: readonly Region[]
  renderCell: (index: number, color: string, scale: number) => ReactNode
  /** Ekranda en fazla bu genişlik (px). */
  maxWidth?: number
}

const pad = <T,>(regions: readonly Region[], defaults: readonly string[], n: number): T =>
  Array.from({ length: n }, (_, i) => regions[i] ?? { color: defaults[i]! }) as T

/**
 * Oyun ızgarası: pusulayla aynı 1080 düzeni (bantlar, etiketler, imza), ekrana
 * sığacak şekilde ölçeklenir. Hücrelerin içi `renderCell`'den gelir.
 */
export function PlayBoard({ gridSize, regions, renderCell, maxWidth = 720 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scale = useFitScale(containerRef, CANVAS_SIZE)

  const compass = useMemo<Compass>(
    () => ({
      id: 'play',
      title: '',
      gridSize,
      quadrants: pad<Quadrants>(gridSize === 3 ? [] : regions, DEFAULT_QUADRANT_COLORS, 4),
      bands: pad<Bands>(gridSize === 3 ? regions : [], DEFAULT_BAND_COLORS, 3),
      themeId: 'genel',
      uppercaseNames: false,
      cells: Array.from({ length: gridSize * gridSize }, createEmptyCell),
    }),
    [gridSize, regions],
  )

  return (
    <div
      ref={containerRef}
      className="mx-auto aspect-square w-full"
      // Masaüstünde ekran yüksekliğine de sığsın (başlık ve kenar payıyla).
      style={{ maxWidth: `min(${maxWidth}px, max(320px, calc(100dvh - 200px)))` }}
    >
      <div
        className="relative overflow-hidden shadow-brutal-lg"
        style={{ width: CANVAS_SIZE * scale, height: CANVAS_SIZE * scale, visibility: scale ? 'visible' : 'hidden' }}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${scale})` }}>
          <CompassArt compass={compass} selectedId={null} onSelect={() => {}} renderCell={renderCell} />
        </div>
      </div>
    </div>
  )
}
