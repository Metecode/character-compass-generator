// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as client from '../../../../src/constants'
import * as server from '../limits.ts'

describe('sunucu limitleri ön yüzle aynı', () => {
  it('ortak değerler eşleşir', () => {
    expect(server.NAME_MAX).toBe(client.NAME_MAX)
    expect(server.BULLET_MAX).toBe(client.BULLET_MAX)
    expect(server.BULLETS_MAX).toBe(client.BULLETS_MAX)
    expect(server.LABEL_MAX).toBe(client.LABEL_MAX)
    expect(server.PHOTO_SIZE).toBe(client.PHOTO_SIZE)
    expect([...server.GRID_SIZES]).toEqual([...client.GRID_SIZES])
    expect(server.GAME_TITLE_MAX).toBeGreaterThanOrEqual(client.TITLE_MAX)
    expect(server.PHOTO_MAX_BYTES).toBe(client.GAME_PHOTO_MAX_BYTES)
    expect(server.MIN_PLAYABLE_CELLS).toBe(client.GAME_MIN_CELLS)
    expect([...server.DURATIONS_HOURS]).toEqual([...client.GAME_DURATIONS_HOURS])
  })

  it('16 foto ve JSON gövde sınıra sığar', () => {
    expect(server.PHOTOS_MAX * server.PHOTO_MAX_BYTES + 64 * 1024).toBeLessThan(server.MAX_BODY_BYTES)
  })

  it('tahmin oyunu sınırları', () => {
    expect(server.PLAYER_NAME_MAX).toBe(client.PLAYER_NAME_MAX)
    expect(server.CREATOR_NAME_MAX).toBe(client.CREATOR_NAME_MAX)
    expect(server.BLUR_SIZE).toBe(client.BLUR_SIZE)
    expect(server.BLUR_MAX_BYTES).toBe(client.BLUR_MAX_BYTES)
    expect(server.GUESSES_MAX).toBe(200)
    expect(server.SIGNED_URL_SECONDS).toBe(600)
    expect(server.RATE_LIMITS['submit-guess']).toEqual({ max: 30, windowSeconds: 3600 })
    expect(server.RATE_LIMITS['get-game'].max).toBe(120)
    expect(server.RATE_LIMITS['use-hint'].max).toBe(120)
    expect(server.RATE_LIMITS['game-stats'].max).toBe(60)
    expect(server.RATE_LIMITS['start-game'].max).toBe(120)
  })

  it('16 foto + 16 bulanık dosya + JSON gövde sınıra sığar', () => {
    expect(
      server.PHOTOS_MAX * (server.PHOTO_MAX_BYTES + server.BLUR_MAX_BYTES) + 64 * 1024,
    ).toBeLessThan(server.MAX_BODY_BYTES)
  })

  it('create-game: IP başına saatte 15, günde 40; aynı anda en fazla 1000 aktif oyun', () => {
    expect(server.CREATE_GAME_LIMITS).toEqual([
      { key: 'create-game', max: 15, windowSeconds: 3600 },
      { key: 'create-game-day', max: 40, windowSeconds: 86400 },
    ])
    expect(server.MAX_ACTIVE_GAMES).toBe(1000)
    // Günlük limit saatliğin üstünde; pencereler rate_limit_take sınırında (1 gün).
    const [hour, day] = server.CREATE_GAME_LIMITS
    expect(day.max).toBeGreaterThan(hour.max)
    for (const l of server.CREATE_GAME_LIMITS) expect(l.windowSeconds).toBeLessThanOrEqual(86400)
    // Anahtarlar diğer işlemlerle çakışmaz.
    const keys = server.CREATE_GAME_LIMITS.map((l) => l.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys.slice(1)) expect(Object.keys(server.RATE_LIMITS)).not.toContain(k)
  })
})
