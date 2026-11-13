/**
 * Tahmin oyunu ön yüzünün saf yardımcıları: puan yazımı, hata metinleri,
 * isim yerleştirme ve cihazdaki taslak. Ağa dokunmaz.
 */

import { DEVICE_STORAGE_KEY, PLAYER_NAME_MAX, RANKING_PREVIEW } from '../constants'

// ---------------------------------------------------------------------------
// Puan
// ---------------------------------------------------------------------------

/** Sayının sonuna gelen bulunma eki: 1'de, 3'te, 6'da, 10'da, 16'da … */
export function locative(n: number): string {
  const last = n % 10
  if (last === 0) {
    // on, yirmi, otuz, kırk, elli, altmış, yetmiş, seksen, doksan, yüz
    const tens = n % 100
    if (tens === 0) return "'de" // yüz → yüzde
    return ({ 10: "'da", 20: "'de", 30: "'da", 40: "'ta", 50: "'de", 60: "'ta", 70: "'te", 80: "'de", 90: "'da" } as Record<number, string>)[tens]!
  }
  return ({ 1: "'de", 2: "'de", 3: "'te", 4: "'te", 5: "'te", 6: "'da", 7: "'de", 8: "'de", 9: "'da" } as Record<number, string>)[last]!
}

/** points2 = puanın iki katı. 6 → "6", 13 → "6,5" */
export const formatPoints = (points2: number): string =>
  points2 % 2 === 0 ? String(points2 / 2) : `${Math.floor(points2 / 2)},5`

/** "9'da 6" / "9'da 6,5" */
export const scoreLabel = (points2: number, total: number): string =>
  `${total}${locative(total)} ${formatPoints(points2)}`

// ---------------------------------------------------------------------------
// Hata metinleri
// ---------------------------------------------------------------------------

export type PlayErrorKind = 'gone' | 'network' | 'message'

const MESSAGES: Record<string, string> = {
  rate_limited: 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.',
  game_full: 'Bu oyun doldu.',
  invalid_name: `Ad 1-${PLAYER_NAME_MAX} karakter olmalı.`,
  invalid_answers: 'Cevaplar eksik ya da geçersiz. Sayfayı yenileyip tekrar dene.',
  not_configured: 'Oyun şu an açılamıyor.',
  no_hint: 'Bu hücre için ipucu yok.',
}

export function classifyPlayError(code: string | undefined): { kind: PlayErrorKind; message: string } {
  if (code === 'not_found') return { kind: 'gone', message: 'Bu oyun artık yok.' }
  if (code === 'network') {
    return { kind: 'network', message: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.' }
  }
  return { kind: 'message', message: (code && MESSAGES[code]) || 'Bir şeyler ters gitti. Tekrar dener misin?' }
}

// ---------------------------------------------------------------------------
// Oyuncu adı
// ---------------------------------------------------------------------------

/** Baştaki/sondaki boşluk atılır; boş ya da yalnızca boşluk ise null. */
export function cleanPlayerName(v: string): string | null {
  const name = v.trim().replace(/\s+/g, ' ')
  if (!name || Array.from(name).length > PLAYER_NAME_MAX) return null
  return name
}

// ---------------------------------------------------------------------------
// Yerleştirme: hücre → isim listesindeki giriş
// ---------------------------------------------------------------------------

// İsim karşılaştırması. Sunucudaki nameKey ile aynı (Türkçe yerel ayar).
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr')

/** Hücre başına isim listesindeki girişin indeksi (aynı isim iki kez geçebilir). */
export type Placement = (number | null)[]

/** `entry` girişini `cell`e koyar; giriş başka hücredeyse oradan taşınır. */
export function place(p: Placement, cell: number, entry: number): Placement {
  const next = p.map((e) => (e === entry ? null : e))
  next[cell] = entry
  return next
}

/**
 * Seçilen giriş başka hücredeyse ve aynı adı taşıyan boşta bir giriş varsa
 * onu kullan: aynı adlı iki kişi birbirinin yerine geçer, taşımaya gerek yok.
 */
export function preferFreeEntry(p: Placement, names: readonly string[], cell: number, entry: number): number {
  const at = p.indexOf(entry)
  if (at < 0 || at === cell) return entry
  const key = nameKey(names[entry] ?? '')
  const free = names.findIndex((n, j) => j !== entry && nameKey(n) === key && !p.includes(j))
  return free >= 0 ? free : entry
}

export const unplace = (p: Placement, cell: number): Placement => p.map((e, i) => (i === cell ? null : e))

export const placedCount = (p: Placement, playable: readonly boolean[]): number =>
  p.filter((e, i) => e !== null && playable[i]).length

/** Sunucuya giden cevaplar: oynanabilir hücrede isim, diğerlerinde null. */
export const answersOf = (p: Placement, names: readonly string[], playable: readonly boolean[]) =>
  p.map((e, i) => (playable[i] && e !== null ? (names[e] ?? null) : null))

/** Yerleştirilmemiş ilk oynanabilir hücre (`from`dan sonra, başa sarar). */
export function nextOpenCell(p: Placement, playable: readonly boolean[], from: number): number | null {
  const n = playable.length
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n
    if (playable[i] && p[i] === null) return i
  }
  return null
}


