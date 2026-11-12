import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { useRef, useState } from 'react'
import { CANVAS_SIZE } from '../constants'
import { useFitScale } from '../hooks/useFitScale'
import { useCompassStore } from '../store/compassStore'
import type { Cell } from '../types'
import { CompassArt } from './CompassArt'
import { DragCard } from './DragCard'

interface Props {
  artRef: React.RefObject<HTMLDivElement | null>
}

const cellLabel = (id: string | number) => {
  const cells = useCompassStore.getState().compass.cells
  const i = cells.findIndex((c) => c.id === id)
  const name = cells[i]?.name
  return `Hücre ${i + 1}${name ? ` (${name})` : ''}`
}

const announcements: Announcements = {
  onDragStart: ({ active }) => `${cellLabel(active.id)} alındı.`,
  onDragOver: ({ active, over }) =>
    over && over.id !== active.id ? `${cellLabel(over.id)} üzerinde.` : undefined,
  onDragEnd: ({ active, over }) =>
    over && over.id !== active.id
      ? `${cellLabel(active.id)} ile ${cellLabel(over.id)} yer değiştirdi.`
      : 'Bırakıldı, değişiklik yok.',
  onDragCancel: () => 'Sürükleme iptal edildi.',
}

export function CompassCanvas({ artRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scale = useFitScale(containerRef, CANVAS_SIZE)
  const compass = useCompassStore((s) => s.compass)
  const selectedId = useCompassStore((s) => s.selectedId)
  const select = useCompassStore((s) => s.select)
  const swapCells = useCompassStore((s) => s.swapCells)
  const [dragging, setDragging] = useState<Cell | null>(null)

  const sensors = useSensors(
    // Fare: küçük bir eşikten sonra başlar, böylece tıklama seçim olarak kalır.
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    // Dokunmatik: uzun basış; kısa kaydırmalar sayfayı kaydırır.
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 8 } }),
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    setDragging(compass.cells.find((c) => c.id === active.id) ?? null)
    navigator.vibrate?.(15)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    if (over && over.id !== active.id) swapCells(String(active.id), String(over.id))
  }

  return (
    <div ref={containerRef} className="flex h-full w-full items-start justify-center sm:items-center">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Kartı başka bir hücreye sürükleyerek yer değiştirebilirsin. Klavyeyle yer değiştirmek için hücreyi seçip düzenleme panelindeki "Yer değiştir" alanını kullan.',
          },
        }}
      >
        <div
          className="relative shrink-0 shadow-brutal-lg"
          style={{
            width: CANVAS_SIZE * scale,
            height: CANVAS_SIZE * scale,
            visibility: scale ? 'visible' : 'hidden',
          }}
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ transform: `scale(${scale})` }}
          >
            <CompassArt ref={artRef} compass={compass} selectedId={selectedId} onSelect={select} />
          </div>
        </div>
        {/* Overlay kaynak hücre boyutundadır; snapCenterToCursor onu ortalar, kartı da içinde ortalarız. */}
        <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
          {dragging && (
            <div className="flex size-full items-center justify-center">
              <DragCard cell={dragging} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
