import { useEffect, useState } from 'react'
import { getPhotoUrl } from '../lib/photos'

/** photoId için object URL döner; yüklenene kadar null. */
export function usePhotoUrl(photoId: string | undefined): string | null {
  const [state, setState] = useState<{ id?: string; url: string | null }>({ url: null })

  useEffect(() => {
    if (!photoId) return
    let alive = true
    getPhotoUrl(photoId).then(
      (url) => alive && setState({ id: photoId, url }),
      () => alive && setState({ id: photoId, url: null }),
    )
    return () => {
      alive = false
    }
  }, [photoId])

  return photoId && state.id === photoId ? state.url : null
}
