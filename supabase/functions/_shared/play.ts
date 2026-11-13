/**
 * Tahmin oyununun saf mantığı: oyuncuya gidecek veri, cevap doğrulaması,
 * puanlama, sıralama ve kurucu istatistiği. Deno'ya ya da ağa bağımlı değil;
 * vitest ile doğrudan test edilir.
 *
 * Kopya önleme: oyuncuya giden veride isim–hücre eşleşmesi, foto kimliği ve dosya
 * yolu yoktur. İsim listesi hücre sırasından bağımsız olarak karıştırılır.
 */

import { GUESSES_MAX, PLAYER_NAME_MAX } from './limits.ts'
import { sha256Hex } from './tokens.ts'

/** games.cells içindeki bir hücre (sunucuda saklanan biçim). */
export interface StoredCell {
  name: string
  bullets: string[]
  photo_id: string | null
}

export interface StoredRegion {
  color: string
  label?: string
}

export interface StoredGame {
  title: string
  grid_size: number
  regions: StoredRegion[]
  cells: StoredCell[]
}

/** Oyuncuya giden hücre: yalnızca maddeler ve ipucu olup olmadığı. */
export interface PublicCell {
  bullets: string[]
  /** Tahmin edilecek hücre mi (isim + en az bir madde). */
  playable: boolean
  /** Bu hücre için bulanık ipucu var mı. */
  hint: boolean
}

export interface PublicGame {
  title: string
  gridSize: number
  regions: StoredRegion[]
  cells: PublicCell[]
  /** Oynanabilir hücrelerin isimleri, karıştırılmış. Aynı isim birden çok kez geçebilir. */
  names: string[]
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

// ---------------------------------------------------------------------------
// İsim karşılaştırması
// ---------------------------------------------------------------------------

/**
 * İsim karşılaştırma anahtarı: baş/son boşluk ve büyük/küçük harf farkı yok
 * sayılır, Türkçe kurallarla ("I" → "ı", "İ" → "i"). Aynı adı taşıyan iki kişi
 * bu yüzden birbirinin yerine sayılır.
 */
export const nameKey = (s: string): string => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr')

/** Tahmin oyununda oynanabilir hücre: ismi ve en az bir maddesi var. */
export const isPlayable = (c: Pick<StoredCell, 'name' | 'bullets'>): boolean =>
  c.name.trim() !== '' && c.bullets.some((b) => b.trim() !== '')

// ---------------------------------------------------------------------------
// Cihaz ve oyuncu adı
// ---------------------------------------------------------------------------

/** Tarayıcının ürettiği cihaz kimliği (base64url, en az 128 bit). */
export const DEVICE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/

export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && DEVICE_PATTERN.test(v)

/** Saklanan özet: SHA-256(kod | cihaz). Cihaz kimliğinin kendisi saklanmaz. */
export const deviceHash = (code: string, device: string): Promise<string> => sha256Hex(`${code}|${device}`)

// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** Baştaki/sondaki boşluk atılır; boş ya da yalnızca boşluktan oluşan ad kabul edilmez. */
export function cleanPlayerName(v: unknown): Result<string> {
  if (typeof v !== 'string' || CONTROL_CHARS.test(v)) return { ok: false, error: 'invalid_name' }
  const name = v.trim().replace(/\s+/g, ' ')
  if (name === '' || Array.from(name).length > PLAYER_NAME_MAX) return { ok: false, error: 'invalid_name' }
  return { ok: true, value: name }
}

// ---------------------------------------------------------------------------
// Oyuncuya giden veri
// ---------------------------------------------------------------------------

/** [0, n) aralığında tekdüze rastgele tamsayı (Web Crypto, modulo yanlılığı yok). */
export function cryptoInt(n: number): number {
  if (n <= 1) return 0
  const limit = Math.floor(0x1_0000_0000 / n) * n
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0]! < limit) return buf[0]! % n
  }
}

/** Fisher–Yates; `randomInt(n)` [0, n) döner. */
export function shuffled<T>(items: readonly T[], randomInt: (n: number) => number = cryptoInt): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * Oyuncuya giden oyun verisi. `hintCells`: bulanık dosyası olan hücre indeksleri.
 * İsim, foto kimliği ve yol hiçbir hücrede yer almaz.
 */
export function publicGame(
  game: StoredGame,
  hintCells: ReadonlySet<number>,
  randomInt: (n: number) => number = cryptoInt,
): PublicGame {
  const cells = game.cells.map((c, i): PublicCell => {
    const playable = isPlayable(c)
    return { bullets: c.bullets.filter((b) => b.trim() !== ''), playable, hint: playable && hintCells.has(i) }
  })
  const names = shuffled(
    game.cells.filter(isPlayable).map((c) => c.name.trim()),
    randomInt,
  )
  return { title: game.title, gridSize: game.grid_size, regions: game.regions, cells, names }
}

// ---------------------------------------------------------------------------
// Cevaplar ve puan
// ---------------------------------------------------------------------------

/**
 * Cevaplar: hücre başına bir isim (oynanmayan hücrede null). Her isim listede
 * olmalı ve listede geçtiğinden fazla kullanılmamalı (aynı adı taşıyan iki kişi
 * varsa o ad iki kez kullanılabilir). Tüm oynanabilir hücreler dolu olmalı.
 */
