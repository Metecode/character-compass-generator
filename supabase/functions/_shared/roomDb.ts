/**
 * Canlı oda fonksiyonlarının veritabanı ve Storage yardımcıları.
 * Ortam: Edge Function (supabase-js).
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { bodyErrorResponse, errorJson, readBodyLimited } from './http.ts'
import { ROOM_ADMIN_TIMEOUT_SECONDS, ROOM_MAX_BODY_BYTES, ROOM_ONLINE_SECONDS, ROOM_SEEN_WRITE_SECONDS } from './limits.ts'
import {
  ITEM_COLUMNS,
  PLAYER_COLUMNS,
  REVEAL_ITEM_COLUMNS,
  ROOM_COLUMNS,
  adminLooksAway,
  revealTarget,
  isRoomCode,
  isSessionToken,
  type GuessRow,
  type ItemRow,
  type PlayerRow,
  type RevealItemRow,
  type RoomRow,
} from './room.ts'
import { ROOM_PHOTO_BUCKET } from './supabase.ts'
import { sha256Hex } from './tokens.ts'
import { validatePhoto } from './validate.ts'

/** Süresi dolmamış oda; yoksa (silinmiş, süresi dolmuş, geçersiz kod) null. */
export async function loadLiveRoom(db: SupabaseClient, code: unknown): Promise<RoomRow | null> {
  if (!isRoomCode(code)) return null
  const { data, error } = await db
    .from('rooms')
    .select(ROOM_COLUMNS)
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw new Error('room lookup failed')
  return (data as RoomRow | null) ?? null
}

export async function playersOf(db: SupabaseClient, code: string): Promise<PlayerRow[]> {
  const { data, error } = await db.from('room_players').select(PLAYER_COLUMNS).eq('room_code', code).order('seq')
  if (error) throw new Error('player lookup failed')
  return (data ?? []) as PlayerRow[]
}

/** Bu oyuncunun yazdığı maddeler (yalnızca kendi görünümü için). */
export async function myItemsOf(db: SupabaseClient, code: string, authorId: string): Promise<ItemRow[]> {
  const { data, error } = await db
    .from('room_items')
    .select(ITEM_COLUMNS)
    .eq('room_code', code)
    .eq('author_id', authorId)
  if (error) throw new Error('item lookup failed')
  return (data ?? []) as ItemRow[]
}

/**
 * AÇILIŞ / BITTI görünümü için: odanın tüm maddeleri (yazar kimliği yalnızca
 * tahmin hakkı için; görünüme girmez) ve o anki hücrenin tahminleri.
 */
export async function revealDataOf(
  db: SupabaseClient,
  room: RoomRow,
  players: readonly PlayerRow[],
): Promise<{ items: RevealItemRow[]; guesses: GuessRow[] }> {
  const { data, error } = await db.from('room_items').select(REVEAL_ITEM_COLUMNS).eq('room_code', room.code)
  if (error) throw new Error('reveal items lookup failed')
  const items = (data ?? []) as RevealItemRow[]
  if (room.phase !== 'reveal') return { items, guesses: [] }
  const target = revealTarget(players, room.reveal_index ?? 0)
  if (!target) return { items, guesses: [] }
  const { data: g, error: gError } = await db
    .from('room_guesses')
    .select('player_id, guessed_id')
    .eq('room_code', room.code)
    .eq('cell_index', target.cell_index!)
  if (gError) throw new Error('guess lookup failed')
  return { items, guesses: (g ?? []) as GuessRow[] }
}

export async function playerCountOf(db: SupabaseClient, code: string): Promise<number> {
  const { count, error } = await db
    .from('room_players')
    .select('id', { count: 'exact', head: true })
    .eq('room_code', code)
  if (error || count === null) throw new Error('player count failed')
  return count
}

export const sessionHashOf = (session: string): Promise<string> => sha256Hex(`room-session|${session}`)

/** Oturum anahtarının sahibi (bu odada); yoksa null. */
export async function playerBySession(
  db: SupabaseClient,
  code: string,
  session: unknown,
): Promise<{ id: string; sessionHash: string } | null> {
  if (!isSessionToken(session)) return null
  const sessionHash = await sessionHashOf(session)
  const { data, error } = await db
    .from('room_players')
    .select('id')
    .eq('room_code', code)
    .eq('session_hash', sessionHash)
    .maybeSingle()
  if (error) throw new Error('session lookup failed')
  return data ? { id: data.id as string, sessionHash } : null
}

