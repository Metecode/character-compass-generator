/**
 * Supabase Edge Function çağrıları için ortak istemci (yalnızca fetch +
 * publishable anahtar; supabase-js kullanılmaz). Yalnızca ağ isteyen parçalar
 * (oyun linki, tahmin oyunu) bunu içe aktarır; meme modu ana parçası aktarmaz.
 */

export class GameApiError extends Error {
  readonly code: string
  /** 429'da sunucunun bildirdiği tekrar deneme süresi (sn); yoksa null. */
  readonly retryAfter: number | null
  constructor(code: string, retryAfter: number | null = null) {
    super(code)
    this.code = code
    this.retryAfter = retryAfter
  }
}

export function config(): { url: string; key: string } {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new GameApiError('not_configured')
  return { url: url.replace(/\/+$/, ''), key }
}

/** `keepalive`: sayfa kapanırken de gitsin (küçük gövdeler; ör. son taslak). */
export async function call(
  path: string,
  body: BodyInit,
  contentType?: string,
  { keepalive = false }: { keepalive?: boolean } = {},
): Promise<unknown> {
  const { url, key } = config()
  const headers: Record<string, string> = { apikey: key }
  if (contentType) headers['Content-Type'] = contentType
  let res: Response
  try {
    res = await fetch(`${url}/functions/v1/${path}`, { method: 'POST', headers, body, keepalive })
  } catch {
    throw new GameApiError('network')
  }
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    // gövdesiz yanıt
  }
  if (!res.ok) {
    const code =
      json && typeof json === 'object' && typeof (json as { error?: unknown }).error === 'string'
        ? (json as { error: string }).error
        : `http_${res.status}`
    const retry = json && typeof json === 'object' ? (json as { retry_after?: unknown }).retry_after : undefined
    throw new GameApiError(code, typeof retry === 'number' && Number.isFinite(retry) && retry > 0 ? retry : null)
  }
  return json
}
