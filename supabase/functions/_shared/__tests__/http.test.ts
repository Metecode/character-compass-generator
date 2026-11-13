// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  BodyTooLargeError,
  LengthRequiredError,
  corsHeaders,
  isOriginAllowed,
  rateLimitedJson,
  readBodyLimited,
} from '../http.ts'
import { clientIp, rateLimitKey } from '../ip.ts'

describe('rateLimitedJson', () => {
  it('429, gövdede ve başlıkta tekrar deneme süresi', async () => {
    const res = rateLimitedJson(754, 'https://compass.meteucar.com')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('754')
    expect(await res.json()).toEqual({ error: 'rate_limited', retry_after: 754 })
  })
})

describe('CORS', () => {
  it('yalnızca yayın ve yerel geliştirme adresine izin verir', () => {
    const allow = (o: string) => corsHeaders(o)['Access-Control-Allow-Origin']
    expect(allow('https://compass.meteucar.com')).toBe('https://compass.meteucar.com')
    expect(allow('http://localhost:5173')).toBe('http://localhost:5173')
    expect(allow('https://evil.example')).toBeUndefined()
    expect(allow('http://compass.meteucar.com')).toBeUndefined()
    expect(isOriginAllowed('https://evil.example')).toBe(false)
    expect(isOriginAllowed(null)).toBe(true)
  })
})

describe('readBodyLimited', () => {
  const post = (body: string, length: string) =>
    new Request('https://x.test', { method: 'POST', body, headers: { 'content-length': length } })

  it('Content-Length sınırı aşıyorsa gövdeyi okumadan reddeder', async () => {
    let pulled = false
    const stream = new ReadableStream(
      {
        pull() {
          pulled = true
        },
      },
      // Tüketici okumadıkça pull çağrılmasın.
      { highWaterMark: 0 },
    )
    const r = new Request('https://x.test', {
      method: 'POST',
      body: stream,
      headers: { 'content-length': String(4 * 1024 * 1024) },
      duplex: 'half',
    } as RequestInit)
    await expect(readBodyLimited(r, 3 * 1024 * 1024)).rejects.toBeInstanceOf(BodyTooLargeError)
    expect(pulled).toBe(false)
  })

  it('Content-Length yoksa reddeder', async () => {
    const r = new Request('https://x.test', { method: 'POST', body: 'abc' })
    await expect(readBodyLimited(r, 100)).rejects.toBeInstanceOf(LengthRequiredError)
  })

  it('başlık yalan söylese bile akışta sınırı uygular', async () => {
    await expect(readBodyLimited(post('x'.repeat(200), '10'), 100)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    )
  })

  it('sınır içindeki gövdeyi okur', async () => {
    const out = await readBodyLimited(post('hello', '5'), 100)
    expect(new TextDecoder().decode(out)).toBe('hello')
  })
})

describe('istemci IP ve hız limiti anahtarı', () => {
  it('istemcinin gönderdiği x-forwarded-for varsayılan olarak kullanılmaz', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6' }))).toBeNull()
  })

  it('platform başlığını kullanır', () => {
    const h = new Headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '6.6.6.6' })
    expect(clientIp(h)).toBe('1.2.3.4')
    expect(clientIp(new Headers({ 'x-real-ip': '2001:DB8::1' }))).toBe('2001:db8::1')
  })

  it('yapılandırılan başlıkta listenin en sağındaki değeri alır', () => {
    const h = new Headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' })
    expect(clientIp(h, 'X-Forwarded-For')).toBe('1.2.3.4')
  })

  it('IP gibi görünmeyen değeri yok sayar', () => {
    expect(clientIp(new Headers({ 'cf-connecting-ip': '<script>' }))).toBeNull()
  })

  it('anahtar ham IP içermez ve tuza bağlıdır', async () => {
    const a = await rateLimitKey('1.2.3.4', 's'.repeat(32), 'create-game')
    const b = await rateLimitKey('1.2.3.4', 't'.repeat(32), 'create-game')
    expect(a).not.toContain('1.2.3.4')
    expect(a).toMatch(/^[0-9a-f]{64}:create-game$/)
    expect(a).not.toBe(b)
  })
})