/**
 * Oyuncunun görüldüğünü kaydeder (en fazla ROOM_SEEN_WRITE_SECONDS'ta bir yazılır)
 * ve admin uzun süredir görünmüyorsa devri dener. Döner: admin değişti mi?
 */
export async function touchAndHandover(
  db: SupabaseClient,
  room: RoomRow,
  players: PlayerRow[],
  meId: string,
  now: number,
): Promise<boolean> {
  const me = players.find((p) => p.id === meId)
  if (me && now - Date.parse(me.last_seen_at) > ROOM_SEEN_WRITE_SECONDS * 1000) {
    const seen = new Date(now).toISOString()
    const { error } = await db.from('room_players').update({ last_seen_at: seen }).eq('id', meId)
    if (error) throw new Error('touch failed')
    me.last_seen_at = seen
  }
  if (!adminLooksAway(room, players, now, ROOM_ADMIN_TIMEOUT_SECONDS)) return false
  const { data, error } = await db.rpc('room_handover_admin', {
    p_code: room.code,
    p_timeout_seconds: ROOM_ADMIN_TIMEOUT_SECONDS,
    p_online_seconds: ROOM_ONLINE_SECONDS,
  })
  if (error) throw new Error('handover failed')
  return data === true
}

/**
 * create-room / join-room gövdesi (multipart): `data` (JSON) + `photo` (400×400 JPEG).
 * Hata varsa hazır yanıtı döner.
 */
export async function readRoomForm(
  req: Request,
  origin: string | null,
): Promise<{ ok: true; data: unknown; photo: Uint8Array } | { ok: false; response: Response }> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return { ok: false, response: errorJson('unsupported_media_type', 415, origin) }
  }
  let body: Uint8Array<ArrayBuffer>
  try {
    body = await readBodyLimited(req, ROOM_MAX_BODY_BYTES)
  } catch (e) {
    return { ok: false, response: bodyErrorResponse(e, origin) }
  }
  let form: FormData
  try {
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return { ok: false, response: errorJson('invalid_payload', 400, origin) }
  }
  const rawData = form.get('data')
  const photo = form.get('photo')
  if (typeof rawData !== 'string' || photo === null || typeof photo === 'string') {
    return { ok: false, response: errorJson('invalid_payload', 400, origin) }
  }
  for (const key of form.keys()) {
    if (key !== 'data' && key !== 'photo') return { ok: false, response: errorJson('invalid_payload', 400, origin) }
  }
  let data: unknown
  try {
    data = JSON.parse(rawData)
  } catch {
    return { ok: false, response: errorJson('invalid_payload', 400, origin) }
  }
  const bytes = new Uint8Array(await photo.arrayBuffer())
  const photoError = validatePhoto(bytes)
  if (photoError) return { ok: false, response: errorJson(photoError, 400, origin) }
  return { ok: true, data, photo: bytes }
}

/**
 * Fotoğrafı oda klasörüne yükler ve oda bitene kadar geçerli tek bir imzalı
 * adres üretir (her durum isteğinde yeniden imzalanmaz; tarayıcı önbelleği çalışır).
 */
export async function uploadRoomPhoto(
  db: SupabaseClient,
  code: string,
  bytes: Uint8Array,
  expiresAt: string,
): Promise<{ path: string; url: string }> {
  const path = `${code}/${crypto.randomUUID()}.jpg`
  const { error } = await db.storage
    .from(ROOM_PHOTO_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('room photo upload failed')
  const seconds = Math.max(60, Math.ceil((Date.parse(expiresAt) - Date.now()) / 1000) + 60)
  const { data, error: signError } = await db.storage.from(ROOM_PHOTO_BUCKET).createSignedUrl(path, seconds)
  if (signError || !data?.signedUrl) {
    await db.storage.from(ROOM_PHOTO_BUCKET).remove([path])
    throw new Error('room photo sign failed')
  }
  return { path, url: data.signedUrl }
}

export async function removeRoomPhoto(db: SupabaseClient, path: string): Promise<void> {
  const { error } = await db.storage.from(ROOM_PHOTO_BUCKET).remove([path])
  if (error) console.error('[room-photo]', 'remove failed') // oda silinirken klasörle birlikte gider
}

/** room_join SQL hatası → HTTP yanıtı. */
export function joinErrorStatus(code: string): number {
  switch (code) {
    case 'not_found':
      return 404
    case 'closed':
    case 'full':
    case 'name_taken':
      return 409
    case 'busy':
      return 503
    default:
      return 500
  }
}
