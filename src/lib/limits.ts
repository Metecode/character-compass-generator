import { BULLET_MAX, BULLETS_MAX, NAME_MAX } from '../constants'
import type { CellContent } from '../types'

/**
 * Kod noktası bazlı kesme: emoji / birleşik karakterleri ortadan bölmemek için
 * Array.from kullanılır. Sayaç da aynı ölçüyü kullanmalı (textLength).
 */
export const textLength = (s: string): number => Array.from(s).length

export const truncate = (s: string, max: number): string => {
  const chars = Array.from(s)
  return chars.length <= max ? s : chars.slice(0, max).join('')
}

/** Satır sonlarını tek boşluğa indirir; hücre metinleri tek satırlık girdilerdir. */
const singleLine = (s: string): string => s.replace(/[\r\n]+/g, ' ')

export const clampName = (s: string): string => truncate(singleLine(s), NAME_MAX)
export const clampBullet = (s: string): string => truncate(singleLine(s), BULLET_MAX)

export const clampBullets = (bullets: readonly string[]): string[] =>
  bullets.slice(0, BULLETS_MAX).map(clampBullet)

export const canAddBullet = (bullets: readonly string[]): boolean => bullets.length < BULLETS_MAX

/** Kısmi bir hücre güncellemesini limitlere uydurur. */
export function clampCellPatch(patch: Partial<CellContent>): Partial<CellContent> {
  const out: Partial<CellContent> = { ...patch }
  if (patch.name !== undefined) out.name = clampName(patch.name)
  if (patch.bullets !== undefined) out.bullets = clampBullets(patch.bullets)
  return out
}
