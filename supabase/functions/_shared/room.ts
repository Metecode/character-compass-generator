/**
 * Canlı oda: istek doğrulaması ve her oyuncuya giden görünüm. Saf TS (Deno'ya
 * ya da ağa bağımlı değil), vitest ile test edilir.
 *
 * Güvenlik ilkesi: istemciye giden her şey `projectRoom`dan geçer. Yazarlık
 * (room_items.author_id), oturum özetleri, dosya yolları ve kanal kimliği
 * (yalnızca üyeye) bu fonksiyonun dışında yanıta girmez.
 */

import {
  BULLET_MAX,
  ROOM_ASSIGNMENT,
  ROOM_DEFAULT_WRITE_SECONDS,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  ROOM_MODES,
  ROOM_ONLINE_SECONDS,
  ROOM_WRITE_SECONDS,
  type RoomMode,
  type RoomWriteSeconds,
} from './limits.ts'
import { cleanPlayerName, type Result } from './play.ts'
import { containsProfanity } from './profanity.ts'

export { nameKey } from './play.ts'

export type RoomPhase = 'lobby' | 'writing' | 'reveal' | 'done'

/** Veritabanındaki oda satırı (fonksiyonların okuduğu alanlar). */
export interface RoomRow {
  code: string
  channel_id: string
  mode: RoomMode
  write_seconds: number
  allow_profanity: boolean
  phase: RoomPhase
  creator_name: string
  admin_player_id: string | null
  grid_size: number | null
  writing_ends_at: string | null
  reveal_index: number | null
  reveal_step: 'guess' | 'shown' | null
  version: number
  created_at: string
  expires_at: string
}

export interface PlayerRow {
  id: string
  seq: number
  name: string
  photo_url: string
  last_seen_at: string
  ready_at: string | null
  /** Halkadaki yeri (başlatınca karıştırılır); lobide null. İstemciye gitmez. */
  ring_pos: number | null
}

/** Bu oyuncunun yazdığı madde (yalnızca kendi maddeleri okunur). */
export interface ItemRow {
  target_id: string
  slot: number
  text: string
}

export const ROOM_COLUMNS =
  'code, channel_id, mode, write_seconds, allow_profanity, phase, creator_name, admin_player_id, grid_size, writing_ends_at, reveal_index, reveal_step, version, created_at, expires_at'
export const PLAYER_COLUMNS = 'id, seq, name, photo_url, last_seen_at, ready_at, ring_pos'
export const ITEM_COLUMNS = 'target_id, slot, text'

// ---------------------------------------------------------------------------
// İstek doğrulaması
// ---------------------------------------------------------------------------

/** Oturum anahtarı: 32 bayt, base64url (randomToken). */
export const SESSION_PATTERN = /^[A-Za-z0-9_-]{43}$/
export const isSessionToken = (v: unknown): v is string => typeof v === 'string' && SESSION_PATTERN.test(v)

export const ROOM_CODE_PATTERN = /^[A-Za-z0-9]{12,64}$/
export const isRoomCode = (v: unknown): v is string => typeof v === 'string' && ROOM_CODE_PATTERN.test(v)

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_PATTERN.test(v)

export interface RoomSettings {
  mode: RoomMode
  writeSeconds: RoomWriteSeconds
  allowProfanity: boolean
  /** Kurucunun adı (aynı zamanda ilk oyuncunun adı). */
  name: string
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** create-room `data` alanı: { mode, writeSeconds?, allowProfanity?, name }. */
export function parseRoomSettings(data: unknown): Result<RoomSettings> {
  if (!isRecord(data)) return { ok: false, error: 'invalid_payload' }
  if (typeof data.mode !== 'string' || !(ROOM_MODES as readonly string[]).includes(data.mode)) {
    return { ok: false, error: 'invalid_mode' }
  }
  let writeSeconds: RoomWriteSeconds = ROOM_DEFAULT_WRITE_SECONDS
  if (data.writeSeconds !== undefined) {
    if (typeof data.writeSeconds !== 'number' || !(ROOM_WRITE_SECONDS as readonly number[]).includes(data.writeSeconds)) {
      return { ok: false, error: 'invalid_duration' }
    }
    writeSeconds = data.writeSeconds as RoomWriteSeconds
  }
  let allowProfanity = true // varsayılan açık (arkadaş modu)
  if (data.allowProfanity !== undefined) {
    if (typeof data.allowProfanity !== 'boolean') return { ok: false, error: 'invalid_payload' }
    allowProfanity = data.allowProfanity
  }
  const name = cleanPlayerName(data.name)
  if (!name.ok) return name
  return { ok: true, value: { mode: data.mode as RoomMode, writeSeconds, allowProfanity, name: name.value } }
}

/** join-room `data` alanı: { code, name }. */
export function parseJoin(data: unknown): Result<{ code: string; name: string }> {
  if (!isRecord(data)) return { ok: false, error: 'invalid_payload' }
  if (!isRoomCode(data.code)) return { ok: false, error: 'not_found' }
  const name = cleanPlayerName(data.name)
  if (!name.ok) return name
  return { ok: true, value: { code: data.code, name: name.value } }
}

/**
 * room-action / room-admin: `action` beyaz listede olmalı. Liste her teslimat
 * parçasında genişler; listede olmayan eylem 400 invalid_action döner.
 */
export const ROOM_PLAYER_ACTIONS = ['leave', 'save-items'] as const
export const ROOM_ADMIN_ACTIONS = ['kick', 'delete', 'start', 'end-writing'] as const
export type RoomPlayerAction = (typeof ROOM_PLAYER_ACTIONS)[number]
export type RoomAdminAction = (typeof ROOM_ADMIN_ACTIONS)[number]

export function parseAction<A extends string>(v: unknown, allowed: readonly A[]): A | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as A) : null
}

