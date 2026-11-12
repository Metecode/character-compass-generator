import { describe, expect, it } from 'vitest'
import { BULLETS_MAX, DEFAULT_BAND_COLORS, DEFAULT_QUADRANT_COLORS, NAME_MAX } from '../../constants'
import { sanitizeCompass } from '../sanitize'

describe('sanitizeCompass', () => {
  it('eksik hücreleri tamamlar, fazlasını atar', () => {
    expect(sanitizeCompass({ gridSize: 4, cells: [{ id: 'a', name: 'A', bullets: [] }] }).cells).toHaveLength(16)
    expect(sanitizeCompass({ gridSize: 4, cells: Array(30).fill(null) }).cells).toHaveLength(16)
    expect(sanitizeCompass({ gridSize: 2, cells: Array(9).fill(null) }).cells).toHaveLength(4)
  })

  it('limitleri yeniden uygular', () => {
    const c = sanitizeCompass({
      cells: [{ id: 'a', name: 'x'.repeat(99), bullets: Array(9).fill('b') }],
    })
    expect(c.cells[0]!.name).toHaveLength(NAME_MAX)
    expect(c.cells[0]!.bullets).toHaveLength(BULLETS_MAX)
  })

  it('tekrarlanan id’leri yeniler', () => {
    const c = sanitizeCompass({ cells: [{ id: 'same' }, { id: 'same' }] })
    expect(c.cells[0]!.id).toBe('same')
    expect(c.cells[1]!.id).not.toBe('same')
  })

  it('geçersiz rengi varsayılana çeker, boş etiketi atar', () => {
    const c = sanitizeCompass({ quadrants: [{ color: 'red', label: '  ' }, { color: '#123456', label: 'L' }] })
    expect(c.quadrants[0]).toEqual({ color: DEFAULT_QUADRANT_COLORS[0] })
    expect(c.quadrants[1]).toEqual({ color: '#123456', label: 'L' })
  })

  it('obje olmayan girdi varsayılan pusula döner', () => {
    expect(sanitizeCompass(null).cells).toHaveLength(9)
    expect(sanitizeCompass('x').title).toBe('Character Compass')
  })

  it('geçersiz boyut varsayılana (3x3) döner, yeni alanlar doldurulur', () => {
    const c = sanitizeCompass({ gridSize: 5, uppercaseNames: 'evet', bands: [{ color: 'x', label: 'Üst' }] })
    expect(c.gridSize).toBe(3)
    expect(c.cells).toHaveLength(9)
    expect(c.uppercaseNames).toBe(false)
    expect(c.themeId).toBe('genel')
    expect(c.bands[0]).toEqual({ color: DEFAULT_BAND_COLORS[0], label: 'Üst' })
  })
})
