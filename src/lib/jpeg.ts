/**
 * Sunucuya gidecek fotoğrafların hazırlanması (oyun linki ve canlı oda).
 * Sunucunun kabul ettiği biçim: 400×400 JPEG, ≤ 150 KB.
 */

import { GAME_PHOTO_MAX_BYTES, PHOTO_SIZE } from '../constants'

export const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
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

