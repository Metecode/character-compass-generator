/**
 * POST /functions/v1/use-hint  (JSON, apikey: publishable)
 * Gövde: { code, device, cell }
 *
 * Hücrenin bulanık fotoğrafını (32×32 JPEG, base64) döner ve bu cihaz için
 * ipucunu kaydeder; o hücre doğru bilinirse yarım puan sayılır.
 * Net fotoğraf hiçbir koşulda dönmez.
 */

import { errorJson, json } from '../_shared/http.ts'
import { downloadBase64, guessOf, hintCellsOf, loadLiveGame, photosOf, readJson } from '../_shared/game.ts'
import { deviceHash, isDeviceId } from '../_shared/play.ts'
import { adminClient, checkRateLimit, hasPublishableKey, serve } from '../_shared/supabase.ts'
import { GAME_CODE_PATTERN } from '../_shared/tokens.ts'

serve('use-hint', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const { code, device, cell } = parsed.body
  if (typeof code !== 'string' || !GAME_CODE_PATTERN.test(code)) return errorJson('not_found', 404, origin)
  if (!isDeviceId(device)) return errorJson('invalid_device', 400, origin)
  if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell > 15) {
    return errorJson('invalid_cell', 400, origin)
  }

  const db = adminClient()
  if (!(await checkRateLimit(db, req, 'use-hint'))) return errorJson('rate_limited', 429, origin)

  const game = await loadLiveGame(db, code)
  if (!game) return errorJson('not_found', 404, origin)
  const hash = await deviceHash(code, device)
  // Tahminini göndermiş cihaz için ipucu anlamsız; kayıt da değişmez.
  if (await guessOf(db, code, hash)) return errorJson('already_played', 409, origin)

  const path = hintCellsOf(game.cells, await photosOf(db, code)).get(cell)
  if (!path) return errorJson('no_hint', 404, origin)

  const { error } = await db
    .from('guess_hints')
    .upsert(
      { game_code: code, device_hash: hash, cell },
      { onConflict: 'game_code,device_hash,cell', ignoreDuplicates: true },
    )
  if (error) throw new Error('hint insert failed')

  return json({ cell, image: await downloadBase64(db, path) }, 200, origin)
})
