import {
  DEFAULT_BAND_COLORS,
  DEFAULT_GRID_SIZE,
  DEFAULT_QUADRANT_COLORS,
  DEFAULT_THEME_ID,
  GRID_SIZES,
} from '../constants'
import type { Bands, Cell, Compass, GridSize, Quadrants, Region } from '../types'

export const newId = (): string => crypto.randomUUID()

export const cellCount = (gridSize: GridSize): number => gridSize * gridSize

export const isGridSize = (v: unknown): v is GridSize =>
  (GRID_SIZES as readonly unknown[]).includes(v)

/** Bu boyutta kaç bölge var: 3x3'te 3 satır bandı, diğerlerinde 4 çeyrek. */
export const regionCount = (gridSize: GridSize): 3 | 4 => (gridSize === 3 ? 3 : 4)

/**
 * Hücre indeksinin ait olduğu bölge.
 * - 2x2 / 4x4: çeyrek (0 sol üst, 1 sağ üst, 2 sol alt, 3 sağ alt).
 * - 3x3: satır bandı (0 üst, 1 orta, 2 alt).
 */
export function regionOf(index: number, gridSize: GridSize): number {
  const n: number = gridSize
  if (!Number.isInteger(index) || index < 0 || index >= n * n) {
    throw new RangeError(`Geçersiz hücre indeksi: ${index}`)
  }
  const row = Math.floor(index / n)
  if (gridSize === 3) return row
  const half = n / 2
  const col = index % n
  return (row < half ? 0 : 2) + (col < half ? 0 : 1)
}

/** Geriye dönük: yalnızca çift boyutlarda anlamlı. */
export const quadrantOf = (index: number, gridSize: 2 | 4) => regionOf(index, gridSize) as 0 | 1 | 2 | 3

export function cellsOfRegion(region: number, gridSize: GridSize): number[] {
  return Array.from({ length: cellCount(gridSize) }, (_, i) => i).filter(
    (i) => regionOf(i, gridSize) === region,
  )
}

export const cellsOfQuadrant = (q: 0 | 1 | 2 | 3, gridSize: 2 | 4) => cellsOfRegion(q, gridSize)

/** Pusulanın şu anki boyutta kullandığı bölge listesi. */
export const regionsOf = (c: Pick<Compass, 'gridSize' | 'quadrants' | 'bands'>): readonly Region[] =>
  c.gridSize === 3 ? c.bands : c.quadrants

export const createEmptyCell = (): Cell => ({ id: newId(), name: '', bullets: [] })

export const isCellEmpty = (c: Cell): boolean =>
  c.name.trim() === '' && c.bullets.every((b) => b.trim() === '') && !c.photoId

export function createDefaultQuadrants(): Quadrants {
  const [a, b, c, d] = DEFAULT_QUADRANT_COLORS
  return [{ color: a }, { color: b }, { color: c }, { color: d }]
}

export function createDefaultBands(): Bands {
  const [a, b, c] = DEFAULT_BAND_COLORS
  return [{ color: a }, { color: b }, { color: c }]
}

export function createDefaultCompass(gridSize: GridSize = DEFAULT_GRID_SIZE): Compass {
  return {
    id: newId(),
    title: 'Character Compass',
    gridSize,
    quadrants: createDefaultQuadrants(),
    bands: createDefaultBands(),
    themeId: DEFAULT_THEME_ID,
    uppercaseNames: false,
    cells: Array.from({ length: cellCount(gridSize) }, createEmptyCell),
  }
}

export interface Reflow {
  cells: Cell[]
  /** Yeni ızgaraya sığmayan dolu kartlar (okuma sırasına göre sondakiler). */
  dropped: Cell[]
}

/**
 * Dolu kartları okuma sırasıyla yeni ızgaranın başına dizer, kalanı boş hücreyle
 * doldurur. Kart id'leri korunur (seçim ve takas bozulmasın).
 */
export function reflowCells(cells: readonly Cell[], gridSize: GridSize): Reflow {
  const n = cellCount(gridSize)
  const filled = cells.filter((c) => !isCellEmpty(c))
  const kept = filled.slice(0, n)
  return {
    cells: [...kept, ...Array.from({ length: n - kept.length }, createEmptyCell)],
    dropped: filled.slice(n),
  }
}
