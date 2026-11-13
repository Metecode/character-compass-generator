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

  it('canlı oda sınırları ön yüzle aynı', () => {
    expect(server.ROOM_MAX_PLAYERS).toBe(client.ROOM_MAX_PLAYERS)
    expect(server.ROOM_MIN_PLAYERS).toEqual(client.ROOM_MIN_PLAYERS)
    expect([...server.ROOM_WRITE_SECONDS]).toEqual([...client.ROOM_WRITE_SECONDS])
    expect(server.ROOM_DEFAULT_WRITE_SECONDS).toBe(client.ROOM_DEFAULT_WRITE_SECONDS)
    // Nabız aralığının iki katından fazla sessiz kalan oyuncu çevrimdışı sayılır.
    expect(server.ROOM_ONLINE_SECONDS * 1000).toBeGreaterThan(2 * client.ROOM_HEARTBEAT_MS)
    // İstemci en çok saniyede bir çeker (min aralık); oturum limiti bunun üstünde kalır.
    expect(server.ROOM_SESSION_LIMITS['room-state'].max).toBeGreaterThan(60_000 / client.ROOM_MIN_FETCH_GAP_MS)
    expect(server.ROOM_SESSION_LIMITS['room-state'].windowSeconds).toBe(60)
    expect(server.ROOM_WRITE_GRACE_SECONDS).toBe(client.ROOM_WRITE_GRACE_SECONDS)
  })

  it('canlı oda: yazma aşaması', () => {
    // Her oyuncu 3 madde yazar ve 3 madde alır.
    for (const mode of server.ROOM_MODES) {
      const a = server.ROOM_ASSIGNMENT[mode]
      expect(a.targets * a.slots).toBe(3)
      // Halkada hedefler farklı ve kimse kendine yazmaz.
      expect(server.ROOM_MIN_PLAYERS[mode]).toBeGreaterThan(a.targets)
    }
    expect([1, 4, 5, 9, 10, 16].map(server.roomGridSize)).toEqual([2, 2, 3, 3, 4, 4])
    // 5 dk yazma boyunca ≈ 2 sn'de bir taslak kaydı oturum limitine sığar.
    expect(server.ROOM_SESSION_LIMITS['room-action'].max).toBeGreaterThan(300 / 2 + 16 * 2)
    // Taslak debounce'u son kayıt payından kısa.
    expect(client.ROOM_SAVE_DEBOUNCE_MS).toBeLessThan(server.ROOM_WRITE_GRACE_SECONDS * 1000)
  })

  it('canlı oda: oluşturma limiti, tavanlar ve süreler', () => {
    expect(server.CREATE_ROOM_LIMITS).toEqual([
      { key: 'create-room', max: 10, windowSeconds: 3600 },
      { key: 'create-room-day', max: 30, windowSeconds: 86400 },
    ])
    expect(server.MAX_ACTIVE_ROOMS).toBe(20)
    // Realtime ücretsiz planda 200 eşzamanlı bağlantı; her oyuncu bir bağlantı.
    expect(server.MAX_ACTIVE_ROOM_PLAYERS).toBeLessThan(200)
    expect(server.ROOM_MAX_LIFETIME_SECONDS).toBe(7200)
    expect(server.ROOM_DONE_TTL_SECONDS).toBe(1800)
    expect(server.ROOM_ADMIN_TIMEOUT_SECONDS).toBe(300)
    // Tek foto + JSON gövde sınıra sığar.
    expect(server.PHOTO_MAX_BYTES + 16 * 1024).toBeLessThan(server.ROOM_MAX_BODY_BYTES)
    // Limit anahtarları birbiriyle çakışmaz.
    const keys = [
      ...server.CREATE_GAME_LIMITS.map((l) => l.key),
      ...server.CREATE_ROOM_LIMITS.map((l) => l.key),
      ...Object.keys(server.RATE_LIMITS),
      ...Object.keys(server.ROOM_IP_LIMITS),
      ...Object.keys(server.ROOM_SESSION_LIMITS),
    ]
    expect(new Set(keys).size).toBe(keys.length)
    // rate_limit_hit penceresi en fazla 1 saat.
    for (const l of [...Object.values(server.ROOM_IP_LIMITS), ...Object.values(server.ROOM_SESSION_LIMITS)]) {
      expect(l.windowSeconds).toBeLessThanOrEqual(3600)
    }
  })
})
