import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '../../constants'
import { STORE_VERSION } from '../../lib/migrate'
import { useCompassStore } from '../compassStore'

const st = () => useCompassStore.getState()

describe('kalıcılık', () => {
  beforeEach(() => {
    st().reset()
    useCompassStore.setState({ past: [], future: [], selectedId: null })
  })

  it('sadece pusulayı localStorage’a yazar', () => {
    st().updateCell(st().compass.cells[0]!.id, { name: 'Kalıcı' })
    st().select(st().compass.cells[0]!.id)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.version).toBe(STORE_VERSION)
    expect(Object.keys(saved.state)).toEqual(['compass'])
    expect(saved.state.compass.cells[0].name).toBe('Kalıcı')
  })

  it('yeniden yüklemede veriyi geri getirir', async () => {
    st().updateCell(st().compass.cells[3]!.id, { name: 'Geri geldi', photoId: 'p1' })
    const snapshot = st().compass
    const saved = localStorage.getItem(STORAGE_KEY)!
    useCompassStore.setState({ compass: { ...snapshot, cells: [] } }) // bellekte boz
    localStorage.setItem(STORAGE_KEY, saved) // "sayfa yenileme": diskteki kayıt sağlam
    await useCompassStore.persist.rehydrate()
    expect(st().compass).toEqual(snapshot)
  })

  it('bozuk kayıt güvenli varsayılana döner', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { compass: { cells: 'x' } }, version: STORE_VERSION }))
    await useCompassStore.persist.rehydrate()
    expect(st().compass.gridSize).toBe(3)
    expect(st().compass.cells).toHaveLength(9)
    expect(st().compass.quadrants).toHaveLength(4)
    expect(st().compass.bands).toHaveLength(3)
  })
})
