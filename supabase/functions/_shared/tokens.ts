/** Kod, silme anahtarı ve özet üretimi (Web Crypto; Deno ve Node'da aynı). */

import { GAME_CODE_LENGTH } from './limits.ts'

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Tahmin edilemez oyun kodu: modulo yanlılığı olmadan base62. */
export function randomCode(length = GAME_CODE_LENGTH): string {
  let out = ''
  // 248 = 62 * 4; üstündeki baytlar atılır (eşit dağılım).
  while (out.length < length) {
    const buf = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const b of buf) {
      if (b < 248) out += BASE62[b % 62]
      if (out.length === length) break
    }
  }
  return out
}

const toBase64Url = (bytes: Uint8Array): string => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 32 baytlık (256 bit) silme anahtarı, base64url. */
export const randomToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))

export const DELETE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const GAME_CODE_PATTERN = /^[A-Za-z0-9]{12,64}$/

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Uzunluk dışında içeriğe bağlı erken çıkışı olmayan karşılaştırma. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Kullanıcının verdiği silme anahtarı, saklanan özetle eşleşiyor mu? */
export async function verifyDeleteToken(token: unknown, storedHash: string): Promise<boolean> {
  if (typeof token !== 'string' || !DELETE_TOKEN_PATTERN.test(token)) return false
  return timingSafeEqual(await sha256Hex(token), storedHash)
}
