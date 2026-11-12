import {
  DEFAULT_BAND_COLORS,
  DEFAULT_GRID_SIZE,
  DEFAULT_QUADRANT_COLORS,
  DEFAULT_THEME_ID,
  LABEL_MAX,
  TITLE_MAX,
} from '../constants'
import type { Bands, Cell, Compass, Quadrants, Region } from '../types'
import { cellCount, createDefaultCompass, createEmptyCell, isGridSize, newId } from './grid'
import { clampBullets, clampName, truncate } from './limits'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const HEX = /^#[0-9a-f]{6}$/i

function sanitizeCell(v: unknown, seen: Set<string>): Cell {
  if (!isObj(v)) return createEmptyCell()
  let id = str(v.id)
  if (!id || seen.has(id)) id = newId()
  seen.add(id)
  const cell: Cell = {
    id,
    name: clampName(str(v.name)),
    bullets: clampBullets(Array.isArray(v.bullets) ? v.bullets.map(str) : []),
  }
  const photoId = str(v.photoId)
  if (photoId) cell.photoId = photoId
  return cell
}

function sanitizeRegion(v: unknown, fallback: string): Region {
  if (!isObj(v)) return { color: fallback }
  const color = str(v.color)
  const q: Region = { color: HEX.test(color) ? color : fallback }
  const label = truncate(str(v.label), LABEL_MAX)
  if (label.trim()) q.label = label
  return q
}

/**
 * localStorage'dan gelen (eski / bozuk olabilecek) veriyi geçerli bir Compass'a
 * çevirir. Limitler burada da uygulanır; böylece limitler değişse bile tutarlı kalır.
 */
export function sanitizeCompass(v: unknown): Compass {
  if (!isObj(v)) return createDefaultCompass()
  const gridSize = isGridSize(v.gridSize) ? v.gridSize : DEFAULT_GRID_SIZE
  const n = cellCount(gridSize)
  const seen = new Set<string>()
  const raw = Array.isArray(v.cells) ? v.cells : []
  const cells = Array.from({ length: n }, (_, i) => sanitizeCell(raw[i], seen))
  const rq = Array.isArray(v.quadrants) ? v.quadrants : []
  const quadrants = DEFAULT_QUADRANT_COLORS.map((c, i) => sanitizeRegion(rq[i], c)) as Quadrants
  const rb = Array.isArray(v.bands) ? v.bands : []
  const bands = DEFAULT_BAND_COLORS.map((c, i) => sanitizeRegion(rb[i], c)) as Bands
  return {
    id: str(v.id) || newId(),
    title: truncate(str(v.title), TITLE_MAX) || 'Karakter Pusulası',
    gridSize,
    quadrants,
    bands,
    themeId: str(v.themeId) || DEFAULT_THEME_ID,
    uppercaseNames: v.uppercaseNames === true,
    cells,
  }
}
