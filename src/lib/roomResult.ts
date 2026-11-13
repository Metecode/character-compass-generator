/**
 * Canlı oda sonucu: düzenleyiciye aktarma, kazananlar ve silinme notu.
 * Ağ ve IndexedDB işi yapmaz (fotoğraflar dışarıda indirilip kaydedilir); test edilebilir.
 */

import { BULLETS_MAX, NAME_MAX } from '../constants'
import type { Compass, GridSize } from '../types'
import { boardCompass } from './boardCompass'
import { clampBullet } from './limits'
import type { OpenCell, RoomPlayer, ScoreRow } from './roomApi'

/** Düzenleyiciye aktarılan pusulanın başlığı. */
export const ROOM_COMPASS_TITLE = 'Canlı oda'

/**
 * Sonuç hücrelerinden düzenleyici pusulası: hücre yerleri korunur, isim, görünür
 * maddeler (en fazla 3) ve varsa cihaza kaydedilmiş foto kimliği.
 */
export function roomCompass(
  gridSize: GridSize,
  cells: readonly OpenCell[],
  players: ReadonlyMap<string, Pick<RoomPlayer, 'name'>>,
  photoIds: ReadonlyMap<string, string>,
): Compass {
  const base = boardCompass(gridSize, [])
  const out: Compass = { ...base, id: crypto.randomUUID(), title: ROOM_COMPASS_TITLE }
  out.cells = base.cells.map((empty, i) => {
    const c = cells.find((x) => x.cell === i)
    if (!c) return empty
    const name = Array.from(players.get(c.playerId)?.name ?? '').slice(0, NAME_MAX).join('')
    const bullets = c.items.slice(0, BULLETS_MAX).map((it) => clampBullet(it.text))
    const photoId = photoIds.get(c.playerId)
    return { ...empty, name, bullets, ...(photoId ? { photoId } : {}) }
  })
  return out
}

/** En yüksek puanlılar (puan 0 ise kimse kazanmadı sayılır). */
export function winnersOf(scores: readonly ScoreRow[]): { ids: string[]; score: number } {
  const top = scores.reduce((m, s) => Math.max(m, s.score), 0)
  if (top === 0) return { ids: [], score: 0 }
  return { ids: scores.filter((s) => s.score === top).map((s) => s.playerId), score: top }
}

/** Sıralama: eşit puan aynı sırayı alır (1, 2, 2, 4). `scores` puan azalan gelmeli. */
export function ranksOf(scores: readonly ScoreRow[]): number[] {
  return scores.map((s) => scores.findIndex((t) => t.score === s.score) + 1)
}

/** "Bu oda 30 dakika sonra silinir." (dakika yukarı yuvarlanır). */
export function deletesInText(remainingMs: number): string {
  if (remainingMs <= 60_000) return 'Bu oda birazdan silinir.'
  return `Bu oda ${Math.ceil(remainingMs / 60_000)} dakika sonra silinir.`
}
