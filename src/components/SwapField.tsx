import { ArrowsLeftRight } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { useCompassStore } from '../store/compassStore'

interface Props {
  cellId: string
}

/** Sürükle-bırakın klavye / tek dokunuş alternatifi. */
export function SwapField({ cellId }: Props) {
  const uid = useId()
  const cells = useCompassStore((s) => s.compass.cells)
  const swapCells = useCompassStore((s) => s.swapCells)
  const [target, setTarget] = useState('')

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${uid}-swap`} className="text-sm font-black tracking-wide uppercase">
        Yer değiştir
      </label>
      <div className="flex gap-2">
        <select
          id={`${uid}-swap`}
          className="field min-w-0 flex-1 cursor-pointer"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">Hücre seç…</option>
          {cells.map((c, i) =>
            c.id === cellId ? null : (
              <option key={c.id} value={c.id}>
                Hücre {i + 1}
                {c.name ? `: ${c.name}` : ' (boş)'}
              </option>
            ),
          )}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!target}
          onClick={() => {
            swapCells(cellId, target)
            setTarget('')
          }}
        >
          <ArrowsLeftRight size={18} weight="bold" aria-hidden />
          Değiştir
        </button>
      </div>
      <p className="text-xs text-muted">İpucu: Kartı tutup başka hücreye de sürükleyebilirsin.</p>
    </div>
  )
}
