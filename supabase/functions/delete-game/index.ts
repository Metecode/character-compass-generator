/**
 * POST /functions/v1/delete-game  (JSON, apikey: publishable)
 * Gövde: { code, delete_token }
 *
 * Doğru anahtarla oyunun dosyalarını (Storage API) ve satırlarını siler.
 * Oyun yoksa, süresi dolmuşsa ya da anahtar yanlışsa aynı yanıt döner (404),
 * böylece kodun var olup olmadığı anlaşılamaz.
 */

import { bodyErrorResponse, errorJson, json, readBodyLimited } from '../_shared/http.ts'
import { MAX_JSON_BODY_BYTES } from '../_shared/limits.ts'
import {
  adminClient,
  checkRateLimit,
  deleteGameCompletely,
  hasPublishableKey,
  serve,
} from '../_shared/supabase.ts'
import { GAME_CODE_PATTERN, verifyDeleteToken } from '../_shared/tokens.ts'

serve('delete-game', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)

  let raw: Uint8Array
  try {
    raw = await readBodyLimited(req, MAX_JSON_BODY_BYTES)
  } catch (e) {
    return bodyErrorResponse(e, origin)
  }

  let body: unknown
  try {
    body = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    return errorJson('invalid_payload', 400, origin)
  }
  if (typeof body !== 'object' || body === null) return errorJson('invalid_payload', 400, origin)
  const { code, delete_token: token } = body as Record<string, unknown>
  if (typeof code !== 'string' || !GAME_CODE_PATTERN.test(code)) {
    return errorJson('not_found', 404, origin)
  }

  const db = adminClient()
  if (!(await checkRateLimit(db, req, 'delete-game'))) {
    return errorJson('rate_limited', 429, origin)
  }

  const { data: game, error } = await db
    .from('games')
    .select('code, delete_token_hash')
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw new Error('game lookup failed')

  // Oyun yoksa da sabit bir özetle karşılaştır: yanıt süresi farkı az olsun.
  const hash = (game?.delete_token_hash as string | undefined) ?? '0'.repeat(64)
  const valid = await verifyDeleteToken(token, hash)
  if (!game || !valid) return errorJson('not_found', 404, origin)

  await deleteGameCompletely(db, code)
  return json({ deleted: true }, 200, origin)
})
