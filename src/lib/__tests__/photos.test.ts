import { describe, expect, it } from 'vitest'
import { gcOrphanPhotos, getPhoto, listPhotoIds, savePhoto } from '../photos'

describe('foto deposu (IndexedDB)', () => {
  it('kaydeder, okur ve sahipsizleri temizler', async () => {
    const a = await savePhoto(new Blob(['a'], { type: 'image/jpeg' }))
    const b = await savePhoto(new Blob(['b'], { type: 'image/jpeg' }))
    expect(await getPhoto(a)).toBeDefined()
    expect(await listPhotoIds()).toEqual(expect.arrayContaining([a, b]))

    const removed = await gcOrphanPhotos([a])
    expect(removed).toContain(b)
    expect(await getPhoto(b)).toBeUndefined()
    expect(await getPhoto(a)).toBeDefined()
  })
})
