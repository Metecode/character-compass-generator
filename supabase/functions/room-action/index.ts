/**
 * POST /functions/v1/room-action  (JSON, apikey: publishable)
 * Gövde: { code, session, action, ... }
 *
 * Oyuncu eylemleri; `action` beyaz listeyle doğrulanır (ROOM_PLAYER_ACTIONS):
 *   leave       — yalnızca LOBI'de odadan çıkar. Admin çıkarsa admin en eski oyuncuya
 *                 geçer; odada kimse kalmazsa oda silinir.
 *   save-items  { items: [{ target, slot, text }], ready? } — YAZMA'da kendi
 *                 maddelerini kaydeder (taslak; sinyal yok). `ready` değişirse
 *                 sinyal gider; herkes hazırsa aşama AÇILIŞ'a geçer. Süre bittikten
 *                 sonra ROOM_WRITE_GRACE_SECONDS boyunca metin kabul edilir.
 *                 Argo kapalı odada süzgece takılan madde boş kaydedilir ve
 *                 `flagged` içinde döner.
 *   guess       { position, playerId } — AÇILIŞ'ın tahmin adımında o anki hücre için
 *                 tahmin (değiştirilebilir). Hücreye madde yazmakla görevli olan
 *                 tahmin edemez (403 not_allowed). Sinyal yalnızca admine ("x/y").
 *                 `position` güncel değilse 409 stale.
 *
 * Limit: oturum başına saatte 600.
 */

import { readJson } from '../_shared/game.ts'
import { errorJson, json } from '../_shared/http.ts'
import { ROOM_WRITE_GRACE_SECONDS } from '../_shared/limits.ts'
import {
  ROOM_PLAYER_ACTIONS,
  channelTopic,
  parseAction,
  parseGuess,
  parseSaveItems,
  screenItems,
} from '../_shared/room.ts'
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
    case 'save-items': {
      const input = parseSaveItems(body)
      if (!input.ok) return errorJson(input.error, 400, origin)
      const screened = screenItems(input.value.items, room.allow_profanity)
      const { data, error } = await db.rpc('room_save_items', {
        p_code: room.code,
        p_player: me.id,
        p_items: screened.items,
        p_ready: input.value.ready,
        p_grace_seconds: ROOM_WRITE_GRACE_SECONDS,
      })
      if (error) throw new Error('save items failed')
      const r = data as { ok: boolean; error?: string; changed?: boolean; advanced?: boolean }
      if (!r.ok) {
        const status = r.error === 'not_found' ? 404 : r.error === 'not_assigned' ? 400 : 409
        return errorJson(r.error ?? 'internal', status, origin)
      }
      if (r.changed) await signalRoom(channelTopic(room.channel_id))
      return json({ ok: true, flagged: screened.flagged, advanced: r.advanced === true }, 200, origin)
    }
    case 'guess': {
      const input = parseGuess(body)
      if (!input.ok) return errorJson(input.error, 400, origin)
      const { data, error } = await db.rpc('room_guess', {
        p_code: room.code,
        p_player: me.id,
        p_position: input.value.position,
        p_guessed: input.value.playerId,
      })
      if (error) throw new Error('guess failed')
      const r = data as { ok: boolean; error?: string }
      if (!r.ok) {
        const status =
          r.error === 'not_found' ? 404 : r.error === 'not_allowed' ? 403 : r.error === 'invalid_guess' ? 400 : 409
        return errorJson(r.error ?? 'internal', status, origin)
      }
      await signalRoom(channelTopic(room.channel_id), 'admin')
      return json({ ok: true }, 200, origin)
    }
  }
})
