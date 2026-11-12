/**
 * GEÇİCİ teşhis fonksiyonu — kalıcı olarak yayınlanmaz (supabase/functions dışında durur).
 *
 * Amaç: Edge Function'a hangi IP başlığının PLATFORM tarafından yazıldığını,
 * hangisinin istemci tarafından uydurulabildiğini gerçek istekle görmek.
 *
 * Kullanım (bkz. docs/supabase.md → "IP başlığı doğrulaması"):
 *   1) Bu dosyayı supabase/functions/ip-probe/index.ts olarak kopyala,
 *      config.toml'a [functions.ip-probe] verify_jwt = false ekle, deploy et.
 *   2) Sahte başlıklarla çağır; dönen değerleri kendi gerçek IP'nle karşılaştır.
 *   3) Fonksiyonu sil: npx supabase functions delete ip-probe
 *
 * Yanıt yalnızca çağıranın kendi isteğinin başlıklarını içerir; hiçbir şey saklanmaz
 * ya da loglanmaz.
 */

const NAMES = [
  'cf-connecting-ip',
  'x-real-ip',
  'x-forwarded-for',
  'true-client-ip',
  'x-client-ip',
  'forwarded',
  'x-envoy-external-address',
]

Deno.serve((req) => {
  const seen: Record<string, string | null> = {}
  for (const n of NAMES) seen[n] = req.headers.get(n)
  return new Response(JSON.stringify(seen, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
})
