import { ArrowArcLeft, ArrowArcRight } from '@phosphor-icons/react'
import { useCompassStore } from '../store/compassStore'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

export function HistoryButtons() {
  const canUndo = useCompassStore((s) => s.past.length > 0)
  const canRedo = useCompassStore((s) => s.future.length > 0)
  const undo = useCompassStore((s) => s.undo)
  const redo = useCompassStore((s) => s.redo)

  return (
    <div className="flex gap-1.5" role="group" aria-label="Geçmiş">
      <button
        type="button"
        className="btn btn-icon"
        aria-label={`Geri al (${mod}+Z)`}
        title={`Geri al (${mod}+Z)`}
        disabled={!canUndo}
        onClick={undo}
      >
        <ArrowArcLeft size={20} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-label={`İleri al (${mod}+Shift+Z)`}
        title={`İleri al (${mod}+Shift+Z)`}
        disabled={!canRedo}
        onClick={redo}
      >
        <ArrowArcRight size={20} weight="bold" aria-hidden />
      </button>
    </div>
  )
}
