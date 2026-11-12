import { useRef } from 'react'
import { CompassCanvas } from './components/CompassCanvas'
import { CropModal } from './components/CropModal'
import { EditorPanel } from './components/EditorPanel'
import { Footer } from './components/Footer'
import { GameDialogs } from './components/GameDialogs'
import { HistoryButtons } from './components/HistoryButtons'
import { ToastHost } from './components/ToastHost'
import { Toolbar } from './components/Toolbar'
import { TopBar } from './components/TopBar'
import { useHotkeys } from './hooks/useHotkeys'
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

  return (
    <div className="flex h-dvh flex-col">
      <TopBar actions={<Toolbar artRef={artRef} history={<HistoryButtons />} />} />
      <main className="flex min-h-0 flex-1">
        <section aria-label="Pusula" className="min-w-0 flex-1 p-4 sm:p-6">
          <CompassCanvas artRef={artRef} />
        </section>
        <EditorPanel />
      </main>
      <Footer />
      <CropModal />
      <GameDialogs />
      <ToastHost />
    </div>
  )
}
