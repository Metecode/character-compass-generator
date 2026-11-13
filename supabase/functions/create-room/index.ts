/**
 * POST /functions/v1/create-room  (multipart/form-data, apikey: publishable)
 *   data  → JSON { mode: 'classic'|'quick', writeSeconds?: 120|180|300, allowProfanity?: boolean, name }
 *   photo → kurucunun kendi fotoğrafı (400×400 JPEG, ≤ 150 KB)
 *
 * Odayı kurar; kurucu ilk oyuncu ve admin olur.
 * Döner: { code, session, playerId } — session yalnızca bu yanıtta vardır; sunucuda özeti tutulur.
 *
 * Limitler (_shared/limits.ts): IP başına CREATE_ROOM_LIMITS (429 rate_limited +
 * retry_after; reddedilen istek sayaca eklenmez) ve MAX_ACTIVE_ROOMS (503 too_many_rooms).
 */

import { errorJson, json, rateLimitedJson } from '../_shared/http.ts'
import {
  CREATE_ROOM_LIMITS,
  MAX_ACTIVE_ROOM_PLAYERS,
  MAX_ACTIVE_ROOMS,
  ROOM_CHANNEL_ID_LENGTH,
  ROOM_CODE_LENGTH,
  ROOM_MAX_BODY_BYTES,
  ROOM_MAX_LIFETIME_SECONDS,
  ROOM_MAX_PLAYERS,
} from '../_shared/limits.ts'
import { nameKey, parseRoomSettings } from '../_shared/room.ts'
import { joinErrorStatus, readRoomForm, sessionHashOf, uploadRoomPhoto } from '../_shared/roomDb.ts'
import {
  activeRoomCount,
  adminClient,
  deleteRoomCompletely,
  hasPublishableKey,
  serve,
  takeWindowLimits,
} from '../_shared/supabase.ts'
import { randomCode, randomToken } from '../_shared/tokens.ts'

serve('create-room', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)

  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isFinite(declared)) return errorJson('length_required', 411, origin)
  if (declared > ROOM_MAX_BODY_BYTES) return errorJson('payload_too_large', 413, origin)

  const db = adminClient()
  if ((await activeRoomCount(db)) >= MAX_ACTIVE_ROOMS) return errorJson('too_many_rooms', 503, origin)
  const retryAfter = await takeWindowLimits(db, req, CREATE_ROOM_LIMITS)
  if (retryAfter > 0) return rateLimitedJson(retryAfter, origin)

  const form = await readRoomForm(req, origin)
  if (!form.ok) return form.response
  const settings = parseRoomSettings(form.data)
  if (!settings.ok) return errorJson(settings.error, 400, origin)
  const s = settings.value

  const code = randomCode(ROOM_CODE_LENGTH)
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + ROOM_MAX_LIFETIME_SECONDS * 1000).toISOString()

  const { error: insertError } = await db.from('rooms').insert({
    code,
    channel_id: randomCode(ROOM_CHANNEL_ID_LENGTH),
    mode: s.mode,
    write_seconds: s.writeSeconds,
    allow_profanity: s.allowProfanity,
    creator_name: s.name,
    created_at: createdAt.toISOString(),
    expires_at: expiresAt,
  })
  if (insertError) throw new Error('room insert failed')

  // Satır önce yazılır: bir adım yarıda kalsa bile cleanup odayı ve dosyalarını bulur.
  try {
    // Eşzamanlı isteklerde tavan aşıldıysa bu oda geri alınır.
    if ((await activeRoomCount(db)) > MAX_ACTIVE_ROOMS) {
      await deleteRoomCompletely(db, code)
      return errorJson('too_many_rooms', 503, origin)
    }

    const photo = await uploadRoomPhoto(db, code, form.photo, expiresAt)
    const session = randomToken()
    const { data, error } = await db.rpc('room_join', {
      p_code: code,
      p_name: s.name,
      p_name_key: nameKey(s.name),
      p_photo_path: photo.path,
      p_photo_url: photo.url,
      p_session_hash: await sessionHashOf(session),
      p_max_players: ROOM_MAX_PLAYERS,
      p_max_active_players: MAX_ACTIVE_ROOM_PLAYERS,
    })
    if (error) throw new Error('room join failed')
    const result = data as { ok: boolean; error?: string; player_id?: string }
    if (!result.ok) {
      await deleteRoomCompletely(db, code)
      const status = joinErrorStatus(result.error ?? '')
      return errorJson(result.error === 'busy' ? 'too_many_rooms' : (result.error ?? 'internal'), status, origin)
    }
    return json({ code, session, playerId: result.player_id }, 201, origin)
  } catch (e) {
    await deleteRoomCompletely(db, code).catch(() => {})
    throw e
  }
})
