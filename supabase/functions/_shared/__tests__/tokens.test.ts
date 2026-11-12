// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DELETE_TOKEN_PATTERN,
  GAME_CODE_PATTERN,
  randomCode,
  randomToken,
  sha256Hex,
  timingSafeEqual,
  verifyDeleteToken,
} from '../tokens.ts'

describe('oyun kodu', () => {
  it('16 karakter base62 (en az 12), tekrar etmez', () => {
    const codes = new Set(Array.from({ length: 500 }, () => randomCode()))
    expect(codes.size).toBe(500)
    for (const c of codes) {
      expect(c).toHaveLength(16)
      expect(GAME_CODE_PATTERN.test(c)).toBe(true)
    }
  })
})

describe('silme anahtarı', () => {
  it('32 baytlık base64url', () => {
    const t = randomToken()
    expect(DELETE_TOKEN_PATTERN.test(t)).toBe(true)
    expect(randomToken()).not.toBe(t)
  })

  it('sha256Hex bilinen değeri üretir', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('doğru anahtar kabul, yanlış / eksik / biçimsiz anahtar reddedilir', async () => {
    const token = randomToken()
    const hash = await sha256Hex(token)
    expect(await verifyDeleteToken(token, hash)).toBe(true)
    expect(await verifyDeleteToken(randomToken(), hash)).toBe(false)
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    expect(await verifyDeleteToken(flipped, hash)).toBe(false)
    expect(await verifyDeleteToken(undefined, hash)).toBe(false)
    expect(await verifyDeleteToken('', hash)).toBe(false)
    expect(await verifyDeleteToken(123, hash)).toBe(false)
    // Saklanan özetin kendisi anahtar yerine geçmez.
    expect(await verifyDeleteToken(hash, hash)).toBe(false)
  })

  it('timingSafeEqual', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})
