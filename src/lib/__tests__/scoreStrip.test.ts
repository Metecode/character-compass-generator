import { describe, expect, it } from 'vitest'
import { stripScrollLeft } from '../scoreStrip'

const box = { scrollLeft: 0, width: 300, scrollWidth: 1000 }

describe('stripScrollLeft', () => {
  it('çip zaten görünüyorsa kaydırmaz', () => {
    expect(stripScrollLeft({ left: 40, width: 100 }, box)).toBe(0)
  })

  it('sağda kalan çipi ortalar', () => {
    expect(stripScrollLeft({ left: 600, width: 100 }, box)).toBe(500)
  })

  it('kenarlara kırpar', () => {
    expect(stripScrollLeft({ left: 950, width: 50 }, box)).toBe(700)
    expect(stripScrollLeft({ left: 0, width: 100 }, { ...box, scrollLeft: 400 })).toBe(0)
  })

  it('yarım görünen çip de görünür alana alınır', () => {
    expect(stripScrollLeft({ left: 260, width: 100 }, box)).toBe(160)
  })
})
