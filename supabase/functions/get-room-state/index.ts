/**
 * POST /functions/v1/get-room-state  (JSON, apikey: publishable)
 * Gövde: { code, session? }
 *
 * - Oturumu geçerli oyuncuya kendi görünümü (projectMember): lobi listesi, ayarlar,
 *   kanal adı, sunucu saati. Yazarlık bilgisi hiçbir aşamada dönmez.
 * - Oturumsuz (ya da oturumu artık geçersiz) ziyaretçiye yalnızca kurucu adı,
 *   oyuncu sayısı ve katılınabilirlik (projectOutsider). `sessionValid: false`
 *   istemciye cihazdaki anahtarı silmesini söyler (çıkarıldı ya da çıktı).
 * - Oyuncunun görüldüğü kaydedilir; admin 5 dakikadır görünmüyorsa devredilir
 *   (devir olursa kanala sinyal gider).
 *
 * Oda yoksa ya da süresi dolmuşsa: 404 not_found.
 * Limit: oturum başına dakikada 90; oturumsuz IP başına saatte 240.
 */

import { readJson } from '../_shared/game.ts'
import { errorJson, json } from '../_shared/http.ts'
import { channelTopic, projectMember, projectOutsider } from '../_shared/room.ts'
import { loadLiveRoom, playerBySession, playersOf, touchAndHandover } from '../_shared/roomDb.ts'
import {
  adminClient,
  checkRateLimit,
  checkSessionRateLimit,
  hasPublishableKey,
  serve,
  signalRoom,
} from '../_shared/supabase.ts'

serve('get-room-state', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const { code, session } = parsed.body

  const db = adminClient()
  const room = await loadLiveRoom(db, code)
  const me = room && session !== undefined ? await playerBySession(db, room.code, session) : null

  if (me) {
    if (!(await checkSessionRateLimit(db, me.sessionHash, 'room-state'))) {
      return errorJson('rate_limited', 429, origin)
    }
  } else if (!(await checkRateLimit(db, req, 'room-preview'))) {
    return errorJson('rate_limited', 429, origin)
  }
  if (!room) return errorJson('not_found', 404, origin)

  const players = await playersOf(db, room.code)
  if (!me) {
    return json({ ...projectOutsider(room, players.length), sessionValid: session === undefined }, 200, origin)
  }

  const now = Date.now()
  if (await touchAndHandover(db, room, players, me.id, now)) {
    const fresh = await loadLiveRoom(db, room.code)
    if (!fresh) return errorJson('not_found', 404, origin)
    await signalRoom(channelTopic(fresh.channel_id))
    return json(projectMember(fresh, await playersOf(db, room.code), me.id, now), 200, origin)
  }
  return json(projectMember(room, players, me.id, now), 200, origin)
})
