/**
 * Pusuladan oyun linki isteğinin gövdesini kurar. Saf fonksiyonlar: ağa ya da
 * IndexedDB'ye dokunmaz (fotolar gameApi.ts'te okunur).
 *
 * Sunucu tarafındaki doğrulama: supabase/functions/_shared/validate.ts
 */

import { CREATOR_NAME_MAX, GAME_MIN_CELLS } from '../constants'
import type { Cell, Compass } from '../types'
import { regionsOf } from './grid'

/** Sunucunun en uzun başlığı; ön yüz zaten TITLE_MAX ile daha kısa tutar. */
const GAME_TITLE_MAX = 60

export interface GamePayloadCell {
  name: string
  bullets: string[]
  photo: number | null
}

export interface GamePayload {
  title: string
  gridSize: Compass['gridSize']
  duration: number
  /** Oyunu kuranın adı; boşsa gönderilmez. */
  creatorName?: string
  regions: { color: string; label?: string }[]
  cells: GamePayloadCell[]
}

/** Tahmin oyununda oynanabilir hücre: ismi ve en az bir maddesi var. */
export const isPlayableCell = (c: Pick<Cell, 'name' | 'bullets'>): boolean =>
  c.name.trim() !== '' && c.bullets.some((b) => b.trim() !== '')

export const countPlayableCells = (cells: readonly Cell[]): number => cells.filter(isPlayableCell).length

/** Oyun linki oluşturulamıyorsa nedeni; oluşturulabiliyorsa null. */
export function gameBlockReason(cells: readonly Cell[]): string | null {
  const n = countPlayableCells(cells)
  if (n >= GAME_MIN_CELLS) return null
  return `Oyun için en az ${GAME_MIN_CELLS} hücrede isim ve en az bir madde olmalı (şu an ${n}).`
}

// Kontrol karakterleri (sekme vb.) sunucuda reddedilir; boşluğa çevir.
// oxlint-disable-next-line no-control-regex
const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f]+/g, ' ')

const truncate = (s: string, max: number): string => Array.from(s).slice(0, max).join('')

/**
 * Kurucu adı: boşluklar sadeleşir, en fazla 20 karakter. Boşsa null
 * (sunucudaki parseCreatorName ile aynı kurallar).
 */
export function cleanCreatorName(v: string): string | null {
  const name = truncate(clean(v).trim().replace(/\s+/g, ' '), CREATOR_NAME_MAX).trim()
  return name === '' ? null : name
}

/**
 * @returns payload ve foto sırası: `photoIds[i]`, `photo_i` alanında gönderilecek
 *          yerel foto kimliği.
 */
export function buildGamePayload(
  compass: Compass,
  duration: number,
  creatorName = '',
): { payload: GamePayload; photoIds: string[] } {
  const photoIds: string[] = []
  const cells = compass.cells.map((c): GamePayloadCell => {
    let photo: number | null = null
    if (c.photoId) {
      photo = photoIds.length
      photoIds.push(c.photoId)
    }
    return {
      name: clean(c.name),
      bullets: c.bullets.map(clean).filter((b) => b.trim() !== ''),
      photo,
    }
  })
  const regions = regionsOf(compass).map((r) => {
    const label = r.label ? clean(r.label).trim() : ''
    return label ? { color: r.color, label } : { color: r.color }
  })
  const creator = cleanCreatorName(creatorName)
  return {
    payload: {
      title: truncate(clean(compass.title).trim(), GAME_TITLE_MAX),
      gridSize: compass.gridSize,
      duration,
      ...(creator ? { creatorName: creator } : {}),
      regions,
      cells,
    },
    photoIds,
  }
}

/** Cihazdaki bir fotoğraf eksikse o hücre fotoğrafsız gönderilir; indeksler yeniden sıralanır. */
export function dropMissingPhotos(
  payload: GamePayload,
  photoIds: string[],
  available: ReadonlySet<string>,
): { payload: GamePayload; photoIds: string[] } {
  const kept: string[] = []
  const cells = payload.cells.map((c) => {
    if (c.photo === null) return c
    const id = photoIds[c.photo]
    if (id === undefined || !available.has(id)) return { ...c, photo: null }
    kept.push(id)
    return { ...c, photo: kept.length - 1 }
  })
  return { payload: { ...payload, cells }, photoIds: kept }
}
