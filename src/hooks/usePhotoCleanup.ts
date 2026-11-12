import { useEffect } from 'react'
import { gcOrphanPhotos, listPhotoIds } from '../lib/photos'
import { useCompassStore } from '../store/compassStore'

/**
 * Açılışta bir kez:
 * 1) IndexedDB'de bulunmayan fotoların referanslarını kaldırır (ör. site verisi silinmiş).
 * 2) Hiçbir hücrenin kullanmadığı fotoları siler. Geri alma geçmişi kalıcı olmadığı
 *    için açılışta güvenlidir; oturum içinde silme yapılmaz (undo fotoyu geri getirebilsin).
 */
export function usePhotoCleanup(): void {
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const existing = new Set(await listPhotoIds())
        if (cancelled) return
        useCompassStore.getState().dropMissingPhotos(existing)
        const used = useCompassStore
          .getState()
          .compass.cells.flatMap((c) => (c.photoId ? [c.photoId] : []))
        await gcOrphanPhotos(used)
      } catch {
        // IndexedDB kullanılamıyorsa (gizli mod vb.) sessizce geç.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
}
