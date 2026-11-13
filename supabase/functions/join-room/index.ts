/**
 * POST /functions/v1/join-room  (multipart/form-data, apikey: publishable)
 *   data  → JSON { code, name }
 *   photo → oyuncunun kendi fotoğrafı (400×400 JPEG, ≤ 150 KB)
 *
 * Yalnızca LOBI'de, en fazla 16 oyuncu. Ad oda içinde tekil (Türkçe küçük harfle).
 * Döner: { session, playerId } — session yalnızca bu yanıtta vardır.
 * Hatalar: 404 not_found · 409 closed | full | name_taken · 503 busy · 429 rate_limited
 */

import { errorJson, json } from '../_shared/http.ts'
import { MAX_ACTIVE_ROOM_PLAYERS, ROOM_MAX_BODY_BYTES, ROOM_MAX_PLAYERS } from '../_shared/limits.ts'
import { channelTopic, nameKey, parseJoin } from '../_shared/room.ts'
import {
  joinErrorStatus,
  loadLiveRoom,
  playerCountOf,
  readRoomForm,
  removeRoomPhoto,
  sessionHashOf,
  uploadRoomPhoto,
} from '../_shared/roomDb.ts'
import { adminClient, checkRateLimit, hasPublishableKey, serve, signalRoom } from '../_shared/supabase.ts'
import { randomToken } from '../_shared/tokens.ts'

serve('join-room', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)

  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isFinite(declared)) return errorJson('length_required', 411, origin)
  if (declared > ROOM_MAX_BODY_BYTES) return errorJson('payload_too_large', 413, origin)

  const db = adminClient()
  if (!(await checkRateLimit(db, req, 'join-room'))) return errorJson('rate_limited', 429, origin)

  const form = await readRoomForm(req, origin)
  if (!form.ok) return form.response
  const parsed = parseJoin(form.data)
  if (!parsed.ok) return errorJson(parsed.error, parsed.error === 'not_found' ? 404 : 400, origin)
  const { code, name } = parsed.value

  // Ucuz ön kontrol (dosya yüklemeden önce); kesin denetim room_join'de, kilit altında.
  const room = await loadLiveRoom(db, code)
  if (!room) return errorJson('not_found', 404, origin)
  if (room.phase !== 'lobby') return errorJson('closed', 409, origin)
  if ((await playerCountOf(db, code)) >= ROOM_MAX_PLAYERS) return errorJson('full', 409, origin)

  const photo = await uploadRoomPhoto(db, code, form.photo, room.expires_at)
  const session = randomToken()
  const { data, error } = await db.rpc('room_join', {
    p_code: code,
    p_name: name,
    p_name_key: nameKey(name),
    p_photo_path: photo.path,
    p_photo_url: photo.url,
    p_session_hash: await sessionHashOf(session),
    p_max_players: ROOM_MAX_PLAYERS,
    p_max_active_players: MAX_ACTIVE_ROOM_PLAYERS,
  })
  const result = data as { ok: boolean; error?: string; player_id?: string } | null
  if (error || !result?.ok) {
    await removeRoomPhoto(db, photo.path)
    if (error) throw new Error('room join failed')
    const code = result?.error ?? 'internal'
    return errorJson(code, joinErrorStatus(code), origin)
  }

  await signalRoom(channelTopic(room.channel_id))
  return json({ session, playerId: result.player_id }, 201, origin)
})
