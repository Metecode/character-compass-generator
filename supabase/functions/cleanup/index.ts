/**
 * POST /functions/v1/cleanup — yalnızca pg_cron çağırır (15 dakikada bir).
 *
 * Dışarıdan çağrılamaz: `x-cleanup-secret` başlığı, Vault'taki sırla
 * veritabanında (public.verify_cleanup_secret) karşılaştırılır. Sır yalnızca
 * veritabanının içinde yaşar. Yanlış ya da eksikse 404 döner; uç noktanın
 * işlevi belli olmaz.
 *
 * İş:
 *  1) Süresi dolan oyunların dosyalarını Storage API ile, ardından satırlarını siler.
 *  2) Kovada satırı olmayan klasörleri (yarım kalmış işlemlerden yetim dosyalar) siler.
 */

import { errorJson, json } from '../_shared/http.ts'
import { PHOTO_BUCKET, adminClient, deleteGameCompletely, serve } from '../_shared/supabase.ts'

const BATCH = 50

serve('cleanup', ['POST'], async (req, origin) => {
  const secret = req.headers.get('x-cleanup-secret')
  if (!secret || !/^[0-9a-f]{64}$/.test(secret)) return errorJson('not_found', 404, origin)

  const db = adminClient()
  const { data: ok, error: authError } = await db.rpc('verify_cleanup_secret', { p_secret: secret })
  if (authError) throw new Error('secret check failed')
  if (ok !== true) return errorJson('not_found', 404, origin)

  // 1) Süresi dolanlar
  const { data: expired, error } = await db
    .from('games')
    .select('code')
    .lte('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
    .limit(BATCH)
  if (error) throw new Error('expired lookup failed')

  let deleted = 0
  let failed = 0
  for (const { code } of expired ?? []) {
    try {
      await deleteGameCompletely(db, code as string)
      deleted++
    } catch {
      failed++ // bir sonraki turda tekrar denenir
    }
  }

  // 2) Yetim klasörler: kovada var, games'te satırı yok.
  let orphans = 0
  const { data: folders, error: listError } = await db.storage
    .from(PHOTO_BUCKET)
    .list('', { limit: 1000 })
  if (listError) throw new Error('bucket list failed')
  const folderNames = (folders ?? []).filter((f) => f.id === null).map((f) => f.name)
  if (folderNames.length > 0) {
    const { data: live, error: liveError } = await db
      .from('games')
      .select('code')
      .in('code', folderNames)
    if (liveError) throw new Error('live lookup failed')
    const liveCodes = new Set((live ?? []).map((g) => g.code as string))
    for (const name of folderNames) {
      if (liveCodes.has(name)) continue
      const { data: files } = await db.storage.from(PHOTO_BUCKET).list(name, { limit: 100 })
      const paths = (files ?? []).map((f) => `${name}/${f.name}`)
      if (paths.length === 0) continue
      const { error: removeError } = await db.storage.from(PHOTO_BUCKET).remove(paths)
      if (removeError) failed++
      else orphans++
    }
  }

  return json({ deleted, orphans, failed }, 200, origin)
})
