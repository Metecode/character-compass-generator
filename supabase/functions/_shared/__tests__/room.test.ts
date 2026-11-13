// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ROOM_ADMIN_ACTIONS,
  ROOM_PLAYER_ACTIONS,
  adminLooksAway,
  channelTopic,
  isSessionToken,
  nameKey,
  parseAction,
  parseJoin,
  parseRoomSettings,
  projectMember,
  projectOutsider,
  type PlayerRow,
  type RoomRow,
} from '../room.ts'
import { randomToken } from '../tokens.ts'

const NOW = Date.parse('2026-11-17T12:00:00Z')
const ago = (s: number) => new Date(NOW - s * 1000).toISOString()

const room = (over: Partial<RoomRow> = {}): RoomRow => ({
  code: 'AbCdEfGhIjKlMnOp',
  channel_id: 'ChannelChannelChannel1',
  mode: 'classic',
  write_seconds: 180,
  allow_profanity: true,
  phase: 'lobby',
  creator_name: 'Mete',
  admin_player_id: 'p1',
  grid_size: null,
  writing_ends_at: null,
  reveal_index: null,
  reveal_step: null,
  version: 3,
  created_at: ago(600),
  expires_at: new Date(NOW + 3600_000).toISOString(),
  ...over,
})

const player = (id: string, seq: number, seenAgo = 10): PlayerRow => ({
  id,
  seq,
  name: `Oyuncu ${id}`,
  photo_url: `https://x.supabase.co/storage/v1/object/sign/room-photos/${id}.jpg?token=t`,
  last_seen_at: ago(seenAgo),
  ready_at: null,
})

describe('oda ayarları', () => {
  it('geçerli ayarlar; varsayılanlar 3 dk ve küfür izni açık', () => {
    expect(parseRoomSettings({ mode: 'quick', name: '  Mete  ' })).toEqual({
      ok: true,
      value: { mode: 'quick', writeSeconds: 180, allowProfanity: true, name: 'Mete' },
    })
    expect(parseRoomSettings({ mode: 'classic', writeSeconds: 300, allowProfanity: false, name: 'A' })).toMatchObject({
      ok: true,
      value: { writeSeconds: 300, allowProfanity: false },
    })
  })

  it('geçersiz mod, süre, izin ve ad reddedilir', () => {
    expect(parseRoomSettings({ mode: 'yayinci', name: 'A' })).toEqual({ ok: false, error: 'invalid_mode' })
    expect(parseRoomSettings({ mode: 'classic', writeSeconds: 60, name: 'A' })).toEqual({
      ok: false,
      error: 'invalid_duration',
    })
    expect(parseRoomSettings({ mode: 'classic', allowProfanity: 'evet', name: 'A' }).ok).toBe(false)
    expect(parseRoomSettings({ mode: 'classic', name: '   ' }).ok).toBe(false)
    expect(parseRoomSettings({ mode: 'classic', name: 'x'.repeat(21) }).ok).toBe(false)
    expect(parseRoomSettings({ mode: 'classic', name: 'a\nb' }).ok).toBe(false)
    expect(parseRoomSettings([]).ok).toBe(false)
  })

  it('katılma gövdesi', () => {
    expect(parseJoin({ code: 'AbCdEfGhIjKlMnOp', name: 'Ayşe' })).toEqual({
      ok: true,
      value: { code: 'AbCdEfGhIjKlMnOp', name: 'Ayşe' },
    })
    expect(parseJoin({ code: '../x', name: 'Ayşe' })).toEqual({ ok: false, error: 'not_found' })
    expect(parseJoin({ code: 'AbCdEfGhIjKlMnOp', name: '' }).ok).toBe(false)
  })

  it('ad anahtarı Türkçe küçük harfle (aynı ad kontrolü)', () => {
    expect(nameKey('IŞIL')).toBe(nameKey('ışıl'))
    expect(nameKey('İpek')).toBe(nameKey('ipek'))
    expect(nameKey('  Ali   Veli ')).toBe('ali veli')
  })

  it('oturum anahtarı biçimi', () => {
    expect(isSessionToken(randomToken())).toBe(true)
    expect(isSessionToken('kisa')).toBe(false)
    expect(isSessionToken(undefined)).toBe(false)
  })
})

