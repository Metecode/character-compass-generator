/**
 * POST /functions/v1/get-room-state  (JSON, apikey: publishable)
 * Gövde: { code, session? }
 *
 * - Oturumu geçerli oyuncuya kendi görünümü (projectMember): oyuncu listesi, ayarlar,
 *   kanal adı, sunucu saati; YAZMA'da yalnızca kendi görevi ve kendi maddeleri;
 *   AÇILIŞ'ta o anki hücre, açılmış hücreler ve skorlar; BITTI'de dolu pusula.
 *   Yazarlık bilgisi hiçbir aşamada istemciye dönmez.
 * - Oturumsuz (ya da oturumu artık geçersiz) ziyaretçiye yalnızca kurucu adı,
 *   oyuncu sayısı ve katılınabilirlik (projectOutsider). `sessionValid: false`
 *   istemciye cihazdaki anahtarı silmesini söyler (çıkarıldı ya da çıktı).
 * - Oyuncunun görüldüğü kaydedilir; admin 5 dakikadır görünmüyorsa devredilir.
 * - Yazma süresi (ve kayıt payı) dolduysa aşamayı bu istek ilerletir (cron yok).
 *   Devir ya da aşama değişirse kanala sinyal gider.
 *
 * Oda yoksa ya da süresi dolmuşsa: 404 not_found.
 * Limit: oturum başına dakikada 90; oturumsuz IP başına saatte 240.
 */

import { readJson } from '../_shared/game.ts'
import { errorJson, json } from '../_shared/http.ts'
import { ROOM_WRITE_GRACE_SECONDS } from '../_shared/limits.ts'
import { channelTopic, projectMember, projectOutsider, writingExpired } from '../_shared/room.ts'
import { loadLiveRoom, myItemsOf, playerBySession, playersOf, revealDataOf, touchAndHandover } from '../_shared/roomDb.ts'
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
  let room = await loadLiveRoom(db, code)
  const me = room && session !== undefined ? await playerBySession(db, room.code, session) : null

  if (me) {
    if (!(await checkSessionRateLimit(db, me.sessionHash, 'room-state'))) {
      return errorJson('rate_limited', 429, origin)
    }
  } else if (!(await checkRateLimit(db, req, 'room-preview'))) {
    return errorJson('rate_limited', 429, origin)
  }
  if (!room) return errorJson('not_found', 404, origin)

  let players = await playersOf(db, room.code)
  if (!me) {
    return json({ ...projectOutsider(room, players.length), sessionValid: session === undefined }, 200, origin)
  }

  const now = Date.now()
  let changed = await touchAndHandover(db, room, players, me.id, now)
  if (writingExpired(room, now, ROOM_WRITE_GRACE_SECONDS)) {
    const { data, error } = await db.rpc('room_finish_writing', {
      p_code: room.code,
      p_grace_seconds: ROOM_WRITE_GRACE_SECONDS,
    })
    if (error) throw new Error('finish writing failed')
    if (data === true) changed = true
  }
  if (changed) {
    room = await loadLiveRoom(db, room.code)
    if (!room) return errorJson('not_found', 404, origin)
    players = await playersOf(db, room.code)
    await signalRoom(channelTopic(room.channel_id))
  }

  const myItems = room.phase === 'writing' ? await myItemsOf(db, room.code, me.id) : []
  const revealData =
    room.phase === 'reveal' || room.phase === 'done' ? await revealDataOf(db, room, players) : undefined
  return json(projectMember(room, players, me.id, now, myItems, revealData), 200, origin)
})
