/**
 * JPEG doğrulaması: dosya uzantısına ya da Content-Type'a değil, baytlara bakar.
 * - SOI (FF D8 FF) ile başlamalı, EOI (FF D9) ile bitmeli.
 * - İşaretçi zinciri baştan SOF'a kadar tutarlı olmalı; ölçü SOF'tan okunur.
 */

export type JpegCheck =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: 'not_jpeg' | 'truncated' | 'corrupt' | 'no_frame' }

// SOF0-3, 5-7, 9-11, 13-15 (C4 = DHT, C8 = JPG, CC = DAC değildir).
const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

export function inspectJpeg(bytes: Uint8Array): JpegCheck {
  const n = bytes.length
  if (n < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, reason: 'not_jpeg' }
  }
  if (bytes[n - 2] !== 0xff || bytes[n - 1] !== 0xd9) return { ok: false, reason: 'truncated' }

  let i = 2
  while (i < n) {
    if (bytes[i] !== 0xff) return { ok: false, reason: 'corrupt' }
    // Dolgu baytları (FF FF ...) atlanır.
    while (i < n && bytes[i] === 0xff) i++
    if (i >= n) return { ok: false, reason: 'corrupt' }
    const marker = bytes[i]!
    i++

    // Uzunluğu olmayan işaretçiler.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) {
      // Çerçeve başlığından önce görüntü verisi ya da bitiş: geçersiz.
      return { ok: false, reason: 'no_frame' }
    }

    if (i + 1 >= n) return { ok: false, reason: 'corrupt' }
    const len = (bytes[i]! << 8) | bytes[i + 1]!
    if (len < 2 || i + len > n) return { ok: false, reason: 'corrupt' }

    if (SOF_MARKERS.has(marker)) {
      // len(2) precision(1) height(2) width(2)
      if (len < 7) return { ok: false, reason: 'corrupt' }
      const height = (bytes[i + 3]! << 8) | bytes[i + 4]!
      const width = (bytes[i + 5]! << 8) | bytes[i + 6]!
      return { ok: true, width, height }
    }
    i += len
  }
  return { ok: false, reason: 'no_frame' }
}
