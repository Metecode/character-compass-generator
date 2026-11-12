import { beforeEach, describe, expect, it } from 'vitest'
import { STORAGE_KEY } from '../../constants'
import { createDefaultCompass } from '../../lib/grid'
import { STORE_VERSION } from '../../lib/migrate'
import { getPhoto, listPhotoIds, savePhoto } from '../../lib/photos'
import { useCompassStore } from '../compassStore'

const st = () => useCompassStore.getState()

/** v1 kaydı: 4x4; bant, tema ve büyük harf alanları yok. */
const v1Record = (photoId: string) => ({
  version: 1,
  state: {
    compass: {
      id: 'eski',
      title: 'Eski pusula',
      gridSize: 4,
      quadrants: [
        { color: '#111111', label: 'Kaotik' },
        { color: '#222222' },
        { color: '#333333' },
        { color: '#444444' },
      ],
      cells: Array.from({ length: 16 }, (_, i) =>
        i === 5
          ? { id: 'c5', name: 'Ahmet', bullets: ['geç kalır'], photoId }
          : { id: `c${i}`, name: '', bullets: [] },
      ),
    },
  },
})

describe('v1 → v2 migration', () => {
  beforeEach(() => {
    useCompassStore.setState({ compass: createDefaultCompass(), past: [], future: [] })
  })

  it('4x4 düzeni, içerikleri ve bölgeleri korur; büyük harf açık kalır', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Record('foto-1')))
    await useCompassStore.persist.rehydrate()
    const c = st().compass
    expect(c.id).toBe('eski')
    expect(c.title).toBe('Eski pusula')
    expect(c.gridSize).toBe(4)
    expect(c.cells).toHaveLength(16)
    expect(c.cells[5]).toEqual({ id: 'c5', name: 'Ahmet', bullets: ['geç kalır'], photoId: 'foto-1' })
    expect(c.quadrants[0]).toEqual({ color: '#111111', label: 'Kaotik' })
    expect(c.uppercaseNames).toBe(true)
    expect(c.themeId).toBe('genel')
    expect(c.bands).toHaveLength(3)
  })

  it('yeni sürümle yeniden kaydeder', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Record('foto-1')))
    await useCompassStore.persist.rehydrate()
    st().setTitle('Değişti') // kaydı tetikle
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(saved.version).toBe(STORE_VERSION)
    expect(saved.state.compass.gridSize).toBe(4)
    expect(saved.state.compass.uppercaseNames).toBe(true)
  })

  it('IndexedDB’deki fotoğraflara dokunmaz', async () => {
    const photoId = await savePhoto(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }))
    const before = (await listPhotoIds()).sort()
    const photoBefore = await getPhoto(photoId)
    expect(photoBefore).toBeDefined()

    localStorage.setItem(STORAGE_KEY, JSON.stringify(v1Record(photoId)))
    await useCompassStore.persist.rehydrate()

    expect(st().compass.cells[5]!.photoId).toBe(photoId)
    expect((await listPhotoIds()).sort()).toEqual(before)
    expect(await getPhoto(photoId)).toEqual(photoBefore)
  })

  it('v2 kaydında boyut ve büyük harf ayarı olduğu gibi kalır', async () => {
    const compass = { ...createDefaultCompass(2), uppercaseNames: false }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORE_VERSION, state: { compass } }))
    await useCompassStore.persist.rehydrate()
    expect(st().compass.gridSize).toBe(2)
    expect(st().compass.cells).toHaveLength(4)
    expect(st().compass.uppercaseNames).toBe(false)
  })
})