/**
 * Taslaktaki isimleri (hücre başına) yeni karışık listeye eşler. Liste her
 * açılışta farklı sıralandığı için girişler isimle bulunur.
 */
export function restorePlacement(saved: readonly (string | null)[], names: readonly string[], cells: number): Placement {
  const used = new Set<number>()
  const out: Placement = Array.from({ length: cells }, () => null)
  saved.slice(0, cells).forEach((name, i) => {
    if (name === null) return
    const k = nameKey(name)
    const entry = names.findIndex((n, j) => !used.has(j) && nameKey(n) === k)
    if (entry >= 0) {
      used.add(entry)
      out[i] = entry
    }
  })
  return out
}

// ---------------------------------------------------------------------------
// Cihazdaki taslak ve cihaz kimliği
// ---------------------------------------------------------------------------

export interface Draft {
  name: string
  cells: (string | null)[]
}

const draftKey = (code: string) => `compass-play:${code}`

export function loadDraft(code: string): Draft | null {
  try {
    const raw = JSON.parse(localStorage.getItem(draftKey(code)) ?? 'null') as Partial<Draft> | null
    if (!raw || typeof raw.name !== 'string' || !Array.isArray(raw.cells)) return null
    return { name: raw.name, cells: raw.cells.map((c) => (typeof c === 'string' ? c : null)) }
  } catch {
    return null
  }
}

export function saveDraft(code: string, draft: Draft): void {
  try {
    localStorage.setItem(draftKey(code), JSON.stringify(draft))
  } catch {
    // Gizli sekme vb.: taslak tutulmaz, oyun yine oynanır.
  }
}

export function clearDraft(code: string): void {
  try {
    localStorage.removeItem(draftKey(code))
  } catch {
    // yok say
  }
}

let memoryDevice: string | null = null

const randomDevice = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Bu cihazın rastgele kimliği (128 bit). localStorage'da durur; sunucuya
 * gider ama orada yalnızca oyuna bağlı özeti saklanır. Depolama yoksa sayfa
 * açık kaldığı sürece bellekte tutulur.
 */
export function deviceId(): string {
  try {
    const saved = localStorage.getItem(DEVICE_STORAGE_KEY)
    if (saved && /^[A-Za-z0-9_-]{22,64}$/.test(saved)) return saved
    const id = randomDevice()
    localStorage.setItem(DEVICE_STORAGE_KEY, id)
    return id
  } catch {
    memoryDevice ??= randomDevice()
    return memoryDevice
  }
}

// ---------------------------------------------------------------------------
// Sıralama görünümü
// ---------------------------------------------------------------------------

export interface RankingRow {
  rank: number
  name: string
  points2: number
  me?: boolean
}

/** Görünen satırlar: ilk `limit` satır + (dışında kalıyorsa) bu cihazın satırı. */
export function visibleRows<T extends RankingRow>(rows: readonly T[], expanded: boolean, limit = RANKING_PREVIEW): T[] {
  if (expanded || rows.length <= limit) return [...rows]
  const head = rows.slice(0, limit)
  const mine = rows.slice(limit).find((r) => r.me)
  return mine ? [...head, mine] : head
}
