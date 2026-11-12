import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ArrowsLeftRight, Plus } from '@phosphor-icons/react'
import { memo, useState } from 'react'
import { CELL_GAP, CELL_PADDING } from '../constants'
import { isCellEmpty } from '../lib/grid'
import { useUiStore } from '../store/uiStore'
import type { Cell } from '../types'
import { CellFace } from './CellFace'

interface Props {
  cell: Cell
  index: number
  color: string
  /** Hücre içi ölçü çarpanı (4x4 = 1). */
  scale: number
  uppercase: boolean
  selected: boolean
  onSelect: (id: string) => void
}

function CompassCellImpl({ cell, index, color, scale, uppercase, selected, onSelect }: Props) {
  const px = (v: number) => Math.round(v * scale)
  const empty = isCellEmpty(cell)
  const openCrop = useUiStore((s) => s.openCrop)
  const [fileOver, setFileOver] = useState(false)
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

  // Aynı düğüm hem sürüklenebilir hem bırakma hedefi: bırakınca içerikler takas edilir.
  const drag = useDraggable({
    id: cell.id,
    disabled: empty,
    attributes: { roleDescription: 'sürüklenebilir kart' },
  })
  const drop = useDroppable({ id: cell.id })
  // Boş hücrede sürükleme kapalı ama hücre yine tıklanabilir: aria-disabled aktarılmaz.
  const { 'aria-disabled': _dragDisabled, ...dragAttributes } = drag.attributes
  const setRefs = (el: HTMLDivElement | null) => {
    drag.setNodeRef(el)
    drop.setNodeRef(el)
  }
  const swapTarget = drop.isOver && drag.active !== null && !drag.isDragging

  return (
    <div
      ref={setRefs}
      {...dragAttributes}
      {...drag.listeners}
      role="button"
      tabIndex={0}
      aria-label={`Hücre ${index + 1}${cell.name ? `: ${cell.name}` : ' (boş)'}`}
      aria-pressed={selected}
      onClick={() => onSelect(cell.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(cell.id)
        }
      }}
      onDragEnter={(e) => hasFiles(e) && setFileOver(true)}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFileOver(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setFileOver(false)
        onSelect(cell.id)
        openCrop(cell.id, e.dataTransfer.files[0])
      }}
      data-cell
      className="group relative flex min-h-0 min-w-0 cursor-pointer touch-manipulation flex-col overflow-hidden outline-none select-none [-webkit-touch-callout:none]"
      style={{ background: color, padding: px(CELL_PADDING), gap: px(CELL_GAP) }}
    >
      <CellFace cell={cell} scale={scale} uppercase={uppercase} />

      {drag.isDragging && (
        <div className="editor-only pointer-events-none absolute inset-2 border-[3px] border-dashed border-ink/50 bg-white/65" />
      )}

      {empty && !swapTarget && (
        <div className="editor-only pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-20 items-center justify-center rounded-full border-[3px] border-dashed border-ink/40 text-ink/45 transition-colors group-hover:border-ink/70 group-hover:text-ink/70">
            <Plus size={40} weight="bold" aria-hidden />
          </span>
        </div>
      )}

      {swapTarget && (
        <div className="editor-only pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60 text-2xl font-black uppercase shadow-[inset_0_0_0_8px_var(--color-focus)]">
          <ArrowsLeftRight size={48} weight="bold" aria-hidden />
          Yer değiştir
        </div>
      )}

      {fileOver && (
        <div className="editor-only pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 text-lg font-black uppercase shadow-[inset_0_0_0_6px_var(--color-focus)]">
          Fotoğrafı bırak
        </div>
      )}

      <div
        aria-hidden
        className={`editor-only pointer-events-none absolute inset-0 transition-[box-shadow] duration-150 ${
          selected
            ? 'shadow-[inset_0_0_0_6px_var(--color-focus)]'
            : 'group-hover:shadow-[inset_0_0_0_4px_rgb(18_18_18/0.35)] group-focus-visible:shadow-[inset_0_0_0_6px_var(--color-focus)]'
        }`}
      />
    </div>
  )
}

export const CompassCell = memo(CompassCellImpl)
