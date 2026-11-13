import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameApiError, call } from '../apiClient'

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('call: hata yanıtları', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  const run = async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
    try {
      await call('create-game', 'x')
    } catch (e) {
      return e as GameApiError
    }
    throw new Error('hata bekleniyordu')
  }

  it('429: kod ve tekrar deneme süresi', async () => {
    respond(429, { error: 'rate_limited', retry_after: 754 })
    const e = await run()
    expect(e).toBeInstanceOf(GameApiError)
    expect(e.code).toBe('rate_limited')
    expect(e.retryAfter).toBe(754)
  })

  it('süre yoksa ya da geçersizse null', async () => {
    respond(429, { error: 'rate_limited' })
    expect((await run()).retryAfter).toBeNull()
    vi.restoreAllMocks()
    respond(429, { error: 'rate_limited', retry_after: 'yarın' })
    expect((await run()).retryAfter).toBeNull()
  })

  it('503 too_many_games', async () => {
    respond(503, { error: 'too_many_games' })
    const e = await run()
    expect(e.code).toBe('too_many_games')
    expect(e.retryAfter).toBeNull()
  })
})
