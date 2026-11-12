import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultCompass, reflowCells } from '../../lib/grid'
import type { Cell } from '../../types'
import { useCompassStore } from '../compassStore'

const st = () => useCompassStore.getState()
const names = () => st().compass.cells.map((c) => c.name)
const card = (name: string): Cell => ({ id: `id-${name}`, name, bullets: [] })
const empty = (i: number): Cell => ({ id: `e${i}`, name: '', bullets: [] })

describe('reflowCells', () => {
  it('dolu kartları okuma sırasıyla başa dizer, boşlukları atlar', () => {
    const cells = [empty(0), card('A'), empty(1), card('B'), empty(2), card('C'), empty(3), empty(4), empty(5)]
    const r = reflowCells(cells, 2)
    expect(r.cells.map((c) => c.name)).toEqual(['A', 'B', 'C', ''])
    expect(r.dropped).toEqual([])
    expect(r.cells[0]!.id).toBe('id-A') // id kartla birlikte taşınır
  })

  it('sığmayan dolu kartları sondan düşürür', () => {
    const cells = ['A', 'B', 'C', 'D', 'E', 'F'].map(card)
    const r = reflowCells(cells, 2)
    expect(r.cells.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D'])
    expect(r.dropped.map((c) => c.name)).toEqual(['E', 'F'])
  })

  it('büyütürken boş hücrelerle tamamlar, id’ler benzersiz kalır', () => {
    const r = reflowCells([card('A'), empty(0), empty(1), card('B')], 4)
    expect(r.cells).toHaveLength(16)
    expect(r.cells.slice(0, 2).map((c) => c.name)).toEqual(['A', 'B'])
    expect(new Set(r.cells.map((c) => c.id)).size).toBe(16)
  })

  it('yalnızca fotoğrafı ya da maddesi olan kart da dolu sayılır', () => {
    const photo: Cell = { id: 'p', name: '', bullets: [], photoId: 'f1' }
    const bullet: Cell = { id: 'b', name: '', bullets: ['x'] }
    const r = reflowCells([empty(0), photo, empty(1), bullet], 2)
    expect(r.cells.slice(0, 2).map((c) => c.id)).toEqual(['p', 'b'])
  })
})

describe('setGridSize', () => {
  beforeEach(() => {
    useCompassStore.setState({ compass: createDefaultCompass(3), past: [], future: [], selectedId: null })
  })

  const fill = (...ns: string[]) =>
    ns.forEach((n, i) => st().updateCell(st().compass.cells[i]!.id, { name: n }))

  it('yeni pusula 3x3 başlar', () => {
    st().reset()
    expect(st().compass.gridSize).toBe(3)
    expect(st().compass.cells).toHaveLength(9)
  })

  it('kartları taşır, taşanı düşürür ve geri alınabilir', () => {
    fill('A', 'B', 'C', 'D', 'E', 'F')
    const before = st().compass
    st().setGridSize(2)
    expect(st().compass.gridSize).toBe(2)
    expect(names()).toEqual(['A', 'B', 'C', 'D'])
    st().undo()
    expect(st().compass).toBe(before)
    st().redo()
    expect(names()).toEqual(['A', 'B', 'C', 'D'])
  })

  it('aynı boyut no-op, geçmişe yazmaz', () => {
    const before = st().compass
    const past = st().past.length
    st().setGridSize(3)
    expect(st().compass).toBe(before)
    expect(st().past).toHaveLength(past)
  })

  it('bölge ve bant ayarları boyut değişiminde korunur', () => {
    st().setRegion(0, { label: 'Üst' }) // 3x3: bant
    st().setGridSize(4)
    st().setRegion(0, { label: 'Kaotik' }) // 4x4: çeyrek
    st().setGridSize(3)
    expect(st().compass.bands[0]!.label).toBe('Üst')
    expect(st().compass.quadrants[0]!.label).toBe('Kaotik')
  })

  it('düşen seçili kartın seçimi kalkar, kalanınki korunur', () => {
    fill('A', 'B', 'C', 'D', 'E')
    st().select(st().compass.cells[4]!.id)
    st().setGridSize(2)
    expect(st().selectedId).toBeNull()
    const a = st().compass.cells[0]!.id
    st().select(a)
    st().setGridSize(4)
    expect(st().selectedId).toBe(a)
  })
})
