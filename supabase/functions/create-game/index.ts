/**
 * POST /functions/v1/create-game  (multipart/form-data, apikey: publishable)
 *
 * Pusulanın anlık görüntüsünü ve fotoğraflarını seçilen süre için saklar.
 * Döner: { code, expires_at, delete_token } — delete_token yalnızca bu yanıtta
 * vardır; sunucuda yalnızca SHA-256 özeti tutulur.
 *
 * Limitler (_shared/limits.ts): IP başına CREATE_GAME_LIMITS (429 rate_limited +
 * retry_after) ve sistem genelinde MAX_ACTIVE_GAMES aktif oyun (503 too_many_games).
 * Tavan, limit kotası harcanmadan önce denetlenir; satır yazıldıktan sonra yeniden
 * denetlenir, böylece eşzamanlı isteklerde aşılmaz (aşan istek kendi satırını siler).
 */

import { bodyErrorResponse, errorJson, json, rateLimitedJson, readBodyLimited } from '../_shared/http.ts'
import { MAX_ACTIVE_GAMES, MAX_BODY_BYTES } from '../_shared/limits.ts'
import {
  PHOTO_BUCKET,
  activeGameCount,
  adminClient,
  hasPublishableKey,
  serve,
  takeCreateGameLimit,
} from '../_shared/supabase.ts'
import { randomCode, randomToken, sha256Hex } from '../_shared/tokens.ts'
import { validateGame } from '../_shared/validate.ts'

serve('create-game', ['POST'], async (req, origin) => {
  if (!hasPublishableKey(req)) return errorJson('unauthorized', 401, origin)

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return errorJson('unsupported_media_type', 415, origin)
  }

  // Boyut sınırı, gövde okunmadan önce Content-Length'ten denetlenir.
  const declared = Number(req.headers.get('content-length') ?? NaN)
  if (!Number.isFinite(declared)) return errorJson('length_required', 411, origin)
  if (declared > MAX_BODY_BYTES) return errorJson('payload_too_large', 413, origin)

  const db = adminClient()
  if ((await activeGameCount(db)) >= MAX_ACTIVE_GAMES) return errorJson('too_many_games', 503, origin)
  const retryAfter = await takeCreateGameLimit(db, req)
  if (retryAfter > 0) return rateLimitedJson(retryAfter, origin)

  let body: Uint8Array<ArrayBuffer>
  try {
    body = await readBodyLimited(req, MAX_BODY_BYTES)
  } catch (e) {
    return bodyErrorResponse(e, origin)
  }

  let form: FormData
  try {
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return errorJson('invalid_payload', 400, origin)
  }

  let data: unknown
  const rawData = form.get('data')
  if (typeof rawData !== 'string') return errorJson('invalid_payload', 400, origin)
  try {
    data = JSON.parse(rawData)
  } catch {
    return errorJson('invalid_payload', 400, origin)
  }

  const photos: { field: string; bytes: Uint8Array }[] = []
  for (const [field, value] of form.entries()) {
    if (field === 'data') continue
    if (typeof value === 'string') return errorJson('invalid_photo_field', 400, origin)
    photos.push({ field, bytes: new Uint8Array(await value.arrayBuffer()) })
  }

  const result = validateGame(data, photos)
  if (!result.ok) return errorJson(result.error, 400, origin)
  const game = result.value

  const code = randomCode()
  const deleteToken = randomToken()
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + game.durationHours * 3600_000)

  // Foto kimlikleri sunucuda üretilir; istemcinin photoId'leri sunucuya gelmez.
  const photoIds = new Map<number, string>()
  for (const idx of game.photos.keys()) photoIds.set(idx, crypto.randomUUID())
  const pathOf = (id: string) => `${code}/${id}.jpg`
  // İpucu için bulanık sürüm (isteğe bağlı; eski istemciler göndermez).
  const blurPathOf = (id: string) => `${code}/${id}.blur.jpg`

  const { error: insertError } = await db.from('games').insert({
    code,
    title: game.title,
    creator_name: game.creatorName,
    grid_size: game.gridSize,
    regions: game.regions,
    cells: game.cells.map((c) => ({
      name: c.name,
      bullets: c.bullets,
      photo_id: c.photo === null ? null : photoIds.get(c.photo),
    })),
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    delete_token_hash: await sha256Hex(deleteToken),
  })
  if (insertError) throw new Error('game insert failed')

  // Eşzamanlı isteklerde tavan aşıldıysa bu oyun geri alınır (dosya henüz yüklenmedi).
  if ((await activeGameCount(db)) > MAX_ACTIVE_GAMES) {
    await db.from('games').delete().eq('code', code)
    return errorJson('too_many_games', 503, origin)
  }

  // Satır önce yazılır: bir adım yarıda kalsa bile cleanup bu oyunu ve
  // dosyalarını süre dolunca bulur.
  const uploaded: string[] = []
  try {
    if (photoIds.size > 0) {
      const { error } = await db.from('game_photos').insert(
        [...photoIds].map(([idx, id]) => ({
          id,
          game_code: code,
          storage_path: pathOf(id),
          blur_path: game.blurs.has(idx) ? blurPathOf(id) : null,
        })),
      )
      if (error) throw new Error('photo rows insert failed')
    }
    await Promise.all(
      [...photoIds].map(async ([idx, id]) => {
        const bytes = game.photos.get(idx)!
        const { error } = await db.storage
          .from(PHOTO_BUCKET)
          .upload(pathOf(id), bytes, { contentType: 'image/jpeg', upsert: false })
        if (error) throw new Error('photo upload failed')
        uploaded.push(pathOf(id))
        const blur = game.blurs.get(idx)
        if (blur) {
          const { error: blurError } = await db.storage
            .from(PHOTO_BUCKET)
            .upload(blurPathOf(id), blur, { contentType: 'image/jpeg', upsert: false })
          if (blurError) throw new Error('blur upload failed')
          uploaded.push(blurPathOf(id))
        }
      }),
    )
  } catch (e) {
    // Geri al: yüklenen dosyalar ve satırlar (game_photos cascade ile gider).
    if (uploaded.length > 0) await db.storage.from(PHOTO_BUCKET).remove(uploaded)
    await db.from('games').delete().eq('code', code)
    throw e
  }

  return json(
    { code, expires_at: expiresAt.toISOString(), delete_token: deleteToken },
    201,
    origin,
  )
})
