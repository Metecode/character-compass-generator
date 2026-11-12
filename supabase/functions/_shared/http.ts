/**
 * CORS, JSON yanıtları ve boyut sınırlı gövde okuma. Saf TS (Web standartları).
 *
 * Hata yanıtları yalnızca kısa bir kod taşır ({ error: 'not_found' } gibi);
 * yığın izi, SQL hatası ya da iç mesaj asla istemciye gitmez.
 */

export const ALLOWED_ORIGINS: readonly string[] = [
  'https://compass.meteucar.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' }
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'apikey, content-type'
    h['Access-Control-Max-Age'] = '86400'
  }
  return h
}

/**
 * Tarayıcıdan gelip izinli olmayan bir origin taşıyan istekler reddedilir.
 * Origin başlığı olmayan istekler (curl, zamanlanmış görevler) CORS kapsamında
 * değildir; onların yetkisi ayrıca denetlenir.
 */
export const isOriginAllowed = (origin: string | null): boolean =>
  origin === null || ALLOWED_ORIGINS.includes(origin)

export function json(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
      ...extra,
    },
  })
}

export const errorJson = (code: string, status: number, origin: string | null): Response =>
  json({ error: code }, status, origin)

export class BodyTooLargeError extends Error {}
export class LengthRequiredError extends Error {}

/**
 * Gövdeyi en fazla `max` bayt okur.
 * - Content-Length yoksa ya da sınırı aşıyorsa gövdeye hiç dokunmadan reddeder.
 * - Başlık yalan söylese bile akış okunurken sınır aşılırsa durur.
 */
export async function readBodyLimited(req: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  const header = req.headers.get('content-length')
  if (header === null || !/^\d+$/.test(header)) throw new LengthRequiredError()
  const declared = Number(header)
  if (declared > max) throw new BodyTooLargeError()
  if (!req.body) return new Uint8Array(0)

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      throw new BodyTooLargeError()
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

/** Gövde okuma hatalarını uygun HTTP yanıtına çevirir; başka hatayı yeniden fırlatır. */
export function bodyErrorResponse(e: unknown, origin: string | null): Response {
  if (e instanceof BodyTooLargeError) return errorJson('payload_too_large', 413, origin)
  if (e instanceof LengthRequiredError) return errorJson('length_required', 411, origin)
  throw e
}
