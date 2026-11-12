import { CursorClick, X } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { useCompassStore } from '../store/compassStore'
import { CellEditor } from './CellEditor'
import { PhotoField } from './PhotoField'
import { SwapField } from './SwapField'

function PanelHeader({ index, onClose }: { index: number; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-lg font-black tracking-tight">Hücre {index + 1}</h2>
      <button type="button" className="btn btn-icon" aria-label="Paneli kapat" onClick={onClose}>
        <X size={20} weight="bold" aria-hidden />
      </button>
    </div>
  )
}

/** Masaüstünde sağ panel, mobilde alttan açılan sayfa (bottom sheet). */
export function EditorPanel() {
  const isDesktop = useIsDesktop()
  const selectedId = useCompassStore((s) => s.selectedId)
  const index = useCompassStore((s) => s.compass.cells.findIndex((c) => c.id === s.selectedId))
  const select = useCompassStore((s) => s.select)
  const close = () => select(null)

  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-modal-open]')) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, select])

  const body = selectedId && index >= 0 && (
    <CellEditor
      key={selectedId}
      cellId={selectedId}
      photoSlot={<PhotoField cellId={selectedId} />}
      extra={<SwapField cellId={selectedId} />}
    />
  )

  if (isDesktop) {
    return (
      <aside
        aria-label="Hücre düzenleme"
        className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto border-l-[3px] border-ink bg-surface p-5"
      >
        {body ? (
          <>
            <PanelHeader index={index} onClose={close} />
            {body}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
            <span className="flex size-14 items-center justify-center rounded-full border-2 border-dashed border-ink/40">
              <CursorClick size={28} weight="bold" aria-hidden />
            </span>
            <p className="max-w-56 text-sm font-medium">
              Düzenlemek için pusulada bir hücreye tıkla. Kartları sürükleyerek yer değiştirebilirsin.
            </p>
          </div>
        )}
      </aside>
    )
  }

  if (!body) return null
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Hücre ${index + 1} düzenleme`}
      className="animate-sheet-in fixed inset-x-0 bottom-0 z-40 flex max-h-[max(45dvh,calc(100dvh-100vw-4.5rem))] flex-col rounded-t-2xl border-t-[3px] border-ink bg-surface shadow-[0_-6px_0_0_rgb(18_18_18/0.12)]"
    >
      <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-ink/25" aria-hidden />
      <div className="px-4 pt-2 pb-3">
        <PanelHeader index={index} onClose={close} />
      </div>
      <div className="overflow-y-auto overscroll-contain px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {body}
      </div>
    </div>
  )
}
