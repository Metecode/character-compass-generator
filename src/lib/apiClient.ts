/**
 * Supabase Edge Function çağrıları için ortak istemci (yalnızca fetch +
 * publishable anahtar; supabase-js kullanılmaz). Yalnızca ağ isteyen parçalar
 * (oyun linki, tahmin oyunu) bunu içe aktarır; meme modu ana parçası aktarmaz.
 */

export class GameApiError extends Error {
  readonly code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export function config(): { url: string; key: string } {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new GameApiError('not_configured')
  return { url: url.replace(/\/+$/, ''), key }
}

export async function call(path: string, body: BodyInit, contentType?: string): Promise<unknown> {
  const { url, key } = config()
  const headers: Record<string, string> = { apikey: key }
  if (contentType) headers['Content-Type'] = contentType
  let res: Response
  try {
    res = await fetch(`${url}/functions/v1/${path}`, { method: 'POST', headers, body })
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
    throw new GameApiError(code)
  }
  return json
}
