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

  it('create-game: saatte 5', () => {
    expect(server.RATE_LIMITS['create-game']).toEqual({ max: 5, windowSeconds: 3600 })
  })
})
