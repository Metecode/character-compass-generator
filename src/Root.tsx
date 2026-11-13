import { Suspense, lazy } from 'react'
import App from './App.tsx'

// Router kütüphanesi yok: ek sayfalar yola bakılarak seçilir. Netlify tüm
// yolları index.html'e yönlendirir (public/_redirects; /g/* ve /r/* kendi önizleme girişlerine).
const pages = {
  game: lazy(() => import('./pages/GamePage')),
  room: lazy(() => import('./pages/RoomPage')),
  privacy: lazy(() => import('./pages/PrivacyPage')),
}

export function Root({ path }: { path: string }) {
  let page = <App />
  if (/^\/g\/[^/]+\/?$/.test(path)) page = <pages.game />
  else if (/^\/r\/[^/]+\/?$/.test(path)) page = <pages.room />
  else if (/^\/gizlilik\/?$/.test(path)) page = <pages.privacy />
  return <Suspense fallback={null}>{page}</Suspense>
}
