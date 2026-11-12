import { describe, expect, it } from 'vitest'
import { validateGame } from '../../../supabase/functions/_shared/validate.ts'
import { createDefaultCompass } from '../grid'
import {
  buildGamePayload,
  countPlayableCells,
  dropMissingPhotos,
  gameBlockReason,
} from '../gamePayload'
import type { Compass } from '../../types'

function compassWith(filled: number, size: 2 | 3 | 4 = 3): Compass {
  const c = createDefaultCompass(size)
  c.title = 'Halı saha'
  c.cells = c.cells.map((cell, i) =>
    i < filled ? { ...cell, name: `Kişi ${i}`, bullets: ['Topu bırakmaz', ''], photoId: i % 2 ? `p${i}` : undefined } : cell,
  )
  return c
}

describe('oyun linki ön koşulu', () => {
  it('isim + en az bir madde olan hücreleri sayar', () => {
    const c = compassWith(3)
    c.cells[5] = { ...c.cells[5]!, name: 'Sadece isim', bullets: [] }
    c.cells[6] = { ...c.cells[6]!, name: '', bullets: ['isimsiz madde'] }
    expect(countPlayableCells(c.cells)).toBe(3)
  })

  it('4 hücreden azsa nedenini söyler', () => {
    expect(gameBlockReason(compassWith(3).cells)).toMatch(/en az 4 hücrede.*şu an 3/)
    expect(gameBlockReason(compassWith(4).cells)).toBeNull()
  })
})

describe('buildGamePayload', () => {
  it('fotoları sırayla photo_N alanlarına eşler ve boş maddeleri atar', () => {
    const { payload, photoIds } = buildGamePayload(compassWith(4), 24)
    expect(photoIds).toEqual(['p1', 'p3'])
    expect(payload.cells.map((c) => c.photo)).toEqual([null, 0, null, 1, null, null, null, null, null])
    expect(payload.cells[0]!.bullets).toEqual(['Topu bırakmaz'])
    expect(payload.regions).toHaveLength(3)
    expect(payload.duration).toBe(24)
  })

  it('sunucu doğrulamasından geçer (2x2, 3x3, 4x4)', () => {
    for (const size of [2, 3, 4] as const) {
      const { payload } = buildGamePayload(compassWith(4, size), 72)
      // Foto baytları burada test edilmez (jpeg.test.ts); yalnızca JSON kısmı.
      const r = validateGame({ ...payload, cells: payload.cells.map((c) => ({ ...c, photo: null })) }, [])
      expect(r.ok, `size ${size}`).toBe(true)
    }
  })

  it('kontrol karakterlerini temizler', () => {
    const c = compassWith(4)
    c.cells[0] = { ...c.cells[0]!, name: 'A\tB', bullets: ['x\u0007y'] }
    const { payload } = buildGamePayload(c, 1)
    expect(payload.cells[0]).toMatchObject({ name: 'A B', bullets: ['x y'] })
  })
})

describe('dropMissingPhotos', () => {
  it('cihazda olmayan fotoyu atar ve indeksleri yeniden sıralar', () => {
    const built = buildGamePayload(compassWith(4), 24)
    const { payload, photoIds } = dropMissingPhotos(built.payload, built.photoIds, new Set(['p3']))
    expect(photoIds).toEqual(['p3'])
    expect(payload.cells[1]!.photo).toBeNull()
    expect(payload.cells[3]!.photo).toBe(0)
  })
})