export interface ItemInput {
  target: string
  slot: number
  text: string
}

// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** Madde metni: kontrol karakteri yok, boşluklar sadeleşir, en fazla BULLET_MAX karakter. Boş olabilir. */
export function cleanItemText(v: unknown): Result<string> {
  if (typeof v !== 'string' || CONTROL_CHARS.test(v)) return { ok: false, error: 'invalid_item' }
  const text = v.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (Array.from(text).length > BULLET_MAX) return { ok: false, error: 'item_too_long' }
  return { ok: true, value: text }
}

/**
 * room-action save-items gövdesi: { items: [{ target, slot, text }] (en fazla 3), ready? }.
 * Aynı (hedef, yuva) iki kez gelemez. Atamaya ait olup olmadığını veritabanı denetler.
 */
export function parseSaveItems(body: Record<string, unknown>): Result<{ items: ItemInput[]; ready: boolean | null }> {
  const raw = body.items ?? []
  if (!Array.isArray(raw) || raw.length > 3) return { ok: false, error: 'invalid_payload' }
  let ready: boolean | null = null
  if (body.ready !== undefined) {
    if (typeof body.ready !== 'boolean') return { ok: false, error: 'invalid_payload' }
    ready = body.ready
  }
  const items: ItemInput[] = []
  const seen = new Set<string>()
  for (const it of raw) {
    if (!isRecord(it) || !isUuid(it.target)) return { ok: false, error: 'invalid_payload' }
    if (typeof it.slot !== 'number' || !Number.isInteger(it.slot) || it.slot < 0 || it.slot > 2) {
      return { ok: false, error: 'invalid_payload' }
    }
    const key = `${it.target}:${it.slot}`
    if (seen.has(key)) return { ok: false, error: 'invalid_payload' }
    seen.add(key)
    const text = cleanItemText(it.text)
    if (!text.ok) return text
    items.push({ target: it.target, slot: it.slot, text: text.value })
  }
  return { ok: true, value: { items, ready } }
}

/**
 * Argo kapalı odada süzgece takılan maddeler boş kaydedilir ve istemciye bildirilir
 * (istemci alanın altında uyarı gösterir; yazılan metin cihazda kalır).
 */
export function screenItems(
  items: readonly ItemInput[],
  allowProfanity: boolean,
): { items: ItemInput[]; flagged: { target: string; slot: number }[] } {
  if (allowProfanity) return { items: [...items], flagged: [] }
  const flagged: { target: string; slot: number }[] = []
  const out = items.map((it) => {
    if (!containsProfanity(it.text)) return it
    flagged.push({ target: it.target, slot: it.slot })
    return { ...it, text: '' }
  })
  return { items: out, flagged }
}

// ---------------------------------------------------------------------------
// Görünüm
// ---------------------------------------------------------------------------

export const isOnline = (lastSeenAt: string, now: number): boolean =>
  now - Date.parse(lastSeenAt) <= ROOM_ONLINE_SECONDS * 1000

/** Odaya katılmamış ziyaretçinin görebildikleri: kurucu adı, oyuncu sayısı, açık mı. */
export interface OutsiderView {
  view: 'outsider'
  creatorName: string
  players: number
  maxPlayers: number
  /** Katılınabilir mi; değilse nedeni. */
  joinable: boolean
  closedReason: 'started' | 'full' | null
}

export function projectOutsider(room: Pick<RoomRow, 'creator_name' | 'phase'>, playerCount: number): OutsiderView {
  const started = room.phase !== 'lobby'
  const full = !started && playerCount >= ROOM_MAX_PLAYERS
  return {
    view: 'outsider',
    creatorName: room.creator_name,
    players: playerCount,
    maxPlayers: ROOM_MAX_PLAYERS,
    joinable: !started && !full,
    closedReason: started ? 'started' : full ? 'full' : null,
  }
}

export interface MemberPlayer {
  id: string
  name: string
  photo: string
  isAdmin: boolean
  online: boolean
}

