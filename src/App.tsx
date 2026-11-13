import { useRef } from 'react'
import { CompassCanvas } from './components/CompassCanvas'
import { CropModal } from './components/CropModal'
import { EditorPanel } from './components/EditorPanel'
import { Footer } from './components/Footer'
import { GameDialogs } from './components/GameDialogs'
import { ToastHost } from './components/ToastHost'
import { CompassDialogs, MobileBottomBar, MobileTopRow, Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import { useHotkeys } from './hooks/useHotkeys'
import { useIsMobile } from './hooks/useMediaQuery'
import { usePhotoCleanup } from './hooks/usePhotoCleanup'
import { usePhotoInputs } from './hooks/usePhotoInputs'
import { useCompassStore } from './store/compassStore'

if (import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useCompassStore }).__store = useCompassStore
}

export default function App() {
  const artRef = useRef<HTMLDivElement>(null)
  usePhotoInputs()
  usePhotoCleanup()
  useHotkeys()
  const isMobile = useIsMobile()

  return (
    <div
      className="flex h-dvh flex-col"
      // Mobilde alt çubuğun arkasında içerik kalmasın: yüksekliği kadar boşluk.
      style={isMobile ? { paddingBottom: 'var(--bottom-bar-h, 72px)' } : undefined}
    >
      <TopBar actions={isMobile ? <MobileTopRow /> : <Toolbar artRef={artRef} />} />
      <main className="flex min-h-0 flex-1">
        <section aria-label="Pusula" className="min-w-0 flex-1 p-4 sm:p-6">
          <CompassCanvas artRef={artRef} />
        </section>
        <EditorPanel />
      </main>
      <Footer />
      {isMobile && <MobileBottomBar artRef={artRef} />}
      <CompassDialogs />
      <CropModal />
      <GameDialogs />
      <ToastHost />
    </div>
  )
}
