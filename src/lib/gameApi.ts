/**
 * Oyun linki uç noktalarına istekler (Supabase Edge Functions).
 *
 * Bu modül yalnızca kullanıcı "Oyun linki oluştur" ya da "Şimdi sil" dediğinde
 * dinamik import ile yüklenir; meme modunda hiçbir ağ isteği atılmaz.
 * Tarayıcı tablolara ya da kovaya doğrudan erişmez; supabase-js kullanılmaz.
 */

import { BLUR_MAX_BYTES, BLUR_SIZE, GAME_PHOTO_MAX_BYTES, PHOTO_SIZE } from '../constants'
import { GameApiError, call, config } from './apiClient'
import type { Compass } from '../types'
import { buildGamePayload, dropMissingPhotos } from './gamePayload'
import { getPhoto } from './photos'

export { GameApiError }

export interface CreatedGame {
  code: string
  expiresAt: string
  deleteToken: string
}

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality),
  )

/**
 * Sunucunun kabul ettiği biçim: 400×400 JPEG, ≤ 150 KB. Cihazdaki fotolar zaten
 * böyle kaydedilir; değilse (eski kayıt, çok detaylı foto) yeniden kodlanır.
 */
export async function normalizePhoto(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const fits =
      blob.type === 'image/jpeg' &&
      blob.size <= GAME_PHOTO_MAX_BYTES &&
      bitmap.width === PHOTO_SIZE &&
      bitmap.height === PHOTO_SIZE
    if (fits) return blob

    const canvas = document.createElement('canvas')
    canvas.width = PHOTO_SIZE
    canvas.height = PHOTO_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE)
    ctx.drawImage(bitmap, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
    for (const q of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
      const out = await canvasToJpeg(canvas, q)
      if (out.size <= GAME_PHOTO_MAX_BYTES) return out
    }
    throw new Error('photo too large')
  } finally {
    bitmap.close()
  }
}

/**
 * İpucu için bulanık sürüm: 32×32 JPEG (≤ 5 KB). Bu kadar küçültmek yüzü
 * tanınmaz kılar; oyuncu tarafında büyütülüp ayrıca CSS ile bulanıklaştırılır.
 * Üretilemezse null: o hücrede ipucu olmaz (oyun yine oluşturulur).
 */
export async function makeBlur(photo: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(photo)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = BLUR_SIZE
      canvas.height = BLUR_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, BLUR_SIZE, BLUR_SIZE)
      for (const q of [0.7, 0.5, 0.3]) {
        const out = await canvasToJpeg(canvas, q)
        if (out.size <= BLUR_MAX_BYTES) return out
      }
      return null
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

export async function createGame(compass: Compass, durationHours: number): Promise<CreatedGame> {
  config() // yapılandırma yoksa fotoları hiç okumadan dur
  const built = buildGamePayload(compass, durationHours)

  const blobs = new Map<string, Blob>()
  for (const id of built.photoIds) {
    const blob = await getPhoto(id)
    if (blob) blobs.set(id, await normalizePhoto(blob))
  }
  const { payload, photoIds } = dropMissingPhotos(built.payload, built.photoIds, new Set(blobs.keys()))

  const form = new FormData()
  form.append('data', JSON.stringify(payload))
  const blurs = await Promise.all(photoIds.map((id) => makeBlur(blobs.get(id)!)))
  photoIds.forEach((id, i) => {
    form.append(`photo_${i}`, blobs.get(id)!, `${i}.jpg`)
    const blur = blurs[i]
    if (blur) form.append(`blur_${i}`, blur, `${i}.blur.jpg`)
  })

  const res = (await call('create-game', form)) as {
    code?: unknown
    expires_at?: unknown
    delete_token?: unknown
  }
  if (
    typeof res?.code !== 'string' ||
    typeof res.expires_at !== 'string' ||
    typeof res.delete_token !== 'string'
  ) {
    throw new GameApiError('bad_response')
  }
  return { code: res.code, expiresAt: res.expires_at, deleteToken: res.delete_token }
}

/** Sunucuda yoksa (süresi dolmuş, zaten silinmiş) de başarılı sayılır. */
export async function deleteGame(code: string, deleteToken: string): Promise<void> {
  try {
    await call('delete-game', JSON.stringify({ code, delete_token: deleteToken }), 'application/json')
  } catch (e) {
    if (e instanceof GameApiError && e.code === 'not_found') return
    throw e
  }
}

const MESSAGES: Record<string, string> = {
  not_configured: 'Oyun linki şu an kullanılamıyor.',
  network: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dener misin?',
  rate_limited: 'Bir saatte en fazla 5 oyun linki oluşturulabilir. Biraz sonra tekrar dene.',
  payload_too_large: 'Fotoğraflar çok büyük. Birkaç fotoğrafı değiştirip tekrar dene.',
  not_enough_cells: 'Oyun için en az 4 hücrede isim ve en az bir madde olmalı.',
}

export const gameErrorMessage = (e: unknown, fallback: string): string =>
  (e instanceof GameApiError && MESSAGES[e.code]) || fallback
