/**
 * POST /functions/v1/room-action  (JSON, apikey: publishable)
 * Gövde: { code, session, action, ... }
 *
 * Oyuncu eylemleri; `action` beyaz listeyle doğrulanır (ROOM_PLAYER_ACTIONS):
 *   leave — yalnızca LOBI'de odadan çıkar. Admin çıkarsa admin en eski oyuncuya
 *           geçer; odada kimse kalmazsa oda silinir.
 *
 * Limit: oturum başına saatte 300.
 */

import { readJson } from '../_shared/game.ts'
import { errorJson, json } from '../_shared/http.ts'
import { ROOM_PLAYER_ACTIONS, channelTopic, parseAction } from '../_shared/room.ts'
import { loadLiveRoom, playerBySession, removeRoomPhoto } from '../_shared/roomDb.ts'
import {
  adminClient,
  checkSessionRateLimit,
  deleteRoomCompletely,
  hasPublishableKey,
  serve,
  signalRoom,
} from '../_shared/supabase.ts'

serve('room-action', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const body = parsed.body
  const action = parseAction(body.action, ROOM_PLAYER_ACTIONS)
  if (!action) return errorJson('invalid_action', 400, origin)

  const db = adminClient()
  const room = await loadLiveRoom(db, body.code)
  if (!room) return errorJson('not_found', 404, origin)
  const me = await playerBySession(db, room.code, body.session)
  if (!me) return errorJson('not_member', 403, origin)
  if (!(await checkSessionRateLimit(db, me.sessionHash, 'room-action'))) {
    return errorJson('rate_limited', 429, origin)
  }

  switch (action) {
    case 'leave': {
      const { data, error } = await db.rpc('room_remove_player', {
        p_code: room.code,
        p_player_id: me.id,
        p_by_admin: null,
      })
      if (error) throw new Error('leave failed')
      const r = data as { ok: boolean; error?: string; photo_path?: string; empty?: boolean }
      if (!r.ok) return errorJson(r.error === 'not_lobby' ? 'not_lobby' : 'not_found', r.error === 'not_lobby' ? 409 : 404, origin)
      if (r.empty) {
        await deleteRoomCompletely(db, room.code)
      } else {
        if (r.photo_path) await removeRoomPhoto(db, r.photo_path)
        await signalRoom(channelTopic(room.channel_id))
      }
      return json({ ok: true }, 200, origin)
    }
  }
})
