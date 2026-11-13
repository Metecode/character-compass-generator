/**
 * POST /functions/v1/submit-guess  (JSON, apikey: publishable)
 * Gövde: { code, device, name, answers: (string | null)[] }
 *
 * Puanı sunucu hesaplar (Türkçe yerel ayarla isim karşılaştırması; ipucu açılan
 * hücre yarım puan). Cihaz başına tek tahmin, oyun başına en fazla 200.
 * Döner: sonuç (puan, açılan hücreler, net fotoğrafların 10 dakikalık imzalı
 * adresleri, sıralama).
 *
 * Aynı cihaz ikinci kez gönderirse 409 already_played; oyun doluysa 409 game_full.
 */

import { errorJson, json } from '../_shared/http.ts'
import { guessOf, hintsOf, loadLiveGame, playedResult, readJson } from '../_shared/game.ts'
import { GUESSES_MAX } from '../_shared/limits.ts'
import {
  cleanHints,
  cleanPlayerName,
  deviceHash,
  guessStatusResponse,
  isDeviceId,
  scoreGuess,
  validateAnswers,
} from '../_shared/play.ts'
import { adminClient, checkRateLimit, hasPublishableKey, serve } from '../_shared/supabase.ts'
import { GAME_CODE_PATTERN } from '../_shared/tokens.ts'

serve('submit-guess', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const { code, device, name, answers } = parsed.body
  if (typeof code !== 'string' || !GAME_CODE_PATTERN.test(code)) return errorJson('not_found', 404, origin)
  if (!isDeviceId(device)) return errorJson('invalid_device', 400, origin)
  const player = cleanPlayerName(name)
  if (!player.ok) return errorJson(player.error, 400, origin)

  const db = adminClient()
  if (!(await checkRateLimit(db, req, 'submit-guess'))) return errorJson('rate_limited', 429, origin)

  const game = await loadLiveGame(db, code)
  if (!game) return errorJson('not_found', 404, origin)
  const valid = validateAnswers(answers, game.cells)
  if (!valid.ok) return errorJson(valid.error, 400, origin)

  const hash = await deviceHash(code, device)
  const hints = cleanHints(await hintsOf(db, code, hash), game.cells)
  const score = scoreGuess(game.cells, valid.value, new Set(hints))

  const { data: status, error } = await db.rpc('submit_guess', {
    p_code: code,
    p_device_hash: hash,
    p_player_name: player.value,
    p_answers: valid.value,
    p_hints: hints,
    p_points2: score.points2,
    p_max: GUESSES_MAX,
  })
  if (error) throw new Error('guess insert failed')
  const res = guessStatusResponse(status)
  if (res.error) return errorJson(res.error, res.status, origin)

  const guess = await guessOf(db, code, hash)
  if (!guess) throw new Error('guess missing after insert')
  return json({ status: 'played', result: await playedResult(db, game, guess, hash) }, 201, origin)
})
