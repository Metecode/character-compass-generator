/**
 * GET|POST /functions/v1/health — veri döndürmez (204).
 *
 * Ücretsiz plan 7 gün hareketsizlikte duraklar. Bu uç nokta küçük bir sorgu
 * (public.ping) çalıştırır ki çağrı veritabanı etkinliği sayılsın. GitHub
 * Actions haftada iki kez çağırır (.github/workflows/keepalive.yml).
 */

import { corsHeaders, errorJson } from '../_shared/http.ts'
import { adminClient, serve } from '../_shared/supabase.ts'

serve('health', ['GET', 'POST'], async (_req, origin) => {
  const { error } = await adminClient().rpc('ping')
  if (error) return errorJson('unavailable', 503, origin)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', ...corsHeaders(origin) } })
})