export interface MemberView {
  view: 'member'
  phase: RoomPhase
  version: number
  /** Sunucu saati (ms); istemci geri sayımı bu farka göre düzeltir. */
  serverNow: number
  /** Realtime konu adı (room-{channel_id}); yalnızca üyeye. */
  channel: string
  me: { id: string; isAdmin: boolean }
  settings: {
    mode: RoomMode
    writeSeconds: number
    allowProfanity: boolean
    minPlayers: number
    maxPlayers: number
  }
  creatorName: string
  expiresAt: string
  players: MemberPlayer[]
  /** Yalnızca YAZMA aşamasında. */
  writing?: WritingView
}

/**
 * YAZMA aşamasında oyuncunun kendi görevi. Hedefler `players` listesindeki
 * kimliklerle verilir; yalnızca bu oyuncunun yazdığı metinler döner. Kimin kime
 * yazdığı (halka) ve hazır olanların kimliği dönmez, yalnızca sayısı.
 */
export interface WritingView {
  /** Sürenin bittiği an (sunucu saati, ms). */
  endsAt: number
  readyCount: number
  total: number
  meReady: boolean
  /** Halka sırasıyla: Klasik'te 3 hedef × 1 madde, Hızlı'da 1 hedef × 3 madde. */
  assignments: { targetId: string; texts: string[] }[]
}

export const channelTopic = (channelId: string): string => `room-${channelId}`

/**
 * Oyuncunun yazma görevi: halkada kendinden sonraki hedefler, her biri için
 * kendi yazdığı metinler (yuva sırasıyla). Halka kurulmadıysa boş.
 */
export function assignmentsFor(
  mode: RoomMode,
  players: readonly Pick<PlayerRow, 'id' | 'ring_pos'>[],
  meId: string,
  myItems: readonly ItemRow[],
): WritingView['assignments'] {
  const me = players.find((p) => p.id === meId)
  const n = players.length
  if (!me || me.ring_pos === null) return []
  const byPos = new Map(players.map((p) => [p.ring_pos, p.id]))
  const { targets, slots } = ROOM_ASSIGNMENT[mode]
  const out: WritingView['assignments'] = []
  for (let d = 1; d <= targets; d++) {
    const targetId = byPos.get((me.ring_pos + d) % n)
    if (!targetId || targetId === meId) continue
    const texts = Array.from({ length: slots }, (_, slot) =>
      myItems.find((it) => it.target_id === targetId && it.slot === slot)?.text ?? '',
    )
    out.push({ targetId, texts })
  }
  return out
}

/**
 * Üyenin görünümü. Oyuncu satırından yalnızca ad, imzalı foto adresi ve çevrimiçi
 * bilgisi çıkar. YAZMA'da `writing` eklenir (yalnızca kendi maddeleri);
 * açılış ve sonuç alanları C parçasında.
 */
export function projectMember(
  room: RoomRow,
  players: readonly PlayerRow[],
  meId: string,
  now: number,
  myItems: readonly ItemRow[] = [],
): MemberView {
  const sorted = [...players].sort((a, b) => a.seq - b.seq)
  const writing: WritingView | undefined =
    room.phase === 'writing' && room.writing_ends_at
      ? {
          endsAt: Date.parse(room.writing_ends_at),
          readyCount: players.filter((p) => p.ready_at !== null).length,
          total: players.length,
          meReady: players.find((p) => p.id === meId)?.ready_at != null,
          assignments: assignmentsFor(room.mode, players, meId, myItems),
        }
      : undefined
  return {
    view: 'member',
    phase: room.phase,
    version: room.version,
    serverNow: now,
    channel: channelTopic(room.channel_id),
    me: { id: meId, isAdmin: room.admin_player_id === meId },
    settings: {
      mode: room.mode,
      writeSeconds: room.write_seconds,
      allowProfanity: room.allow_profanity,
      minPlayers: ROOM_MIN_PLAYERS[room.mode],
      maxPlayers: ROOM_MAX_PLAYERS,
    },
    creatorName: room.creator_name,
    expiresAt: room.expires_at,
    players: sorted.map((p) => ({
      id: p.id,
      name: p.name,
      photo: p.photo_url,
      isAdmin: room.admin_player_id === p.id,
      online: isOnline(p.last_seen_at, now),
    })),
    ...(writing ? { writing } : {}),
  }
}

/** Süre (ve kayıt payı) doldu mu: ilk durum isteği aşamayı ilerletir. */
export const writingExpired = (room: Pick<RoomRow, 'phase' | 'writing_ends_at'>, now: number, graceSeconds: number): boolean =>
  room.phase === 'writing' && room.writing_ends_at !== null && now > Date.parse(room.writing_ends_at) + graceSeconds * 1000

/** Admin devri denetlenmeli mi (veritabanında kilitli işlem gerekmeden önce ucuz ön kontrol). */
export function adminLooksAway(
  room: Pick<RoomRow, 'phase' | 'admin_player_id'>,
  players: readonly Pick<PlayerRow, 'id' | 'last_seen_at'>[],
  now: number,
  timeoutSeconds: number,
): boolean {
  if (room.phase === 'done') return false
  const admin = players.find((p) => p.id === room.admin_player_id)
  if (!admin) return players.length > 0
  return now - Date.parse(admin.last_seen_at) > timeoutSeconds * 1000
}
