import { PHOTO_QUALITY, PHOTO_SIZE } from '../constants'

export interface PixelArea {
  x: number
  y: number
  width: number
  height: number
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Görsel açılamadı'))
    img.src = src
  })
}

/** Panodan / sürüklemeden gelen öğelerin gerçekten görsel olup olmadığını kontrol eder. */
export const isImageFile = (f: File | null | undefined): f is File =>
  Boolean(f && f.type.startsWith('image/'))

/**
 * Kaynağın verilen alanını PHOTO_SIZE x PHOTO_SIZE JPEG'e çevirir.
 * Şeffaf PNG'ler beyaz zemine oturur (JPEG alfa desteklemez).
 */
export async function cropToJpeg(src: string, area: PixelArea): Promise<Blob> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_SIZE
  canvas.height = PHOTO_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas desteklenmiyor')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Görsel kaydedilemedi'))),
      'image/jpeg',
      PHOTO_QUALITY,
    ),
  )
}
