import { describe, expect, it } from 'vitest'
import {
  cellsOfQuadrant,
  cellsOfRegion,
  createDefaultCompass,
  isCellEmpty,
  quadrantOf,
  regionCount,
  regionOf,
} from '../grid'

describe('ızgara', () => {
  it('4x4 bölge eşlemesi: her bölge 2x2', () => {
    // satır satır bölge numaraları
    const expected = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3]
    expect(expected.map((_, i) => quadrantOf(i, 4))).toEqual(expected)
  })

  it('cellsOfQuadrant her bölge için 4 hücre döner', () => {
    expect(cellsOfQuadrant(0, 4)).toEqual([0, 1, 4, 5])
    expect(cellsOfQuadrant(1, 4)).toEqual([2, 3, 6, 7])
    expect(cellsOfQuadrant(2, 4)).toEqual([8, 9, 12, 13])
    expect(cellsOfQuadrant(3, 4)).toEqual([10, 11, 14, 15])
  })

  it('geçersiz indeks hata verir', () => {
    expect(() => quadrantOf(16, 4)).toThrow(RangeError)
    expect(() => quadrantOf(-1, 4)).toThrow(RangeError)
  })

  it('2x2: her bölge tek hücre', () => {
    expect([0, 1, 2, 3].map((i) => regionOf(i, 2))).toEqual([0, 1, 2, 3])
    expect(regionCount(2)).toBe(4)
  })

  it('3x3: bölgeler satır bantları', () => {
    expect(Array.from({ length: 9 }, (_, i) => regionOf(i, 3))).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2])
    expect(cellsOfRegion(1, 3)).toEqual([3, 4, 5])
    expect(regionCount(3)).toBe(3)
    expect(() => regionOf(9, 3)).toThrow(RangeError)
  })

  it('varsayılan pusula 3x3: 9 boş hücre, 3 bant, büyük harf kapalı', () => {
    const c = createDefaultCompass()
    expect(c.gridSize).toBe(3)
    expect(c.cells).toHaveLength(9)
    expect(c.bands).toHaveLength(3)
    expect(c.uppercaseNames).toBe(false)
  })

  it('4x4 pusula: 16 boş hücre, benzersiz id, 4 pastel bölge', () => {
    const c = createDefaultCompass(4)
    expect(c.cells).toHaveLength(16)
    expect(new Set(c.cells.map((x) => x.id)).size).toBe(16)
    expect(c.cells.every(isCellEmpty)).toBe(true)
    expect(c.quadrants).toHaveLength(4)
    expect(c.quadrants.every((q) => q.label === undefined)).toBe(true)
  })

  it('isCellEmpty boşluk karakterlerini boş sayar', () => {
    expect(isCellEmpty({ id: 'a', name: '  ', bullets: [' '] })).toBe(true)
    expect(isCellEmpty({ id: 'a', name: '', bullets: [], photoId: 'p' })).toBe(false)
  })
})
