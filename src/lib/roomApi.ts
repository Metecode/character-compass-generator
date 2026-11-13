/**
 * Canlı oda uç noktalarına istekler (Supabase Edge Functions; yalnızca fetch +
 * publishable anahtar). Oda kurma penceresi bunu dinamik import ile yükler;
 * /r/{code} sayfasının parçası doğrudan aktarır. Meme modunun ana parçasında yer almaz.
 *
 * Sunucu tarafı: supabase/functions/{create-room,join-room,get-room-state,room-action,room-admin}
 */

import { GameApiError, call, config } from './apiClient'
import { retryWaitText } from './gameLink'
import { normalizePhoto } from './jpeg'

export { GameApiError }

export type RoomMode = 'classic' | 'quick'
export type RoomPhase = 'lobby' | 'writing' | 'reveal' | 'done'

export interface RoomSession {
  code: string
  session: string
  playerId: string
}

/** Katılmamış ziyaretçinin görebildikleri. */
export interface OutsiderView {
  view: 'outsider'
  creatorName: string
  players: number
  maxPlayers: number
  joinable: boolean
  closedReason: 'started' | 'full' | null
  /** false: gönderilen oturum artık geçersiz (çıkarıldı ya da çıktı). */
  sessionValid: boolean
}

export interface RoomPlayer {
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
  serverNow: number
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
  /** Tahminli mi (lobide oyuncu sayısına göre önizleme). false: açılışta tahmin ve skor yok. */
  guessing: boolean
  players: RoomPlayer[]
  /** Yalnızca YAZMA aşamasında. */
  writing?: WritingState
  /** Yalnızca AÇILIŞ aşamasında. */
  reveal?: RevealState
  /** Yalnızca BITTI aşamasında. */
  result?: ResultState
}

/** Hücredeki görünür madde; `key` hücre içi sıra (gizlemek için). */
export interface RoomItem {
  key: number
  text: string
}

export interface OpenCell {
  cell: number
  playerId: string
  items: RoomItem[]
}

export interface ScoreRow {
  playerId: string
  score: number
}

/** AÇILIŞ: o anki hücre, açılmış hücreler ve ara skor (sunucu: _shared/room.ts → RevealView). */
export interface RevealState {
  gridSize: 2 | 3 | 4
  /** 0 tabanlı sıra ve toplam hücre. */
  position: number
  total: number
  step: 'guess' | 'shown'
  /** Bu hücrede tahmin var mı (tahminsiz odada ve son hücrede yok). */
  cellGuessing: boolean
  cell: number
  items: RoomItem[]
  /** Hücresi henüz açılmamış oyuncular. */
  candidates: string[]
  /** false: bu hücreye madde yazmakla görevliydin. */
  canGuess: boolean
  myGuess: string | null
  /** Yalnızca admin. */
  guessed?: number
  eligible?: number
  /** Gösterme adımında. */
  target?: string
  correct?: string[]
  opened: OpenCell[]
  scores: ScoreRow[]
}

/** BITTI: dolu pusula ve tam skor tablosu. */
export interface ResultState {
  gridSize: 2 | 3 | 4
  cells: OpenCell[]
  scores: ScoreRow[]
  /** Odanın silineceği an (sunucu saati, ms). */
  deletesAt: number
}

/** YAZMA aşamasında bu oyuncunun görevi (yalnızca kendi maddeleri; kimin hazır olduğu yok). */
export interface WritingState {
  /** Sürenin bittiği an (sunucu saati, ms). */
  endsAt: number
  readyCount: number
  total: number
  meReady: boolean
  /** Halka sırasıyla hedefler; hedef bilgisi `players` listesinden. */
  assignments: { targetId: string; texts: string[] }[]
}

export interface ItemDraft {
  target: string
  slot: number
  text: string
}

export interface SaveItemsResult {
  /** Argo süzgecine takıldığı için boş kaydedilenler. */
  flagged: { target: string; slot: number }[]
  /** Herkes hazırdı, aşama AÇILIŞ'a geçti. */
  advanced: boolean
}

export type RoomState = OutsiderView | MemberView

export interface RoomSettingsInput {
  mode: RoomMode
  writeSeconds: number
  allowProfanity: boolean
  name: string
}

function roomForm(data: unknown, photo: Blob): FormData {
  const form = new FormData()
  form.append('data', JSON.stringify(data))
  form.append('photo', photo, 'photo.jpg')
  return form
}

function asSession(res: unknown, code: string): RoomSession {
  const r = res as { session?: unknown; playerId?: unknown } | null
  if (typeof r?.session !== 'string' || typeof r.playerId !== 'string') throw new GameApiError('bad_response')
  return { code, session: r.session, playerId: r.playerId }
}

export async function createRoom(settings: RoomSettingsInput, photo: Blob): Promise<RoomSession> {
  config()
  const res = (await call('create-room', roomForm(settings, await normalizePhoto(photo)))) as { code?: unknown }
  if (typeof res?.code !== 'string') throw new GameApiError('bad_response')
  return asSession(res, res.code)
}

