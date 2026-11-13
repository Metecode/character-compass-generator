/**
 * POST /functions/v1/get-game  (JSON, apikey: publishable)
 * Gövde: { code, device }
 *
 * Bu cihaz henüz tahmin göndermediyse oyuncuya giden veri: başlık, ızgara,
 * bölgeler, hücre başına maddeler (isim yok), karıştırılmış isim listesi ve bu
 * cihazın açtığı ipuçları (bulanık JPEG, base64).
 * İsim–hücre eşleşmesi, foto kimlikleri ve dosya yolları DÖNMEZ.
 *
 * Bu cihaz tahmin gönderdiyse oyun yerine kendi sonucu döner (net fotoğraflar
 * 10 dakikalık imzalı adreslerle).
 *
 * Oyun yoksa, süresi dolmuşsa ya da kod geçersizse: 404 not_found.
 */

import { errorJson, json } from '../_shared/http.ts'
import {
  downloadBase64,
  guessOf,
  hintCellsOf,
  hintsOf,
  loadLiveGame,
  photosOf,
  playedResult,
  readJson,
} from '../_shared/game.ts'
import { deviceHash, isDeviceId, publicGame } from '../_shared/play.ts'
import { adminClient, checkRateLimit, hasPublishableKey, serve } from '../_shared/supabase.ts'
import { GAME_CODE_PATTERN } from '../_shared/tokens.ts'

serve('get-game', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const { code, device } = parsed.body
  if (typeof code !== 'string' || !GAME_CODE_PATTERN.test(code)) return errorJson('not_found', 404, origin)
  if (!isDeviceId(device)) return errorJson('invalid_device', 400, origin)

  const db = adminClient()
  if (!(await checkRateLimit(db, req, 'get-game'))) return errorJson('rate_limited', 429, origin)

  const game = await loadLiveGame(db, code)
  if (!game) return errorJson('not_found', 404, origin)
  const hash = await deviceHash(code, device)

  const guess = await guessOf(db, code, hash)
  if (guess) {
    return json({ status: 'played', result: await playedResult(db, game, guess, hash) }, 200, origin)
  }

  const [photos, used] = await Promise.all([photosOf(db, code), hintsOf(db, code, hash)])
  const hintPaths = hintCellsOf(game.cells, photos)
  const hints: Record<string, string> = {}
  await Promise.all(
    used.map(async (cell) => {
      const path = hintPaths.get(cell)
      if (path) hints[cell] = await downloadBase64(db, path)
    }),
  )

  return json(
    {
      status: 'open',
      game: publicGame(game, new Set(hintPaths.keys())),
      hints,
      expiresAt: game.expires_at,
    },
    200,
    origin,
  )
})
