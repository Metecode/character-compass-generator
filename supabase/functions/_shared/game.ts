/**
 * Tahmin oyunu fonksiyonlarının (get-game, use-hint, submit-guess, game-stats)
 * veritabanı ve Storage yardımcıları. Ortam: Edge Function (supabase-js).
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0'
import { bodyErrorResponse, errorJson, readBodyLimited } from './http.ts'
import { MAX_JSON_BODY_BYTES, SIGNED_URL_SECONDS } from './limits.ts'
import {
  ranking,
  scoreGuess,
  type GuessRow,
  type RankingEntry,
  type Score,
  type StoredCell,
  type StoredGame,
} from './play.ts'
import { PHOTO_BUCKET } from './supabase.ts'

export interface LiveGame extends StoredGame {
  code: string
  expires_at: string
  delete_token_hash: string
}

export interface PhotoRow {
  id: string
  storage_path: string
  blur_path: string | null
}

/** JSON gövdeyi (≤ 4 KB) okur; hata varsa hazır yanıtı döner. */
export async function readJson(
  req: Request,
  origin: string | null,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  let raw: Uint8Array
  try {
    raw = await readBodyLimited(req, MAX_JSON_BODY_BYTES)
  } catch (e) {
    return { ok: false, response: bodyErrorResponse(e, origin) }
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(raw))
    if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
      return { ok: true, body: body as Record<string, unknown> }
    }
  } catch {
    // aşağıda
  }
  return { ok: false, response: errorJson('invalid_payload', 400, origin) }
}

/** Süresi dolmamış oyun; yoksa (silinmiş, süresi dolmuş, geçersiz) null. */
export async function loadLiveGame(db: SupabaseClient, code: string): Promise<LiveGame | null> {
  const { data, error } = await db
    .from('games')
    .select('code, title, grid_size, regions, cells, expires_at, delete_token_hash')
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw new Error('game lookup failed')
  return (data as LiveGame | null) ?? null
}

export async function photosOf(db: SupabaseClient, code: string): Promise<PhotoRow[]> {
  const { data, error } = await db
    .from('game_photos')
    .select('id, storage_path, blur_path')
    .eq('game_code', code)
  if (error) throw new Error('photo lookup failed')
  return (data ?? []) as PhotoRow[]
}

/** Bulanık dosyası olan hücre indeksleri. */
export function hintCellsOf(cells: readonly StoredCell[], photos: readonly PhotoRow[]): Map<number, string> {
  const blurById = new Map(photos.filter((p) => p.blur_path).map((p) => [p.id, p.blur_path!]))
  const out = new Map<number, string>()
  cells.forEach((c, i) => {
    const path = c.photo_id ? blurById.get(c.photo_id) : undefined
    if (path) out.set(i, path)
  })
  return out
}

export async function hintsOf(db: SupabaseClient, code: string, hash: string): Promise<number[]> {
  const { data, error } = await db
    .from('guess_hints')
    .select('cell')
    .eq('game_code', code)
    .eq('device_hash', hash)
  if (error) throw new Error('hint lookup failed')
  return (data ?? []).map((r) => r.cell as number)
}

export async function guessesOf(db: SupabaseClient, code: string): Promise<GuessRow[]> {
  const { data, error } = await db
    .from('guesses')
    .select('id, device_hash, player_name, answers, hints, points2, created_at')
    .eq('game_code', code)
    .order('points2', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw new Error('guess lookup failed')
  return (data ?? []) as GuessRow[]
}

/** Dosyanın baytları → base64 (bulanık ipucu, ≤ 5 KB). */
export async function downloadBase64(db: SupabaseClient, path: string): Promise<string> {
  const { data, error } = await db.storage.from(PHOTO_BUCKET).download(path)
  if (error || !data) throw new Error('download failed')
  const bytes = new Uint8Array(await data.arrayBuffer())
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/**
 * Hücre başına net fotoğrafın imzalı adresi (10 dakika). Yalnızca tahmin
 * gönderildikten sonra çağrılır.
 */
export async function signedPhotoUrls(
  db: SupabaseClient,
  cells: readonly StoredCell[],
  photos: readonly PhotoRow[],
): Promise<(string | null)[]> {
  const pathById = new Map(photos.map((p) => [p.id, p.storage_path]))
  const paths = cells.map((c) => (c.photo_id ? (pathById.get(c.photo_id) ?? null) : null))
  const wanted = paths.filter((p): p is string => p !== null)
  if (wanted.length === 0) return paths.map(() => null)
  const { data, error } = await db.storage.from(PHOTO_BUCKET).createSignedUrls(wanted, SIGNED_URL_SECONDS)
  if (error || !data) throw new Error('sign failed')
  const urlByPath = new Map(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
  return paths.map((p) => (p ? (urlByPath.get(p) ?? null) : null))
}

export interface PlayedResult {
  title: string
  gridSize: number
  regions: LiveGame['regions']
  playerName: string
  score: Score
  /** Hücre başına: maddeler, gerçek isim (boş hücrede ''), net foto adresi. */
  cells: { name: string; bullets: string[]; photo: string | null }[]
  ranking: RankingEntry[]
  expiresAt: string
}

/** Tahmin gönderilmiş bir cihaz için sonuç: puan, açılmış hücreler, sıralama. */
export async function playedResult(
  db: SupabaseClient,
  game: LiveGame,
  guess: GuessRow,
  myHash: string,
): Promise<PlayedResult> {
  const [photos, all] = await Promise.all([photosOf(db, game.code), guessesOf(db, game.code)])
  const urls = await signedPhotoUrls(db, game.cells, photos)
  return {
    title: game.title,
    gridSize: game.grid_size,
    regions: game.regions,
    playerName: guess.player_name,
    score: scoreGuess(game.cells, guess.answers, new Set(guess.hints)),
    cells: game.cells.map((c, i) => ({
      name: c.name.trim(),
      bullets: c.bullets.filter((b) => b.trim() !== ''),
      photo: urls[i] ?? null,
    })),
    ranking: ranking(all, myHash),
    expiresAt: game.expires_at,
  }
}

export async function guessOf(db: SupabaseClient, code: string, hash: string): Promise<GuessRow | null> {
  const { data, error } = await db
    .from('guesses')
    .select('id, device_hash, player_name, answers, hints, points2, created_at')
    .eq('game_code', code)
    .eq('device_hash', hash)
    .maybeSingle()
  if (error) throw new Error('guess lookup failed')
  return (data as GuessRow | null) ?? null
}
