/**
 * Tahmin oyunu uç noktaları (get-game, use-hint, submit-guess, game-stats).
 * Yalnızca /g/{code} sayfasının parçası ve "Oyunlarım → İstatistik" bunu yükler;
 * meme modunun ana parçasında yer almaz.
 *
 * Sunucu tarafı: supabase/functions/{get-game,use-hint,submit-guess,game-stats}
 */

import { GameApiError, call } from './apiClient'

export { GameApiError }

export interface Region {
  color: string
  label?: string
}

export interface PublicCell {
  bullets: string[]
  playable: boolean
  hint: boolean
}

export interface OpenGame {
  title: string
  /** Oyunu kuranın adı; eski oyunlarda yok ya da null. */
  creatorName?: string | null
  gridSize: 2 | 3 | 4
  regions: Region[]
  cells: PublicCell[]
  names: string[]
}

export interface CellResult {
  name: string
  guess: string | null
  correct: boolean
  hinted: boolean
}

export interface RankingEntry {
  rank: number
  name: string
  points2: number
  /** Çözme süresi (sn); bilinmiyorsa null. */
  durationSeconds: number | null
  me: boolean
}

export interface PlayedResult {
  title: string
  gridSize: 2 | 3 | 4
  regions: Region[]
  playerName: string
  /** Bu oyuncunun çözme süresi (sn); başlangıç kaydı yoksa null. */
  durationSeconds: number | null
  score: { points2: number; total: number; cells: (CellResult | null)[] }
  cells: { name: string; bullets: string[]; photo: string | null }[]
  ranking: RankingEntry[]
  expiresAt: string
}

export type GameState =
  | {
      status: 'open'
      game: OpenGame
      hints: Record<number, string>
      /** Şimdiye kadar tahmin gönderen kişi sayısı; eski sunucuda yok. */
      players?: number
      expiresAt: string
    }
  | { status: 'played'; result: PlayedResult }

const json = (body: unknown) => JSON.stringify(body)
const JSON_TYPE = 'application/json'

const toDataUrl = (base64: string) => `data:image/jpeg;base64,${base64}`

function isState(v: unknown): v is GameState {
  if (!v || typeof v !== 'object') return false
  const s = v as { status?: unknown; game?: unknown; result?: unknown }
  return (s.status === 'open' && !!s.game) || (s.status === 'played' && !!s.result)
}

function normalize(state: GameState): GameState {
  if (state.status !== 'open') return state
  const hints: Record<number, string> = {}
  for (const [k, v] of Object.entries(state.hints ?? {})) hints[Number(k)] = toDataUrl(v)
  return { ...state, hints }
}

export async function getGame(code: string, device: string): Promise<GameState> {
  const res = await call('get-game', json({ code, device }), JSON_TYPE)
  if (!isState(res)) throw new GameApiError('bad_response')
  return normalize(res)
}

/**
 * Oyuna başlandı: sunucu bu cihaz için başlangıç zamanını kaydeder (yalnızca
 * ilk seferde; tekrar çağrılması zararsızdır). Çözme süresi sunucuda hesaplanır.
 */
export async function startGame(code: string, device: string): Promise<void> {
  await call('start-game', json({ code, device }), JSON_TYPE)
}

/** Bulanık fotoğrafı data URL olarak döner; ipucu sunucuda kaydedilir. */
export async function requestHint(code: string, device: string, cell: number): Promise<string> {
  const res = (await call('use-hint', json({ code, device, cell }), JSON_TYPE)) as { image?: unknown }
  if (typeof res?.image !== 'string') throw new GameApiError('bad_response')
  return toDataUrl(res.image)
}

export async function submitGuess(
  code: string,
  device: string,
  name: string,
  answers: (string | null)[],
): Promise<PlayedResult> {
  const res = await call('submit-guess', json({ code, device, name, answers }), JSON_TYPE)
  if (!isState(res) || res.status !== 'played') throw new GameApiError('bad_response')
  return res.result
}

export interface GameStats {
  title: string
  expiresAt: string
  total: number
  stats: {
    players: number
    people: { name: string; correct: number }[]
    easiest: string[]
    nobody: string[]
  }
  ranking: { id: string; rank: number; name: string; points2: number; durationSeconds: number | null }[]
}

/** Kurucu istatistiği; `remove` verilirse o tahmin önce silinir. */
export async function gameStats(code: string, deleteToken: string, remove?: string): Promise<GameStats> {
  const res = (await call(
    'game-stats',
    json({ code, delete_token: deleteToken, ...(remove ? { remove } : {}) }),
    JSON_TYPE,
  )) as GameStats
  if (!res || typeof res !== 'object' || !res.stats || !Array.isArray(res.ranking)) {
    throw new GameApiError('bad_response')
  }
  return res
}
