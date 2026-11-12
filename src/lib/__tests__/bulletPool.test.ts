import { describe, expect, it } from 'vitest'
import { BULLET_MAX } from '../../constants'
import { THEMES } from '../../data/themes'
import { bulletKey, pickBullets, rollBullet, suggestBullets, usedBulletKeys } from '../bulletPool'
import { textLength } from '../limits'
import type { Cell } from '../../types'

const cell = (bullets: string[], id = Math.random().toString()): Cell => ({ id, name: '', bullets })

/** Tekrarlanabilir rastgelelik (mulberry32). */
function seeded(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('bulletKey (Türkçe karşılaştırma)', () => {
  it('İ ve i aynı sayılır', () => {
    expect(bulletKey('İzindeyken bile cevap yazar')).toBe(bulletKey('izindeyken bile cevap yazar'))
  })

  it('I ve ı aynı sayılır, I ile i karışmaz', () => {
    expect(bulletKey('IŞIK GİBİ')).toBe('ışık gibi')
    expect(bulletKey('Işık')).not.toBe(bulletKey('işik'))
  })

  it('boşluk farklarını yok sayar', () => {
    expect(bulletKey('  Her  yere erken   gelir ')).toBe('her yere erken gelir')
  })
})

describe('pickBullets', () => {
  const pool = ['Kaos ajanı', 'İlk o gelir', 'Işıkları o kapatır', 'Gece kuşu']

  it('pusulada kullanılanı vermez (İ/ı içeren maddeler dahil)', () => {
    const used = usedBulletKeys([cell(['ilk o gelir', 'IŞIKLARI O KAPATIR', 'kaos ajanı'])])
    for (let s = 0; s < 50; s++) {
      expect(pickBullets(pool, used, 1, { random: seeded(s) })).toEqual(['Gece kuşu'])
    }
  })

  it('istenen sayıda, birbirinden farklı madde verir', () => {
    const r = pickBullets(pool, new Set(), 3, { random: seeded(1) })
    expect(r).toHaveLength(3)
    expect(new Set(r).size).toBe(3)
  })

  it('havuz bitince boş, azalınca kalan kadar döner', () => {
    const all = usedBulletKeys([cell(pool)])
    expect(pickBullets(pool, all, 1)).toEqual([])
    const almost = usedBulletKeys([cell(pool.slice(0, 3))])
    expect(pickBullets(pool, almost, 3)).toEqual(['Gece kuşu'])
  })

  it('avoid listesindekini vermez', () => {
    for (let s = 0; s < 50; s++) {
      const r = pickBullets(pool, new Set(), 3, { avoid: ['kaos AJANI'], random: seeded(s) })
      expect(r).not.toContain('Kaos ajanı')
    }
  })
})

describe('zar (rollBullet)', () => {
  it('tekrar basınca az önceki madde hemen geri gelmez', () => {
    const pool = ['A maddesi', 'B maddesi', 'C maddesi']
    const random = seeded(7)
    const field = cell([''], 'x')
    let last: string | undefined
    for (let i = 0; i < 200; i++) {
      const next = rollBullet(pool, [field], last, random)
      expect(next).not.toBeNull()
      expect(next).not.toBe(last)
      field.bullets[0] = next!
      last = next!
    }
  })

  it('alan elle değiştirilse bile son zar sonucu hemen gelmez', () => {
    const pool = ['A maddesi', 'B maddesi']
    // Kullanıcı zarın getirdiği "A"yı silip kendi metnini yazdı: A artık kullanılmıyor.
    const r = rollBullet(pool, [cell(['kendi yazdığım'])], 'A maddesi', seeded(3))
    expect(r).toBe('B maddesi')
  })

  it('başka hücrelerde kullanılanı vermez, havuz bitince null', () => {
    const pool = ['A maddesi', 'B maddesi']
    expect(rollBullet(pool, [cell(['a maddesi']), cell([''])])).toBe('B maddesi')
    expect(rollBullet(pool, [cell(['A maddesi', 'B maddesi'])])).toBeNull()
  })
})

describe('3 madde öner', () => {
  it('3 farklı ve kullanılmamış madde önerir', () => {
    const genel = THEMES[0]!.pool
    const cells = [cell([genel[0]!, genel[1]!]), cell([])]
    const r = suggestBullets(genel, cells, seeded(11))
    expect(r).toHaveLength(3)
    expect(new Set(r.map(bulletKey)).size).toBe(3)
    expect(r).not.toContain(genel[0])
    expect(r).not.toContain(genel[1])
  })
})

describe('havuz verisi', () => {
  it.each(THEMES.map((t) => [t.name, t] as const))('%s: limit, sayı, tekrar ve büyük harf', (_, t) => {
    expect(t.pool.length).toBeGreaterThanOrEqual(t.id === 'genel' ? 100 : 50)
    const keys = t.pool.map(bulletKey)
    expect(new Set(keys).size).toBe(keys.length)
    for (const item of t.pool) {
      expect(textLength(item), item).toBeLessThanOrEqual(BULLET_MAX)
      expect(item.trim(), item).toBe(item)
      const first = item.match(/\p{L}/u)?.[0]
      // Rakamla başlayanlar ("5 kitap...") hariç ilk harf büyük olmalı (Türkçe kurala göre).
      if (first && !/^\P{L}*\d/u.test(item)) {
        expect(first, item).toBe(first.toLocaleUpperCase('tr'))
      }
    }
  })
})
