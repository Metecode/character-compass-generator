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
  players: RoomPlayer[]
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

export type PlayerAction = { action: 'leave' }
export type AdminAction = { action: 'kick'; playerId: string } | { action: 'delete' }

export const roomAction = (s: RoomSession, a: PlayerAction): Promise<unknown> =>
  call('room-action', json({ code: s.code, session: s.session, ...a }), 'application/json')

export const roomAdmin = (s: RoomSession, a: AdminAction): Promise<unknown> =>
  call('room-admin', json({ code: s.code, session: s.session, ...a }), 'application/json')

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
