import { DEFAULT_BAND_COLORS, DEFAULT_QUADRANT_COLORS } from '../constants'
import type { Bands, Compass, GridSize, Quadrants, Region } from '../types'
import { createEmptyCell } from './grid'

const pad = <T,>(regions: readonly Region[], defaults: readonly string[], n: number): T =>
  Array.from({ length: n }, (_, i) => regions[i] ?? { color: defaults[i]! }) as T

/**
 * Hücreleri dışarıdan çizilen pusula iskeleti (tahmin oyunu, canlı oda): bölge
 * renkleri ve etiketleri; verilmeyen bölgeler varsayılan renkte.
 */
export const boardCompass = (gridSize: GridSize, regions: readonly Region[]): Compass => ({
  id: 'play',
  title: '',
  gridSize,
  quadrants: pad<Quadrants>(gridSize === 3 ? [] : regions, DEFAULT_QUADRANT_COLORS, 4),
  bands: pad<Bands>(gridSize === 3 ? regions : [], DEFAULT_BAND_COLORS, 3),
  themeId: 'genel',
  uppercaseNames: false,
  cells: Array.from({ length: gridSize * gridSize }, createEmptyCell),
})
