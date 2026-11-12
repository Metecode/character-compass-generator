import { BULLETS_MAX } from '../constants'
import type { Cell } from '../types'

/**
 * Maddeleri karşılaştırma anahtarı: baş/son boşluk ve büyük/küçük harf farkı
 * yok sayılır. Türkçe kurallar: "I" → "ı", "İ" → "i".
 */
export const bulletKey = (s: string): string =>
  s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr')

/** Pusulada şu an kullanılan tüm maddelerin anahtarları. */
export function usedBulletKeys(cells: readonly Cell[]): Set<string> {
  const used = new Set<string>()
  for (const c of cells) for (const b of c.bullets) if (b.trim()) used.add(bulletKey(b))
  return used
}

interface PickOptions {
  /** Kullanılmış sayılmasa da bu sefer gelmemesi gerekenler (ör. az önce zarın getirdiği). */
  avoid?: readonly string[]
  /** [0, 1) aralığında sayı üretir; testlerde sabitlenir. */
  random?: () => number
}

/** Havuzdan, kullanılmamış ve birbirinden farklı en fazla `count` madde seçer. */
export function pickBullets(
  pool: readonly string[],
  used: ReadonlySet<string>,
  count: number,
  { avoid = [], random = Math.random }: PickOptions = {},
): string[] {
  const blocked = new Set([...used, ...avoid.map(bulletKey)])
  const seen = new Set<string>()
  const candidates: string[] = []
  for (const item of pool) {
    const key = bulletKey(item)
    if (!key || blocked.has(key) || seen.has(key)) continue
    seen.add(key)
    candidates.push(item)
  }
  // Kısmi Fisher–Yates: ilk `count` eleman rastgele.
  const n = Math.min(count, candidates.length)
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (candidates.length - i))
    ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
  }
  return candidates.slice(0, n)
}

/**
 * Zar: bir madde alanı için yeni madde. Alanın mevcut değeri pusulada kullanıldığı
 * için zaten gelmez; `lastRolled` ise alan sonradan değiştirilmiş olsa bile az önce
 * zarın getirdiği maddenin hemen geri gelmesini engeller. Havuz bittiyse null.
 */
export function rollBullet(
  pool: readonly string[],
  cells: readonly Cell[],
  lastRolled?: string,
  random?: () => number,
): string | null {
  const avoid = lastRolled ? [lastRolled] : []
  return pickBullets(pool, usedBulletKeys(cells), 1, { avoid, random })[0] ?? null
}

/** "3 madde öner": maddesi olmayan hücre için en fazla BULLETS_MAX öneri. */
export const suggestBullets = (
  pool: readonly string[],
  cells: readonly Cell[],
  random?: () => number,
): string[] => pickBullets(pool, usedBulletKeys(cells), BULLETS_MAX, { random })
