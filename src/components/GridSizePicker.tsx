import { useState } from 'react'
import { GRID_SIZES } from '../constants'
import { reflowCells } from '../lib/grid'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'
import type { Cell, GridSize } from '../types'
import { Modal } from './Modal'

const cardName = (c: Cell) => c.name.trim() || 'İsimsiz kart'

/** Üst bardaki 2×2 / 3×3 / 4×4 seçici. Kart düşecekse önce onay ister. */
export function GridSizePicker() {
  const gridSize = useCompassStore((s) => s.compass.gridSize)
  const setGridSize = useCompassStore((s) => s.setGridSize)
  const showToast = useUiStore((s) => s.showToast)
  const [pending, setPending] = useState<{ size: GridSize; dropped: Cell[] } | null>(null)

  const apply = (size: GridSize, dropped: number) => {
    setGridSize(size)
    setPending(null)
    if (dropped > 0) showToast(`${dropped} kart kaldırıldı. Geri al ile geri getirebilirsin.`)
  }

  const choose = (size: GridSize) => {
    if (size === gridSize) return
    const { dropped } = reflowCells(useCompassStore.getState().compass.cells, size)
    if (dropped.length > 0) setPending({ size, dropped })
    else apply(size, 0)
  }

  return (
    <>
      <div
        className="flex overflow-hidden rounded-lg border-2 border-ink bg-surface shadow-brutal-sm"
        role="group"
        aria-label="Izgara boyutu"
      >
        {GRID_SIZES.map((size, i) => (
          <button
            key={size}
            type="button"
            aria-pressed={size === gridSize}
            aria-label={`${size}×${size} ızgara`}
            onClick={() => choose(size)}
            className={`min-h-10 min-w-11 px-2 text-sm font-black tabular-nums transition-colors ${
              i > 0 ? 'border-l-2 border-ink' : ''
            } ${size === gridSize ? 'bg-accent' : 'hover:bg-paper'}`}
          >
            {size}×{size}
          </button>
        ))}
      </div>

      {pending && (
        <Modal
          title={`${pending.size}×${pending.size} ızgaraya geç?`}
          size="sm"
          onClose={() => setPending(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setPending(null)} data-autofocus>
                Vazgeç
              </button>
              <button
                type="button"
                className="btn border-danger bg-danger text-white"
                onClick={() => apply(pending.size, pending.dropped.length)}
              >
                Evet, geç
              </button>
            </>
          }
        >
          <p className="text-sm">
            Yeni ızgarada {pending.size * pending.size} yer var. Kartlar sırasıyla taşınacak, şu{' '}
            {pending.dropped.length} kart sığmayacak ve kaldırılacak:
          </p>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {pending.dropped.map((c) => (
              <li
                key={c.id}
                className="rounded-md border-2 border-ink bg-paper px-2 py-0.5 text-sm font-bold"
              >
                {cardName(c)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">Geri al ile her zaman geri getirebilirsin.</p>
        </Modal>
      )}
    </>
  )
}
