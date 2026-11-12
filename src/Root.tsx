import { Suspense, lazy } from 'react'
import App from './App.tsx'

// Router kütüphanesi yok: iki ek sayfa, yola bakılarak seçilir. Netlify tüm
// yolları index.html'e yönlendirir (public/_redirects).
const pages = {
  game: lazy(() => import('./pages/GamePage')),
  privacy: lazy(() => import('./pages/PrivacyPage')),
}

export function Root({ path }: { path: string }) {
  let page = <App />
  if (/^\/g\/[^/]+\/?$/.test(path)) page = <pages.game />
  else if (/^\/gizlilik\/?$/.test(path)) page = <pages.privacy />
  return <Suspense fallback={null}>{page}</Suspense>
}
