/**
 * POST /functions/v1/game-stats  (JSON, apikey: publishable + delete_token)
 * Gövde: { code, delete_token, remove?: guessId }
 *
 * Yalnızca oyunu kuran (silme anahtarı olan) çağırabilir. Döner: kaç kişi
 * oynadı, en kolay tanınan ve kimsenin bilemediği kişiler, sıralama (satır
 * kimlikleriyle; "Bu oyuncuyu sıralamadan kaldır" için).
 * `remove` verilirse o tahmin (ve o cihazın ipuçları) silinir, sonra güncel
 * istatistik döner.
 *
 * Oyun yoksa, süresi dolmuşsa ya da anahtar yanlışsa aynı yanıt: 404.
 */

import { errorJson, json } from '../_shared/http.ts'
import { guessesOf, loadLiveGame, readJson } from '../_shared/game.ts'
import { gameStats, isPlayable, ranking, sortGuesses } from '../_shared/play.ts'
import { adminClient, checkRateLimit, hasPublishableKey, serve } from '../_shared/supabase.ts'
import { GAME_CODE_PATTERN, verifyDeleteToken } from '../_shared/tokens.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

serve('game-stats', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)
  const parsed = await readJson(req, origin)
  if (!parsed.ok) return parsed.response
  const { code, delete_token: token, remove } = parsed.body
  if (typeof code !== 'string' || !GAME_CODE_PATTERN.test(code)) return errorJson('not_found', 404, origin)
  if (remove !== undefined && (typeof remove !== 'string' || !UUID.test(remove))) {
    return errorJson('invalid_payload', 400, origin)
  }

  const db = adminClient()
  if (!(await checkRateLimit(db, req, 'game-stats'))) return errorJson('rate_limited', 429, origin)

  const game = await loadLiveGame(db, code)
  // Oyun yoksa da sabit bir özetle karşılaştır; yanıt kodun varlığını belli etmesin.
  const valid = await verifyDeleteToken(token, game?.delete_token_hash ?? '0'.repeat(64))
  if (!game || !valid) return errorJson('not_found', 404, origin)

  if (typeof remove === 'string') {
    const { data: removed, error } = await db
      .from('guesses')
      .delete()
      .eq('game_code', code)
      .eq('id', remove)
      .select('device_hash')
    if (error) throw new Error('guess delete failed')
    const hash = removed?.[0]?.device_hash as string | undefined
    if (hash) {
      const { error: hintError } = await db
        .from('guess_hints')
        .delete()
        .eq('game_code', code)
        .eq('device_hash', hash)
      if (hintError) throw new Error('hint delete failed')
    }
  }

  const guesses = await guessesOf(db, code)
  const ranked = ranking(guesses, null)
  // ranking ile aynı düzen: satır kimlikleri sırayla eşleşir.
  const idByOrder = sortGuesses(guesses).map((g) => g.id)

  return json(
    {
      title: game.title,
      expiresAt: game.expires_at,
      total: game.cells.filter(isPlayable).length,
      stats: gameStats(game.cells, guesses),
      ranking: ranked.map((r, i) => ({
        id: idByOrder[i]!,
        rank: r.rank,
        name: r.name,
        points2: r.points2,
        durationSeconds: r.durationSeconds,
      })),
    },
    200,
    origin,
  )
})
