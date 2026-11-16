import { describe, expect, it } from 'vitest'
import { COLUMN_GAP, boardEdge } from '../revealLayout'

describe('boardEdge', () => {
  it('yükseklik kısaysa kenar kalan yükseklik', () => {
    // 1200 genişlik: sağ sütun (1200 - 24) * 7/12 = 686
    expect(boardEdge(1200, 560)).toBe(560)
  })

  it('genişlik kısaysa kenar sağ sütun genişliği', () => {
    expect(boardEdge(1200, 900)).toBe(686)
  })

  it('aşağı yuvarlar, ölçü yoksa 0', () => {
    expect(boardEdge(1000, 2000, COLUMN_GAP)).toBe(569)
    expect(boardEdge(0, 500)).toBe(0)
    expect(boardEdge(800, 0)).toBe(0)
  })
})
