// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ROOM_ADMIN_ACTIONS,
  ROOM_PLAYER_ACTIONS,
  adminLooksAway,
  assignmentsFor,
  channelTopic,
  cleanItemText,
  isSessionToken,
  nameKey,
  parseAction,
  parseJoin,
  parseRoomSettings,
  parseSaveItems,
  projectMember,
  projectOutsider,
  screenItems,
  writingExpired,
  type ItemRow,
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
  ring_pos: null,
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
    expect(parseAction('save-items', ROOM_PLAYER_ACTIONS)).toBe('save-items')
    expect(parseAction('start', ROOM_PLAYER_ACTIONS)).toBeNull()
    expect(parseAction('start', ROOM_ADMIN_ACTIONS)).toBe('start')
    expect(parseAction('end-writing', ROOM_ADMIN_ACTIONS)).toBe('end-writing')
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

// ---------------------------------------------------------------------------
// YAZMA
// ---------------------------------------------------------------------------

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('madde kaydı gövdesi', () => {
  it('metin sadeleşir, boş olabilir, 40 karakteri aşamaz', () => {
    expect(cleanItemText('  Hep   geç kalır ')).toEqual({ ok: true, value: 'Hep geç kalır' })
    expect(cleanItemText('')).toEqual({ ok: true, value: '' })
    expect(cleanItemText('ş'.repeat(40))).toMatchObject({ ok: true })
    expect(cleanItemText('ş'.repeat(41))).toEqual({ ok: false, error: 'item_too_long' })
    expect(cleanItemText('a\u0000b')).toEqual({ ok: false, error: 'invalid_item' })
    expect(cleanItemText(5)).toEqual({ ok: false, error: 'invalid_item' })
  })

  it('en fazla 3 madde, geçerli hedef ve yuva, tekrar yok; ready isteğe bağlı', () => {
    expect(parseSaveItems({ items: [{ target: U(1), slot: 0, text: ' a ' }] })).toEqual({
      ok: true,
      value: { items: [{ target: U(1), slot: 0, text: 'a' }], ready: null },
    })
    expect(parseSaveItems({ ready: true })).toEqual({ ok: true, value: { items: [], ready: true } })
    const bad = [
      { items: [1, 2, 3, 4].map((i) => ({ target: U(i), slot: 0, text: '' })) },
      { items: [{ target: 'p1', slot: 0, text: '' }] },
      { items: [{ target: U(1), slot: 3, text: '' }] },
      { items: [{ target: U(1), slot: 0.5, text: '' }] },
      { items: [{ target: U(1), slot: 0, text: '' }, { target: U(1), slot: 0, text: 'x' }] },
      { items: 'x' },
      { ready: 'yes' },
    ]
    for (const b of bad) expect(parseSaveItems(b as Record<string, unknown>).ok).toBe(false)
  })

  it('argo kapalıyken süzgece takılan madde boş kaydedilir ve bildirilir', () => {
    const items = [
      { target: U(1), slot: 0, text: 'Hep geç kalır' },
      { target: U(2), slot: 0, text: 'siktir git' },
    ]
    expect(screenItems(items, true)).toEqual({ items, flagged: [] })
    expect(screenItems(items, false)).toEqual({
      items: [items[0], { target: U(2), slot: 0, text: '' }],
      flagged: [{ target: U(2), slot: 0 }],
    })
  })
})

describe('yazma görevi', () => {
  // Halka: p3(0) → p1(1) → p4(2) → p2(3) → p5(4)
  const ring = (ids: string[]) => ids.map((id, i) => ({ ...player(id, Number(id.slice(1))), ring_pos: i }))
  const players = ring(['p3', 'p1', 'p4', 'p2', 'p5'])
  const mine: ItemRow[] = [
    { target_id: 'p4', slot: 0, text: 'Çay sever' },
    { target_id: 'p5', slot: 0, text: '' },
  ]

  it('Klasik: halkada sonraki 3 kişi, birer madde', () => {
    expect(assignmentsFor('classic', players, 'p1', mine)).toEqual([
      { targetId: 'p4', texts: ['Çay sever'] },
      { targetId: 'p2', texts: [''] },
      { targetId: 'p5', texts: [''] },
    ])
    // Halkanın sonundaki oyuncu başa döner.
    expect(assignmentsFor('classic', players, 'p5', []).map((a) => a.targetId)).toEqual(['p3', 'p1', 'p4'])
  })

  it('Hızlı: sonraki 1 kişi, 3 madde (yuva sırasıyla)', () => {
    const items: ItemRow[] = [
      { target_id: 'p4', slot: 2, text: 'üç' },
      { target_id: 'p4', slot: 0, text: 'bir' },
    ]
    expect(assignmentsFor('quick', players, 'p1', items)).toEqual([{ targetId: 'p4', texts: ['bir', '', 'üç'] }])
  })

  it('her oyuncu tam 3 madde alır, kimse kendine yazmaz', () => {
    for (const mode of ['classic', 'quick'] as const) {
      const received = new Map<string, number>()
      for (const p of players) {
        for (const a of assignmentsFor(mode, players, p.id, [])) {
          expect(a.targetId).not.toBe(p.id)
          received.set(a.targetId, (received.get(a.targetId) ?? 0) + a.texts.length)
        }
      }
      expect([...received.values()]).toEqual([3, 3, 3, 3, 3])
    }
  })

  it('halka kurulmadıysa görev yok', () => {
    expect(assignmentsFor('classic', [player('p1', 1), player('p2', 2)], 'p1', [])).toEqual([])
  })

  it('YAZMA görünümü: bitiş, hazır sayısı, kendi görevi; kimin hazır olduğu ve halka dönmez', () => {
    const ends = new Date(NOW + 90_000).toISOString()
    const ps = players.map((p) => (p.id === 'p2' || p.id === 'p1' ? { ...p, ready_at: ago(5) } : p))
    const v = projectMember(room({ phase: 'writing', writing_ends_at: ends, admin_player_id: 'p3' }), ps, 'p1', NOW, mine)
    expect(v.writing).toEqual({
      endsAt: NOW + 90_000,
      readyCount: 2,
      total: 5,
      meReady: true,
      assignments: [
        { targetId: 'p4', texts: ['Çay sever'] },
        { targetId: 'p2', texts: [''] },
        { targetId: 'p5', texts: [''] },
      ],
    })
    for (const p of v.players) expect(Object.keys(p).sort()).toEqual(['id', 'isAdmin', 'name', 'online', 'photo'])
    expect(JSON.stringify(v)).not.toMatch(/ring|ready_at|author|session|seq/)
  })

  it('lobide ve açılışta yazma bölümü yok', () => {
    expect(projectMember(room(), players, 'p1', NOW, mine).writing).toBeUndefined()
    expect(projectMember(room({ phase: 'reveal' }), players, 'p1', NOW, mine).writing).toBeUndefined()
  })

  it('süre ve kayıt payı dolunca aşama ilerler', () => {
    const r = room({ phase: 'writing', writing_ends_at: new Date(NOW - 4000).toISOString() })
    expect(writingExpired(r, NOW, 5)).toBe(false)
    expect(writingExpired(r, NOW + 1001, 5)).toBe(true)
    expect(writingExpired({ ...r, phase: 'reveal' }, NOW + 60_000, 5)).toBe(false)
  })
})
