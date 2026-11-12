/**
 * Hız limiti için istemci IP'si. Ham IP hiçbir yerde saklanmaz ve loglanmaz;
 * yalnızca tuzlanmış SHA-256 özeti anahtar olarak kullanılır.
 *
 * Güven: İstemcinin kendi gönderebileceği `x-forwarded-for` varsayılan listede
 * YOK. Platformun yazdığı başlık canlı ortamda doğrulanınca `CLIENT_IP_HEADER`
 * ortam değişkeniyle sabitlenir (bkz. docs/supabase.md).
 */

import { sha256Hex } from './tokens.ts'

/** CLIENT_IP_HEADER verilmemişse sırayla denenen başlıklar. */
export const DEFAULT_IP_HEADERS: readonly string[] = ['cf-connecting-ip', 'x-real-ip']

// Yalnızca IPv4/IPv6'da geçebilecek karakterler; başka bir şey gelirse yok sayılır.
const IP_LIKE = /^[0-9A-Fa-f:.]{2,45}$/

/**
 * Virgüllü listelerde (x-forwarded-for gibi) en sağdaki değer alınır: o değeri
 * zincirdeki son vekil yazar; soldakiler istemci tarafından uydurulabilir.
 */
function pick(value: string | null): string | null {
  if (!value) return null
  const last = value.split(',').pop()?.trim() ?? ''
  return IP_LIKE.test(last) ? last.toLowerCase() : null
}

export function clientIp(headers: Headers, configured?: string | null): string | null {
  const names = configured ? [configured.trim().toLowerCase()] : DEFAULT_IP_HEADERS
  for (const name of names) {
    const ip = pick(headers.get(name))
    if (ip) return ip
  }
  return null
}

/**
 * Hız limiti anahtarı: SHA-256(tuz | ip) + ':' + işlem. IP bulunamazsa tüm bu
 * istekler tek bir ortak kovaya düşer (kısıtlayıcı ama güvenli taraf).
 */
export async function rateLimitKey(ip: string | null, salt: string, action: string): Promise<string> {
  return `${await sha256Hex(`${salt}|${ip ?? 'unknown'}`)}:${action}`
}