describe('eylem beyaz listesi', () => {
  it('yalnızca listedeki eylemler kabul edilir', () => {
    expect(parseAction('leave', ROOM_PLAYER_ACTIONS)).toBe('leave')
    expect(parseAction('kick', ROOM_PLAYER_ACTIONS)).toBeNull()
    expect(parseAction('delete', ROOM_ADMIN_ACTIONS)).toBe('delete')
    expect(parseAction('kick', ROOM_ADMIN_ACTIONS)).toBe('kick')
    expect(parseAction('__proto__', ROOM_ADMIN_ACTIONS)).toBeNull()
    expect(parseAction(['kick'], ROOM_ADMIN_ACTIONS)).toBeNull()
  })
})

describe('katılmamış ziyaretçinin görünümü', () => {
  it('yalnızca kurucu adı, oyuncu sayısı ve açık olup olmadığı', () => {
    const v = projectOutsider(room(), 5)
    expect(v).toEqual({
      view: 'outsider',
      creatorName: 'Mete',
      players: 5,
      maxPlayers: 16,
      joinable: true,
      closedReason: null,
    })
    expect(JSON.stringify(v)).not.toMatch(/Channel|room-|photo|sign/)
  })

  it('başlamış ve dolu oda kapalı', () => {
    expect(projectOutsider(room({ phase: 'writing' }), 5)).toMatchObject({ joinable: false, closedReason: 'started' })
    expect(projectOutsider(room(), 16)).toMatchObject({ joinable: false, closedReason: 'full' })
  })
})

describe('üyenin görünümü', () => {
  const players = [player('p2', 2, 400), player('p1', 1), player('p3', 3)]

  it('oyuncular katılma sırasıyla, admin ve çevrimiçi bilgisiyle', () => {
    const v = projectMember(room(), players, 'p3', NOW)
    expect(v.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(v.players.map((p) => p.isAdmin)).toEqual([true, false, false])
    expect(v.players.map((p) => p.online)).toEqual([true, false, true])
    expect(v.me).toEqual({ id: 'p3', isAdmin: false })
    expect(v.channel).toBe(channelTopic('ChannelChannelChannel1'))
    expect(v.settings).toEqual({ mode: 'classic', writeSeconds: 180, allowProfanity: true, minPlayers: 4, maxPlayers: 16 })
    expect(v.serverNow).toBe(NOW)
  })

  it('oyuncu başına yalnızca id, ad, foto adresi, admin, çevrimiçi', () => {
    const v = projectMember(room(), players, 'p1', NOW)
    for (const p of v.players) expect(Object.keys(p).sort()).toEqual(['id', 'isAdmin', 'name', 'online', 'photo'])
    const text = JSON.stringify(v)
    expect(text).not.toMatch(/session|author|seq|last_seen|photo_path|target/)
  })

  it('Hızlı modda alt sınır 3', () => {
    expect(projectMember(room({ mode: 'quick' }), players, 'p1', NOW).settings.minPlayers).toBe(3)
  })
})

describe('admin devri ön kontrolü', () => {
  it('admin 5 dakikadan uzun görünmezse', () => {
    expect(adminLooksAway(room(), [player('p1', 1, 299)], NOW, 300)).toBe(false)
    expect(adminLooksAway(room(), [player('p1', 1, 301)], NOW, 300)).toBe(true)
  })

  it('admin yoksa (oyuncu kaldıysa) devir denenir; oyun bittiyse denenmez', () => {
    expect(adminLooksAway(room({ admin_player_id: null }), [player('p2', 2)], NOW, 300)).toBe(true)
    expect(adminLooksAway(room({ phase: 'done' }), [player('p1', 1, 9999)], NOW, 300)).toBe(false)
  })
})
