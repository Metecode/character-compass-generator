import { beforeEach, describe, expect, it } from 'vitest'
import { GRID_SIZES, LABEL_MAX } from '../../constants'
import { createDefaultCompass } from '../../lib/grid'
import { textLength } from '../../lib/limits'
import { useCompassStore } from '../../store/compassStore'
import { getTheme, THEMES } from '../themes'

const st = () => useCompassStore.getState()
const HEX = /^#[0-9a-f]{6}$/i

describe('tema verisi', () => {
  it('istenen altı tema var, id’ler benzersiz', () => {
    expect(THEMES.map((t) => t.name)).toEqual(['Genel', 'Halı Saha', 'Tatil', 'Ofis', 'Sınıf', 'Aile'])
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  it.each(THEMES.map((t) => [t.name, t] as const))('%s: geçerli renk, etiket ve boyut', (_, t) => {
    expect(GRID_SIZES).toContain(t.suggestedSize)
    expect(t.quadrants).toHaveLength(4)
    expect(t.bands).toHaveLength(3)
    for (const r of [...t.quadrants, ...t.bands]) {
      expect(r.color).toMatch(HEX)
      if (r.label !== undefined) expect(textLength(r.label)).toBeLessThanOrEqual(LABEL_MAX)
    }
  })

  it('bilinmeyen id Genel’e düşer', () => {
    expect(getTheme('silinmis').id).toBe('genel')
  })
})

describe('applyTheme', () => {
  beforeEach(() => {
    useCompassStore.setState({ compass: createDefaultCompass(3), past: [], future: [], selectedId: null })
    const id = st().compass.cells[0]!.id
    st().updateCell(id, { name: 'Ahmet', bullets: ['geç kalır'], photoId: 'p1' })
  })

  it('renk, etiket ve temayı değiştirir; hücrelere ve boyuta dokunmaz', () => {
    const { cells, gridSize, title, uppercaseNames } = st().compass
    const ofis = getTheme('ofis')
    st().applyTheme(ofis)
    const c = st().compass
    expect(c.themeId).toBe('ofis')
    expect(c.quadrants).toEqual(ofis.quadrants)
    expect(c.bands).toEqual(ofis.bands)
    expect(c.cells).toBe(cells)
    expect(c.gridSize).toBe(gridSize)
    expect(c.title).toBe(title)
    expect(c.uppercaseNames).toBe(uppercaseNames)
  })

  it('geri alınabilir', () => {
    const before = st().compass
    st().applyTheme(getTheme('aile'))
    st().undo()
    expect(st().compass).toBe(before)
    st().redo()
    expect(st().compass.themeId).toBe('aile')
  })

  it('tema verisini kopyalar; sonradan bölge düzenlemek temayı bozmaz', () => {
    const tatil = getTheme('tatil')
    const original = JSON.stringify(tatil.bands)
    st().applyTheme(tatil)
    st().setRegion(0, { label: 'Değişti', color: '#000000' })
    expect(JSON.stringify(tatil.bands)).toBe(original)
  })
})
