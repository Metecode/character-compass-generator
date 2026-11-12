import { useEffect, useState } from 'react'
import { CELL_GAP, CELL_PADDING, CELL_SCALE } from '../constants'
import { regionOf, regionsOf } from '../lib/grid'
import { useCompassStore } from '../store/compassStore'
import { CellFace } from './CellFace'

interface Props {
  cellId: string
  /** Önizlemenin yüksekliği (px). Genişlik hücrenin oranından gelir. */
  height?: number
}

/**
 * Düzenlenen hücrenin canlı, küçültülmüş kopyası. Pusuladaki hücreyle aynı
 * çizimi (CellFace) gerçek boyutunda çizer ve ölçekler; böylece PNG'de nasıl
 * görüneceği birebir görünür. Etkileşimsizdir, ekran okuyucudan gizlidir.
 */
export function CellPreview({ cellId, height = 64 }: Props) {
  const compass = useCompassStore((s) => s.compass)
  const index = compass.cells.findIndex((c) => c.id === cellId)
  const cell = compass.cells[index]
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)

  // Pusuladaki hücrenin dönüşümsüz (1080 tuvalindeki) boyutu; ızgara boyutu ya da
  // bant etiketleri değişince hücre boyutu da değişir, ResizeObserver yakalar.
  useEffect(() => {
    const el = document.querySelectorAll<HTMLElement>('[data-cell]')[index]
    if (!el) return
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [index, compass.gridSize])

  if (!cell || !size || size.h === 0) return null
  const k = height / size.h
  const scale = CELL_SCALE[compass.gridSize]
  const color = regionsOf(compass)[regionOf(index, compass.gridSize)]?.color

  return (
    <div
      aria-hidden
      data-cell-preview
      className="relative shrink-0 overflow-hidden rounded-md border-2 border-ink shadow-brutal-sm"
      style={{ width: Math.round(size.w * k) + 4, height: height + 4 }}
    >
      <div
        className="absolute top-0 left-0 flex origin-top-left flex-col overflow-hidden font-sans text-ink"
        style={{
          width: size.w,
          height: size.h,
          transform: `scale(${k})`,
          background: color,
          padding: Math.round(CELL_PADDING * scale),
          gap: Math.round(CELL_GAP * scale),
        }}
      >
        <CellFace cell={cell} scale={scale} uppercase={compass.uppercaseNames} />
      </div>
    </div>
  )
}
