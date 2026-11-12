import { createStore, del, get, keys, set } from 'idb-keyval'
import { newId } from './grid'

/**
 * Fotolar IndexedDB'de Blob olarak durur; store'da yalnızca photoId tutulur.
 * Bir foto silinmeden önce undo geçmişi düşünülmeli: bu yüzden silme işi
 * yalnızca açılışta sahipsiz fotolar için yapılır (gcOrphanPhotos).
 */
// Veritabanı adı eski adla kalır: değişirse kayıtlı fotoğraflar kaybolur.
const photoStore = createStore('karakter-pusulasi', 'photos')

const urlCache = new Map<string, Promise<string | null>>()

export async function savePhoto(blob: Blob): Promise<string> {
  const id = newId()
  await set(id, blob, photoStore)
  urlCache.set(id, Promise.resolve(URL.createObjectURL(blob)))
  return id
}

export const getPhoto = (id: string): Promise<Blob | undefined> => get<Blob>(id, photoStore)

/** photoId → object URL (önbellekli). Foto yoksa null. */
export function getPhotoUrl(id: string): Promise<string | null> {
  let p = urlCache.get(id)
  if (!p) {
    p = getPhoto(id).then((b) => (b ? URL.createObjectURL(b) : null))
    urlCache.set(id, p)
  }
  return p
}

export async function deletePhoto(id: string): Promise<void> {
  const p = urlCache.get(id)
  urlCache.delete(id)
  const url = await p
  if (url) URL.revokeObjectURL(url)
  await del(id, photoStore)
}

export async function listPhotoIds(): Promise<string[]> {
  return (await keys(photoStore)).map(String)
}

/** Kullanılmayan fotoları siler. Silinen id'leri döner. */
export async function gcOrphanPhotos(used: Iterable<string>): Promise<string[]> {
  const keep = new Set(used)
  const orphans = (await listPhotoIds()).filter((id) => !keep.has(id))
  await Promise.all(orphans.map(deletePhoto))
  return orphans
}
