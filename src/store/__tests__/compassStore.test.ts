import { beforeEach, describe, expect, it } from 'vitest'
import { BULLET_MAX, BULLETS_MAX, NAME_MAX } from '../../constants'
import { createDefaultCompass } from '../../lib/grid'
import { useCompassStore } from '../compassStore'

const st = () => useCompassStore.getState()
const cells = () => st().compass.cells
const idAt = (i: number) => cells()[i]!.id

describe('compassStore', () => {
  // Bu testler 4x4 indeksleriyle yazıldı.
  beforeEach(() => {
    st().reset()
    useCompassStore.setState({ compass: createDefaultCompass(4) })
  })

  describe('updateCell', () => {
    it('ismi ve maddeleri günceller', () => {
      st().updateCell(idAt(0), { name: 'Ahmet', bullets: ['a', 'b'] })
      expect(cells()[0]).toMatchObject({ name: 'Ahmet', bullets: ['a', 'b'] })
    })

    it('limitleri aşamaz', () => {
      st().updateCell(idAt(0), {
        name: 'x'.repeat(NAME_MAX + 10),
        bullets: Array(BULLETS_MAX + 2).fill('y'.repeat(BULLET_MAX + 10)),
      })
      const c = cells()[0]!
      expect(c.name).toHaveLength(NAME_MAX)
      expect(c.bullets).toHaveLength(BULLETS_MAX)
      c.bullets.forEach((b) => expect(b).toHaveLength(BULLET_MAX))
    })

    it('photoId undefined verilince alanı kaldırır', () => {
      st().updateCell(idAt(0), { photoId: 'p1' })
      expect(cells()[0]!.photoId).toBe('p1')
      st().updateCell(idAt(0), { photoId: undefined })
      expect('photoId' in cells()[0]!).toBe(false)
    })

    it('bilinmeyen id durumu değiştirmez', () => {
      const before = st().compass
      st().updateCell('yok', { name: 'x' })
      expect(st().compass).toBe(before)
    })
  })

  describe('swapCells', () => {
    it('iki hücrenin içeriğini takas eder', () => {
      st().updateCell(idAt(0), { name: 'A', bullets: ['a'], photoId: 'pa' })
      st().updateCell(idAt(15), { name: 'B', bullets: ['b'] })
      const [a, b] = [idAt(0), idAt(15)]
      st().swapCells(a, b)
      expect(cells()[0]).toMatchObject({ id: b, name: 'B', bullets: ['b'] })
      expect(cells()[0]!.photoId).toBeUndefined()
      expect(cells()[15]).toMatchObject({ id: a, name: 'A', bullets: ['a'], photoId: 'pa' })
    })

    it('dolu hücreyi boş hücreye taşır', () => {
      st().updateCell(idAt(2), { name: 'C' })
      st().swapCells(idAt(2), idAt(9))
      expect(cells()[2]!.name).toBe('')
      expect(cells()[9]!.name).toBe('C')
    })

    it('hücre sayısı ve id kümesi korunur', () => {
      const ids = new Set(cells().map((c) => c.id))
      st().swapCells(idAt(3), idAt(12))
      expect(cells()).toHaveLength(16)
      expect(new Set(cells().map((c) => c.id))).toEqual(ids)
    })

    it('aynı hücre veya geçersiz id ile no-op', () => {
      const before = st().compass
      st().swapCells(idAt(1), idAt(1))
      st().swapCells(idAt(1), 'yok')
      expect(st().compass).toBe(before)
    })

    it('iki kez takas eski haline döndürür', () => {
      st().updateCell(idAt(0), { name: 'A' })
      st().updateCell(idAt(5), { name: 'B' })
      const snapshot = cells()
      st().swapCells(idAt(0), idAt(5))
      st().swapCells(idAt(0), idAt(5))
      expect(cells()).toEqual(snapshot)
    })

    it('seçim içerikle birlikte hareket eder', () => {
      const a = idAt(0)
      st().updateCell(a, { name: 'A' })
      st().select(a)
      st().swapCells(a, idAt(6))
      expect(st().selectedId).toBe(a)
      expect(cells()[6]!.id).toBe(a)
    })
  })

  it('clearCell içeriği siler, id ve konum korunur', () => {
    const id = idAt(4)
    st().updateCell(id, { name: 'X', bullets: ['y'], photoId: 'p' })
    st().clearCell(id)
    expect(cells()[4]).toEqual({ id, name: '', bullets: [] })
  })

  it('setRegion 4x4’te çeyreği günceller, boş etiketi siler', () => {
    st().setRegion(2, { color: '#000000', label: 'Kaotik' })
    expect(st().compass.quadrants[2]).toEqual({ color: '#000000', label: 'Kaotik' })
    st().setRegion(2, { label: '   ' })
    expect(st().compass.quadrants[2]).toEqual({ color: '#000000' })
  })

  it('setRegion 3x3’te bandı günceller, çeyreklere dokunmaz', () => {
    st().setGridSize(3)
    const quadrants = st().compass.quadrants
    st().setRegion(1, { label: 'Orta' })
    expect(st().compass.bands[1]!.label).toBe('Orta')
    expect(st().compass.quadrants).toBe(quadrants)
    st().setRegion(3, { label: 'yok' }) // 3x3’te 4. bölge yok
    expect(st().compass.bands).toHaveLength(3)
  })

  it('büyük harf ayarı değişir ve geri alınabilir', () => {
    expect(st().compass.uppercaseNames).toBe(false)
    st().setUppercaseNames(true)
    expect(st().compass.uppercaseNames).toBe(true)
    st().undo()
    expect(st().compass.uppercaseNames).toBe(false)
  })

  it('reset varsayılana döner ve seçimi temizler', () => {
    st().updateCell(idAt(0), { name: 'A' })
    st().select(idAt(0))
    st().reset()
    expect(cells().every((c) => c.name === '')).toBe(true)
    expect(st().selectedId).toBeNull()
  })
})
