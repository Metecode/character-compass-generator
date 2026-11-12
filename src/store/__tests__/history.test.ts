import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT } from '../../constants'
import { createDefaultCompass } from '../../lib/grid'
import { breakCoalescing, useCompassStore } from '../compassStore'

const st = () => useCompassStore.getState()
const idAt = (i: number) => st().compass.cells[i]!.id

describe('geri al / ileri al', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    useCompassStore.setState({ compass: createDefaultCompass(4), past: [], future: [], selectedId: null })
    breakCoalescing()
  })
  afterEach(() => vi.useRealTimers())

  it('takası geri alır ve ileri alır', () => {
    st().updateCell(idAt(0), { name: 'A' })
    vi.advanceTimersByTime(2000)
    const [a, b] = [idAt(0), idAt(1)]
    st().swapCells(a, b)
    expect(st().compass.cells[1]!.name).toBe('A')
    st().undo()
    expect(st().compass.cells[0]!.name).toBe('A')
    st().redo()
    expect(st().compass.cells[1]!.name).toBe('A')
  })

  it('aynı alana hızlı yazım tek adımda birleşir', () => {
    const id = idAt(0)
    for (const v of ['A', 'Ah', 'Ahm', 'Ahme', 'Ahmet']) {
      st().updateCell(id, { name: v })
      vi.advanceTimersByTime(200)
    }
    expect(st().past).toHaveLength(1)
    st().undo()
    expect(st().compass.cells[0]!.name).toBe('')
  })

  it('duraklamadan sonra yeni adım açılır', () => {
    const id = idAt(0)
    st().updateCell(id, { name: 'Ali' })
    vi.advanceTimersByTime(1500)
    st().updateCell(id, { name: 'Ali Veli' })
    expect(st().past).toHaveLength(2)
    st().undo()
    expect(st().compass.cells[0]!.name).toBe('Ali')
  })

  it('madde ekleme ayrı adımdır, yazımla birleşmez', () => {
    const id = idAt(0)
    st().updateCell(id, { bullets: [''] })
    st().updateCell(id, { bullets: ['x'] })
    st().updateCell(id, { bullets: ['xy'] })
    expect(st().past).toHaveLength(2)
  })

  it('yeni değişiklik ileri al yığınını temizler', () => {
    st().updateCell(idAt(0), { name: 'A' })
    st().undo()
    expect(st().future).toHaveLength(1)
    st().updateCell(idAt(1), { name: 'B' })
    expect(st().future).toHaveLength(0)
  })

  it('sıfırlama geri alınabilir', () => {
    st().updateCell(idAt(0), { name: 'A' })
    vi.advanceTimersByTime(2000)
    st().reset()
    expect(st().compass.cells[0]!.name).toBe('')
    st().undo()
    expect(st().compass.cells[0]!.name).toBe('A')
  })

  it('geri alınca artık olmayan hücrenin seçimi temizlenir', () => {
    st().reset() // yeni id'ler
    st().select(idAt(0))
    st().undo()
    expect(st().selectedId).toBeNull()
  })

  it('boş yığında no-op', () => {
    const c = st().compass
    st().undo()
    st().redo()
    expect(st().compass).toBe(c)
  })

  it(`geçmiş ${HISTORY_LIMIT} adımla sınırlı`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) st().swapCells(idAt(0), idAt(1))
    expect(st().past).toHaveLength(HISTORY_LIMIT)
  })

  it('seçim değişikliği geçmişe yazılmaz', () => {
    st().select(idAt(3))
    expect(st().past).toHaveLength(0)
  })
})
