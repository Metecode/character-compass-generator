/**
 * Edge Function ortamına bağlı yardımcılar (Deno.env, supabase-js).
 *
 * Anahtarlar platformun enjekte ettiği ortam değişkenlerinden okunur:
 *   SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS → { "default": "sb_..." } JSON'u
 *   Eski anahtarlar (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY) yalnızca yedek.
 * Hiçbir anahtar repoda ya da istemci kodunda yer almaz.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { corsHeaders, errorJson, isOriginAllowed } from './http.ts'
import { clientIp, rateLimitKey } from './ip.ts'
import {
  CREATE_GAME_LIMITS,
  RATE_LIMITS,
  ROOM_IP_LIMITS,
  ROOM_SESSION_LIMITS,
  type RateLimitedAction,
  type RoomIpAction,
  type RoomSessionAction,
} from './limits.ts'

export const PHOTO_BUCKET = 'game-photos'
export const ROOM_PHOTO_BUCKET = 'room-photos'

const env = (name: string): string | undefined => Deno.env.get(name) || undefined

function keySet(name: string): string[] {
  const raw = env(name)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return Object.values(parsed as Record<string, unknown>).filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
    }
  } catch {
    // Biçim beklenmedikse yok say.
  }
  return []
}

function secretKey(): string {
  const raw = env('SUPABASE_SECRET_KEYS')
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>
      const k = keys.default ?? Object.values(keys)[0]
      if (k) return k
    } catch {
      // aşağıdaki yedeğe düş
    }
  }
  const legacy = env('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  throw new Error('secret key missing')
}

/** RLS'yi atlayan istemci; yalnızca fonksiyon içinde yaşar. */
export function adminClient(): SupabaseClient {
  const url = env('SUPABASE_URL')
  if (!url) throw new Error('SUPABASE_URL missing')
  return createClient(url, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/**
 * Tarayıcıdan gelen isteklerin `apikey` başlığında projenin publishable
 * anahtarını taşıması beklenir. Bu bir kimlik değil, "bilinen istemci" kapısıdır.
 */
export function hasPublishableKey(req: Request): boolean {
  const given = req.headers.get('apikey')
  if (!given) return false
  const allowed = keySet('SUPABASE_PUBLISHABLE_KEYS')
  const legacy = env('SUPABASE_ANON_KEY')
  if (legacy) allowed.push(legacy)
  return allowed.includes(given)
}

function rateLimitSalt(): string {
  const salt = env('RATE_LIMIT_SALT')
  if (!salt || salt.length < 32) throw new Error('RATE_LIMIT_SALT missing')
  return salt
}

async function hit(db: SupabaseClient, key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db.rpc('rate_limit_hit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error('rate limit check failed')
  return data === true
}

/**
 * Sabit pencereli hız limiti. true → istek devam edebilir.
 * Tuz yoksa ya da veritabanı hatası olursa istek reddedilir (fail-closed).
 */
export async function checkRateLimit(
  db: SupabaseClient,
  req: Request,
  action: RateLimitedAction | RoomIpAction,
): Promise<boolean> {
  const ip = clientIp(req.headers, env('CLIENT_IP_HEADER'))
  const key = await rateLimitKey(ip, rateLimitSalt(), action)
  const { max, windowSeconds } =
    action in RATE_LIMITS ? RATE_LIMITS[action as RateLimitedAction] : ROOM_IP_LIMITS[action as RoomIpAction]
  return hit(db, key, max, windowSeconds)
}

/**
 * Oda oturumu başına hız limiti (aynı Wi-Fi'daki oyuncular birbirinin kotasını
 * yemesin). Anahtar: SHA-256(tuz | oturum özeti) + ':' + işlem.
 */
export async function checkSessionRateLimit(
  db: SupabaseClient,
  sessionHash: string,
  action: RoomSessionAction,
): Promise<boolean> {
  const key = await rateLimitKey(`s:${sessionHash}`, rateLimitSalt(), action)
  const { max, windowSeconds } = ROOM_SESSION_LIMITS[action]
  return hit(db, key, max, windowSeconds)
}

/**
 * Çok pencereli limit (CREATE_GAME_LIMITS, CREATE_ROOM_LIMITS). 0 → istek devam
 * edebilir; > 0 → en erken kaç saniye sonra tekrar denenebilir. Reddedilen
 * istek kotadan düşmez. Tuz ya da veritabanı hatasında fail-closed (istisna → 500).
 */
export async function takeWindowLimits(
  db: SupabaseClient,
  req: Request,
  limits: readonly { key: string; max: number; windowSeconds: number }[],
): Promise<number> {
  const salt = rateLimitSalt()
  const ip = clientIp(req.headers, env('CLIENT_IP_HEADER'))
  const keys = await Promise.all(limits.map((l) => rateLimitKey(ip, salt, l.key)))
  const { data, error } = await db.rpc('rate_limit_take', {
    p_keys: keys,
    p_maxes: limits.map((l) => l.max),
    p_windows: limits.map((l) => l.windowSeconds),
  })
  if (error || typeof data !== 'number') throw new Error('rate limit check failed')
  return data
}

export const takeCreateGameLimit = (db: SupabaseClient, req: Request): Promise<number> =>
  takeWindowLimits(db, req, CREATE_GAME_LIMITS)

/** Süresi dolmamış oyun sayısı (MAX_ACTIVE_GAMES denetimi). */
export async function activeGameCount(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from('games')
    .select('code', { count: 'exact', head: true })
    .gt('expires_at', new Date().toISOString())
  if (error || count === null) throw new Error('active game count failed')
  return count
}

type Handler = (req: Request, origin: string | null) => Promise<Response>

/**
 * Ortak sarmalayıcı: CORS ön kontrolü, origin denetimi, yöntem denetimi ve
 * beklenmeyen hataların iç ayrıntı sızdırmadan 500'e çevrilmesi.
 */
export function serve(name: string, methods: readonly string[], handler: Handler): void {
  Deno.serve(async (req) => {
    const origin = req.headers.get('origin')
    if (!isOriginAllowed(origin)) return errorJson('forbidden', 403, origin)
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (!methods.includes(req.method)) return errorJson('method_not_allowed', 405, origin)
    try {
      return await handler(req, origin)
    } catch (e) {
      // Yalnızca hata sınıfı ve kısa mesaj loglanır; istek içeriği ya da IP loglanmaz.
      console.error(`[${name}]`, e instanceof Error ? e.message : 'unknown error')
      return errorJson('internal', 500, origin)
    }
  })
}

/** Bir oyunun kovadaki tüm dosya yolları (satırlar + klasör listesi; yetim dosyalar dahil). */
export async function photoPathsOf(db: SupabaseClient, code: string): Promise<string[]> {
  const paths = new Set<string>()
  const { data: rows, error } = await db.from('game_photos').select('storage_path').eq('game_code', code)
  if (error) throw new Error('photo lookup failed')
  for (const r of rows ?? []) paths.add(r.storage_path as string)

  const { data: listed, error: listError } = await db.storage
    .from(PHOTO_BUCKET)
    .list(code, { limit: 100 })
  if (listError) throw new Error('photo list failed')
  for (const f of listed ?? []) paths.add(`${code}/${f.name}`)
  return [...paths]
}

/** Önce dosyaları (Storage API), sonra satırları siler. Dosya silinemezse satır kalır, tekrar denenir. */
export async function deleteGameCompletely(db: SupabaseClient, code: string): Promise<void> {
  const paths = await photoPathsOf(db, code)
  if (paths.length > 0) {
    const { error } = await db.storage.from(PHOTO_BUCKET).remove(paths)
    if (error) throw new Error('photo delete failed')
  }
  const { error } = await db.from('games').delete().eq('code', code)
  if (error) throw new Error('game delete failed')
}

// ---------------------------------------------------------------------------
// Canlı oda
// ---------------------------------------------------------------------------

/** Süresi dolmamış oda sayısı (MAX_ACTIVE_ROOMS denetimi). */
export async function activeRoomCount(db: SupabaseClient): Promise<number> {
  const { count, error } = await db
    .from('rooms')
    .select('code', { count: 'exact', head: true })
    .gt('expires_at', new Date().toISOString())
  if (error || count === null) throw new Error('active room count failed')
  return count
}

/** Oda klasöründeki tüm dosyalar (satırlar + klasör listesi; yetim dosyalar dahil). */
export async function roomPhotoPaths(db: SupabaseClient, code: string): Promise<string[]> {
  const paths = new Set<string>()
  const { data: rows, error } = await db.from('room_players').select('photo_path').eq('room_code', code)
  if (error) throw new Error('room photo lookup failed')
  for (const r of rows ?? []) paths.add(r.photo_path as string)
  const { data: listed, error: listError } = await db.storage.from(ROOM_PHOTO_BUCKET).list(code, { limit: 100 })
  if (listError) throw new Error('room photo list failed')
  for (const f of listed ?? []) paths.add(`${code}/${f.name}`)
  return [...paths]
}

/** Önce dosyalar, sonra satırlar (oyuncular, maddeler, tahminler cascade ile). */
export async function deleteRoomCompletely(db: SupabaseClient, code: string): Promise<void> {
  const paths = await roomPhotoPaths(db, code)
  if (paths.length > 0) {
    const { error } = await db.storage.from(ROOM_PHOTO_BUCKET).remove(paths)
    if (error) throw new Error('room photo delete failed')
  }
  const { error } = await db.from('rooms').delete().eq('code', code)
  if (error) throw new Error('room delete failed')
}

/**
 * Odanın Realtime kanalına içi boş sinyal gönderir (REST, soket açmadan).
 * `admin`: yalnızca adminin yeniden çekmesi gereken değişiklik (tahmin sayısı).
 * Gönderilemezse işlem yine başarılıdır: istemciler nabız ve yoklamayla yakalar.
 */
export async function signalRoom(topic: string, event: 'changed' | 'admin' = 'changed'): Promise<void> {
  const url = env('SUPABASE_URL')
  if (!url) return
  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: secretKey(),
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: [{ topic, event, payload: {}, private: false }] }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) console.error('[signal]', `http ${res.status}`)
    await res.body?.cancel()
  } catch (e) {
    console.error('[signal]', e instanceof Error ? e.message : 'unknown error')
  }
}
