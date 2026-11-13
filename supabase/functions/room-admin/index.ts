/**
 * POST /functions/v1/room-admin  (JSON, apikey: publishable)
 * Gövde: { code, session, action, ... }
 *
 * Admin = oturumu rooms.admin_player_id ile eşleşen oyuncu (ayrı admin anahtarı yok).
 * `action` beyaz listeyle doğrulanır (ROOM_ADMIN_ACTIONS):
 *   kick   { playerId } — yalnızca LOBI'de; admin kendini çıkaramaz.
 *   delete              — odayı fotoğraflarıyla birlikte hemen siler.
 *
 * Limit: oturum başına saatte 300.
 */

import { readJson } from '../_shared/game.ts'
import { errorJson, json } from '../_shared/http.ts'
import { ROOM_ADMIN_ACTIONS, channelTopic, isUuid, parseAction } from '../_shared/room.ts'
import { loadLiveRoom, playerBySession, removeRoomPhoto } from '../_shared/roomDb.ts'
import {
  adminClient,
  checkSessionRateLimit,
  deleteRoomCompletely,
  hasPublishableKey,
  serve,
  signalRoom,
} from '../_shared/supabase.ts'

serve('room-admin', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const body = parsed.body
  const action = parseAction(body.action, ROOM_ADMIN_ACTIONS)
  if (!action) return errorJson('invalid_action', 400, origin)

  const db = adminClient()
  const room = await loadLiveRoom(db, body.code)
  if (!room) return errorJson('not_found', 404, origin)
  const me = await playerBySession(db, room.code, body.session)
  if (!me) return errorJson('not_member', 403, origin)
  if (!(await checkSessionRateLimit(db, me.sessionHash, 'room-admin'))) {
    return errorJson('rate_limited', 429, origin)
  }
  if (room.admin_player_id !== me.id) return errorJson('not_admin', 403, origin)
  const topic = channelTopic(room.channel_id)

  switch (action) {
    case 'kick': {
      if (!isUuid(body.playerId)) return errorJson('invalid_payload', 400, origin)
      const { data, error } = await db.rpc('room_remove_player', {
        p_code: room.code,
        p_player_id: body.playerId,
        p_by_admin: me.id,
      })
      if (error) throw new Error('kick failed')
      const r = data as { ok: boolean; error?: string; photo_path?: string }
      if (!r.ok) {
        const status = r.error === 'not_lobby' ? 409 : r.error === 'forbidden' ? 403 : 404
        return errorJson(r.error ?? 'internal', status, origin)
      }
      if (r.photo_path) await removeRoomPhoto(db, r.photo_path)
      await signalRoom(topic)
      return json({ ok: true }, 200, origin)
    }
    case 'delete': {
      await deleteRoomCompletely(db, room.code)
      // Silindikten sonra: sinyali alan istemciler 404 görür ve "Oda kapandı" gösterir.
      await signalRoom(topic)
      return json({ ok: true }, 200, origin)
    }
  }
})