export function validateAnswers(raw: unknown, cells: readonly StoredCell[]): Result<(string | null)[]> {
  if (!Array.isArray(raw) || raw.length !== cells.length) return { ok: false, error: 'invalid_answers' }
  const available = new Map<string, number>()
  for (const c of cells) {
    if (!isPlayable(c)) continue
    const k = nameKey(c.name)
    available.set(k, (available.get(k) ?? 0) + 1)
  }
  const out: (string | null)[] = []
  for (let i = 0; i < cells.length; i++) {
    const a = raw[i]
    if (!isPlayable(cells[i]!)) {
      if (a !== null && a !== undefined) return { ok: false, error: 'invalid_answers' }
      out.push(null)
      continue
    }
    if (typeof a !== 'string') return { ok: false, error: 'invalid_answers' }
    const k = nameKey(a)
    const left = available.get(k) ?? 0
    if (left <= 0) return { ok: false, error: 'invalid_answers' }
    available.set(k, left - 1)
    out.push(a.trim())
  }
  return { ok: true, value: out }
}

/** Geçerli ipucu hücreleri: oynanabilir ve aralıkta; tekrarsız, sıralı. */
export function cleanHints(hints: Iterable<number>, cells: readonly StoredCell[]): number[] {
  const set = new Set<number>()
  for (const h of hints) if (Number.isInteger(h) && h >= 0 && h < cells.length && isPlayable(cells[h]!)) set.add(h)
  return [...set].sort((a, b) => a - b)
}

export interface CellResult {
  /** Gerçek isim (tahmin gönderildikten sonra açılır). */
  name: string
  guess: string | null
  correct: boolean
  hinted: boolean
}

export interface Score {
  /** Puanın iki katı: doğru = 2, ipuçlu doğru = 1. */
  points2: number
  /** Oynanabilir hücre sayısı (en yüksek puan). */
  total: number
  /** Hücre başına sonuç; oynanmayan hücrede null. */
  cells: (CellResult | null)[]
}

/** Puanı sunucu hesaplar. Doğru: 1 puan, ipucu açılmış doğru: yarım puan. */
export function scoreGuess(
  cells: readonly StoredCell[],
  answers: readonly (string | null)[],
  hints: ReadonlySet<number>,
): Score {
  let points2 = 0
  let total = 0
  const out = cells.map((c, i): CellResult | null => {
    if (!isPlayable(c)) return null
    total++
    const guess = answers[i] ?? null
    const correct = guess !== null && nameKey(guess) === nameKey(c.name)
    const hinted = hints.has(i)
    if (correct) points2 += hinted ? 1 : 2
    return { name: c.name.trim(), guess, correct, hinted }
  })
  return { points2, total, cells: out }
}

// ---------------------------------------------------------------------------
// Sıralama ve kurucu istatistiği
// ---------------------------------------------------------------------------

export interface GuessRow {
  id: string
  device_hash: string
  player_name: string
  answers: (string | null)[]
  hints: number[]
  points2: number
  created_at: string
}

export interface RankingEntry {
  rank: number
  name: string
  points2: number
  /** Bu satır isteği yapan cihaza mı ait. */
  me: boolean
}

/** Puan azalan, eşitlikte önce gönderen. Eşit puanlılar aynı sırayı paylaşır. */
export function ranking(rows: readonly GuessRow[], myHash: string | null): RankingEntry[] {
  const sorted = [...rows].sort(
    (a, b) => b.points2 - a.points2 || Date.parse(a.created_at) - Date.parse(b.created_at),
  )
  let rank = 0
  let prev: number | null = null
  return sorted.map((r, i) => {
    if (r.points2 !== prev) {
      rank = i + 1
      prev = r.points2
    }
    return { rank, name: r.player_name, points2: r.points2, me: myHash !== null && r.device_hash === myHash }
  })
}

export interface GameStats {
  players: number
  /** Oynanabilir hücre başına: isim ve doğru bilen oyuncu sayısı. */
  people: { name: string; correct: number }[]
  /** En çok doğru bilinen kişi(ler); kimse oynamadıysa ya da kimse bilmediyse boş. */
  easiest: string[]
  /** En az bir oyuncu varken hiç doğru bilinmeyen kişiler. */
  nobody: string[]
}

export function gameStats(cells: readonly StoredCell[], guesses: readonly Pick<GuessRow, 'answers'>[]): GameStats {
  const people: { name: string; correct: number }[] = []
  cells.forEach((c, i) => {
    if (!isPlayable(c)) return
    const key = nameKey(c.name)
    let correct = 0
    for (const g of guesses) {
      const a = g.answers[i]
      if (typeof a === 'string' && nameKey(a) === key) correct++
    }
    people.push({ name: c.name.trim(), correct })
  })
  const players = guesses.length
  const max = Math.max(0, ...people.map((p) => p.correct))
  return {
    players,
    people,
    easiest: players > 0 && max > 0 ? people.filter((p) => p.correct === max).map((p) => p.name) : [],
    nobody: players > 0 ? people.filter((p) => p.correct === 0).map((p) => p.name) : [],
  }
}

/** submit_guess SQL fonksiyonunun sonucunu HTTP yanıtına çevirir. */
export function guessStatusResponse(status: unknown): { status: number; error?: string } {
  switch (status) {
    case 'ok':
      return { status: 201 }
    case 'duplicate':
      return { status: 409, error: 'already_played' }
    case 'full':
      return { status: 409, error: 'game_full' }
    case 'not_found':
      return { status: 404, error: 'not_found' }
    default:
      throw new Error('unexpected guess status')
  }
}

export { GUESSES_MAX }
