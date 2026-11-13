/**
 * POST /functions/v1/start-game  (JSON, apikey: publishable)
 * Gövde: { code, device }
 *
 * Oyuncu adını girip oyuna başladığında çağrılır: bu cihaz için başlangıç
 * zamanını kaydeder. Yalnızca ilk seferde yazılır; sayfa yenilenip tekrar
 * çağrılsa da değişmez. Çözme süresini submit-guess sunucu saatiyle hesaplar.
 *
 * Başlangıç zamanı istemciye dönmez (oyun sırasında sayaç gösterilmez).
 * Oyun yoksa, süresi dolmuşsa ya da kod geçersizse: 404 not_found.
 */

import { errorJson, json } from '../_shared/http.ts'
import { readJson } from '../_shared/game.ts'
import { deviceHash, isDeviceId } from '../_shared/play.ts'
import { adminClient, checkRateLimit, hasPublishableKey, serve } from '../_shared/supabase.ts'
import { GAME_CODE_PATTERN } from '../_shared/tokens.ts'

serve('start-game', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const { code, device } = parsed.body
  if (typeof code !== 'string' || !GAME_CODE_PATTERN.test(code)) return errorJson('not_found', 404, origin)
  if (!isDeviceId(device)) return errorJson('invalid_device', 400, origin)

  const db = adminClient()
  if (!(await checkRateLimit(db, req, 'start-game'))) return errorJson('rate_limited', 429, origin)

  const { data: startedAt, error } = await db.rpc('start_guess', {
    p_code: code,
    p_device_hash: await deviceHash(code, device),
  })
  if (error) throw new Error('start insert failed')
  if (startedAt === null) return errorJson('not_found', 404, origin)
  return json({ started: true }, 200, origin)
})
