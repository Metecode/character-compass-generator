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
import { CREATE_GAME_LIMITS, RATE_LIMITS, type RateLimitedAction } from './limits.ts'

export const PHOTO_BUCKET = 'game-photos'

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

/**
 * Sabit pencereli hız limiti. true → istek devam edebilir.
 * Tuz yoksa ya da veritabanı hatası olursa istek reddedilir (fail-closed).
 */
export async function checkRateLimit(
  db: SupabaseClient,
  req: Request,
  action: RateLimitedAction,
): Promise<boolean> {
  const salt = env('RATE_LIMIT_SALT')
  if (!salt || salt.length < 32) throw new Error('RATE_LIMIT_SALT missing')
  const ip = clientIp(req.headers, env('CLIENT_IP_HEADER'))
  const key = await rateLimitKey(ip, salt, action)
  const { max, windowSeconds } = RATE_LIMITS[action]
  const { data, error } = await db.rpc('rate_limit_hit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  })
  if (error) throw new Error('rate limit check failed')
  return data === true
}

/**
 * create-game'in çok pencereli limiti (CREATE_GAME_LIMITS). 0 → istek devam
 * edebilir; > 0 → en erken kaç saniye sonra tekrar denenebilir. Reddedilen
 * istek kotadan düşmez. Tuz ya da veritabanı hatasında fail-closed (istisna → 500).
 */
export async function takeCreateGameLimit(db: SupabaseClient, req: Request): Promise<number> {
  const salt = env('RATE_LIMIT_SALT')
  if (!salt || salt.length < 32) throw new Error('RATE_LIMIT_SALT missing')
  const ip = clientIp(req.headers, env('CLIENT_IP_HEADER'))
  const keys = await Promise.all(CREATE_GAME_LIMITS.map((l) => rateLimitKey(ip, salt, l.key)))
  const { data, error } = await db.rpc('rate_limit_take', {
    p_keys: keys,
    p_maxes: CREATE_GAME_LIMITS.map((l) => l.max),
    p_windows: CREATE_GAME_LIMITS.map((l) => l.windowSeconds),
  })
  if (error || typeof data !== 'number') throw new Error('rate limit check failed')
  return data
}

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
