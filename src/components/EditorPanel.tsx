import { ArrowLeft, ArrowRight, CursorClick, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useBackgroundScrollLock, useSheetFrame } from '../hooks/useSheetFrame'
import { useIsDesktop } from '../hooks/useMediaQuery'
import { panelTitle, revealDelta } from '../lib/viewport'
import { useCompassStore } from '../store/compassStore'
import { CellEditor } from './CellEditor'
import { CellPreview } from './CellPreview'
import { PhotoField } from './PhotoField'
import { SwapField } from './SwapField'

function PanelHeader({
  cellId,
  index,
  total,
  onClose,
  preview,
}: {
  cellId: string
  index: number
  total: number
  onClose: () => void
  preview: boolean
}) {
  const name = useCompassStore((s) => s.compass.cells.find((c) => c.id === cellId)?.name)
  return (
    <div className="flex items-center gap-3">
      {preview && <CellPreview cellId={cellId} />}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg leading-tight font-black tracking-tight">{panelTitle(name)}</h2>
        <p className="text-xs font-bold text-muted tabular-nums">
          Hücre {index + 1} / {total}
        </p>
      </div>
      <button type="button" className="btn btn-icon shrink-0" aria-label="Paneli kapat" onClick={onClose}>
        <X size={20} weight="bold" aria-hidden />
      </button>
    </div>
  )
}

function PanelNav({ index, total, go }: { index: number; total: number; go: (i: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" className="btn" disabled={index <= 0} onClick={() => go(index - 1)}>
        <ArrowLeft size={18} weight="bold" aria-hidden />
        Önceki
      </button>
      <button type="button" className="btn" disabled={index >= total - 1} onClick={() => go(index + 1)}>
        Sonraki
        <ArrowRight size={18} weight="bold" aria-hidden />
      </button>
    </div>
  )
}

/** Masaüstünde sağ panel, mobilde alttan açılan sayfa (bottom sheet). */
export function EditorPanel() {
  const isDesktop = useIsDesktop()
  const selectedId = useCompassStore((s) => s.selectedId)
  const index = useCompassStore((s) => s.compass.cells.findIndex((c) => c.id === s.selectedId))
  const total = useCompassStore((s) => s.compass.cells.length)
  const select = useCompassStore((s) => s.select)
  const close = () => select(null)
  // Enter ile sonraki hücreye geçildiyse yeni hücrenin isim alanına odaklanılır.
  const [focusNameOf, setFocusNameOf] = useState<string | null>(null)

  const open = Boolean(selectedId && index >= 0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const mobileOpen = open && !isDesktop
  const frame = useSheetFrame(mobileOpen)
  useBackgroundScrollLock(mobileOpen, sheetRef)

  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[data-modal-open]')) select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, select])

  /** Odaktaki alanı (madde satırıyla birlikte) panelin görünür kısmına kaydırır. */
  const revealFocused = () => {
    const scroller = scrollRef.current
    const active = document.activeElement
    if (!scroller || !(active instanceof HTMLElement) || !scroller.contains(active)) return
    const target = active.closest('li') ?? active
    const delta = revealDelta(target.getBoundingClientRect(), scroller.getBoundingClientRect())
    if (delta) scroller.scrollTop += delta
  }
  // Klavye açılıp panel küçülünce de odaktaki alan görünür kalsın.
  useEffect(() => {
    if (mobileOpen) revealFocused()
  }, [mobileOpen, frame])

  const go = (i: number, focusName = false) => {
    const id = useCompassStore.getState().compass.cells[i]?.id
    if (!id) return false
    // Kullanıcı hareketi içinde odak taşınsın diye senkron güncelle (iOS klavyesi açık kalır).
    flushSync(() => {
      setFocusNameOf(focusName ? id : null)
      select(id)
    })
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    return true
  }

  const body = open && selectedId && (
    <CellEditor
      key={selectedId}
      cellId={selectedId}
      photoSlot={<PhotoField cellId={selectedId} />}
      extra={<SwapField cellId={selectedId} />}
      autoFocusName={focusNameOf === selectedId}
      onAdvance={() => go(index + 1, true)}
    />
  )

  if (isDesktop) {
    return (
      <aside
        aria-label="Hücre düzenleme"
        className="flex w-[380px] shrink-0 flex-col border-l-[3px] border-ink bg-surface"
      >
        {body && selectedId ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              <PanelHeader cellId={selectedId} index={index} total={total} onClose={close} preview={false} />
              {body}
            </div>
            <div className="border-t-2 border-ink/10 px-5 py-3">
              <PanelNav index={index} total={total} go={go} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center text-muted">
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

  if (!body || !selectedId) return null
  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="false"
      aria-label="Hücre düzenleme"
      data-editor-sheet
      onFocus={() => requestAnimationFrame(revealFocused)}
      className="animate-sheet-in fixed inset-x-0 z-40 flex flex-col rounded-t-2xl border-t-[3px] border-ink bg-surface shadow-[0_-6px_0_0_rgb(18_18_18/0.12)]"
      style={{ bottom: frame.bottom, maxHeight: frame.maxHeight }}
    >
      <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-ink/25" aria-hidden />
      <div className="shrink-0 border-b-2 border-ink/10 px-4 pt-2 pb-3">
        <PanelHeader cellId={selectedId} index={index} total={total} onClose={close} preview />
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
        {body}
      </div>
      <div
        className={`shrink-0 border-t-2 border-ink/10 px-4 pt-2 ${
          frame.keyboard ? 'pb-2' : 'pb-[max(16px,env(safe-area-inset-bottom))]'
        }`}
      >
        <PanelNav index={index} total={total} go={go} />
      </div>
    </div>
  )
}