export async function joinRoom(code: string, name: string, photo: Blob): Promise<RoomSession> {
  config()
  const res = await call('join-room', roomForm({ code, name }, await normalizePhoto(photo)))
  return asSession(res, code)
}

const json = (body: unknown) => JSON.stringify(body)

export async function getRoomState(code: string, session?: string): Promise<RoomState> {
  const res = (await call('get-room-state', json(session ? { code, session } : { code }), 'application/json')) as RoomState
  if (res?.view !== 'outsider' && res?.view !== 'member') throw new GameApiError('bad_response')
  return res
}

export type PlayerAction = { action: 'leave' } | { action: 'guess'; position: number; playerId: string }
export type AdminAction =
  | { action: 'kick'; playerId: string }
  | { action: 'delete' }
  | { action: 'start' }
  | { action: 'end-writing' }
  | { action: 'reveal'; position: number }
  | { action: 'next'; position: number }
  | { action: 'hide'; cell: number; key: number }

export const roomAction = (s: RoomSession, a: PlayerAction): Promise<unknown> =>
  call('room-action', json({ code: s.code, session: s.session, ...a }), 'application/json')

export const roomAdmin = (s: RoomSession, a: AdminAction): Promise<unknown> =>
  call('room-admin', json({ code: s.code, session: s.session, ...a }), 'application/json')

/** Taslak kaydı (sinyalsiz); `ready` verilirse hazır durumu da değişir. */
export async function saveItems(
  s: RoomSession,
  items: ItemDraft[],
  { ready, keepalive }: { ready?: boolean; keepalive?: boolean } = {},
): Promise<SaveItemsResult> {
  const body = { code: s.code, session: s.session, action: 'save-items', items, ...(ready === undefined ? {} : { ready }) }
  const res = (await call('room-action', json(body), 'application/json', { keepalive })) as Partial<SaveItemsResult> | null
  if (!Array.isArray(res?.flagged)) throw new GameApiError('bad_response')
  return { flagged: res.flagged, advanced: res.advanced === true }
}

// ---------------------------------------------------------------------------
// Hata metinleri
// ---------------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  not_configured: 'Canlı oda şu an kullanılamıyor.',
  network: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol edip tekrar dener misin?',
  rate_limited: 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.',
  too_many_rooms: 'Şu an çok fazla aktif oda var, biraz sonra tekrar dene.',
  busy: 'Şu an çok fazla oyuncu var, biraz sonra tekrar dene.',
  name_taken: 'Bu ad odada var, başka bir ad yaz.',
  invalid_name: 'Bir ad yaz (en fazla 20 karakter).',
  closed: 'Oyun başladı, artık bu odaya katılınamıyor.',
  full: 'Oda dolu, daha fazla kişi katılamıyor.',
  not_found: 'Bu oda artık yok.',
  not_lobby: 'Oyun başladı; artık odadan çıkılamıyor ya da kimse çıkarılamıyor.',
  not_admin: 'Bu işlemi yalnızca admin yapabilir.',
  not_member: 'Bu odada değilsin.',
  too_few: 'Başlamak için yeterli oyuncu yok.',
  not_writing: 'Yazma süresi bitti.',
  time_up: 'Yazma süresi bitti.',
  item_too_long: 'Madde en fazla 40 karakter olabilir.',
  not_assigned: 'Bu madde sana atanmamış. Sayfayı yenile.',
  not_reveal: 'Açılış bitti.',
  stale: 'Ekran güncelleniyor, tekrar dene.',
  no_guessing: 'Bu odada tahmin yok.',
  not_allowed: 'Bu kişiye sen de yazdın; bu hücrede tahmin yok.',
  invalid_guess: 'Bu kişi zaten açıldı, başka birini seç.',
  no_item: 'Bu madde artık yok.',
  payload_too_large: 'Fotoğraf çok büyük. Başka bir fotoğraf dene.',
  photo_too_large: 'Fotoğraf çok büyük. Başka bir fotoğraf dene.',
  photo_not_jpeg: 'Fotoğraf okunamadı. Başka bir fotoğraf dene.',
  photo_wrong_size: 'Fotoğraf okunamadı. Başka bir fotoğraf dene.',
}

export const roomErrorCode = (e: unknown): string | null => (e instanceof GameApiError ? e.code : null)

export function roomErrorMessage(e: unknown, fallback: string): string {
  const code = roomErrorCode(e)
  return (code && MESSAGES[code]) || fallback
}

/** Oda kurma: hız limitinde ne zaman tekrar denenebileceğini yazar. */
export function createRoomErrorMessage(e: unknown): string {
  if (e instanceof GameApiError && e.code === 'rate_limited') {
    return e.retryAfter
      ? `Bu ağdan çok fazla oda kuruldu. Yaklaşık ${retryWaitText(e.retryAfter)} sonra tekrar dene.`
      : 'Bu ağdan çok fazla oda kuruldu. Biraz sonra tekrar dene.'
  }
  return roomErrorMessage(e, 'Oda kurulamadı. Tekrar dener misin?')
}
