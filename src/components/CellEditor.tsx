import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CaretDown, DiceFive, DotsSixVertical, Eraser, Plus, Sparkle, Trash } from '@phosphor-icons/react'
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { BULLET_MAX, BULLETS_MAX, NAME_MAX } from '../constants'
import { getTheme } from '../data/themes'
import { rollBullet, suggestBullets } from '../lib/bulletPool'
import { isCellEmpty } from '../lib/grid'
import { canAddBullet, clampBullet, clampName } from '../lib/limits'
import { breakCoalescing, useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'
import { CharCounter } from './CharCounter'

interface Props {
  cellId: string
  /** İsmin solundaki foto alanı. */
  photoSlot?: ReactNode
  /** "Diğer işlemler" içine giren ek içerik (yer değiştir). */
  extra?: ReactNode
  /** Açılınca isim alanına odaklan (Enter ile sonraki hücreye geçince). */
  autoFocusName?: boolean
  /** Son maddede Enter: sonraki hücreye geç. Geçilemiyorsa false. */
  onAdvance?: () => boolean
}

const bulletId = (i: number) => `bullet-${i}`
const bulletIndex = (id: string | number) => Number(String(id).slice('bullet-'.length))

const announcements: Announcements = {
  onDragStart: ({ active }) => `${bulletIndex(active.id) + 1}. madde alındı.`,
  onDragOver: ({ over }) => (over ? `${bulletIndex(over.id) + 1}. sıraya taşınıyor.` : undefined),
  onDragEnd: ({ active, over }) =>
    over && over.id !== active.id
      ? `Madde ${bulletIndex(over.id) + 1}. sıraya taşındı.`
      : 'Bırakıldı, sıra değişmedi.',
  onDragCancel: () => 'Taşıma iptal edildi.',
}

export function CellEditor({ cellId, photoSlot, extra, autoFocusName, onAdvance }: Props) {
  const uid = useId()
  const cell = useCompassStore((s) => s.compass.cells.find((c) => c.id === cellId))
  const updateCell = useCompassStore((s) => s.updateCell)
  const clearCell = useCompassStore((s) => s.clearCell)
  const showToast = useUiStore((s) => s.showToast)
  /** Alan başına zarın son getirdiği madde: tekrar basınca hemen geri gelmesin. */
  const lastRolled = useRef(new Map<string, string>())
  const nameRef = useRef<HTMLInputElement>(null)
  const bulletRefs = useRef<(HTMLInputElement | null)[]>([])
  // Odak, yeni madde DOM'a girer girmez (paint'ten önce) taşınır; aksi halde hızlı
  // yazılan ilk harfler önceki alana düşebilir.
  const pendingFocus = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return
    bulletRefs.current[pendingFocus.current]?.focus()
    pendingFocus.current = null
  })
  useLayoutEffect(() => {
    if (autoFocusName) nameRef.current?.focus()
  }, [autoFocusName])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!cell) return null
  const { bullets } = cell

  const setBullets = (next: string[]) => updateCell(cell.id, { bullets: next })
  const focusBullet = (i: number) => {
    const el = bulletRefs.current[i]
    if (el && i < bullets.length) el.focus()
    else pendingFocus.current = i
  }

  const addBullet = () => {
    if (!canAddBullet(bullets)) return
    setBullets([...bullets, ''])
    focusBullet(bullets.length)
  }
  const removeBullet = (i: number) => {
    setBullets(bullets.filter((_, j) => j !== i))
    focusBullet(Math.max(0, i - 1))
  }
  const pool = () => {
    const { compass } = useCompassStore.getState()
    return { pool: getTheme(compass.themeId).pool, cells: compass.cells }
  }
  const rollAt = (i: number) => {
    const key = `${cell.id}:${i}`
    const { pool: items, cells } = pool()
    const next = rollBullet(items, cells, lastRolled.current.get(key))
    if (!next) {
      showToast('Bu temanın havuzunda kullanılmamış madde kalmadı.')
      return
    }
    lastRolled.current.set(key, next)
    breakCoalescing() // her zar ayrı bir geri alma adımı
    const updated = [...bullets]
    updated[i] = next
    setBullets(updated)
  }
  const suggest = () => {
    const { pool: items, cells } = pool()
    const picks = suggestBullets(items, cells)
    if (picks.length === 0) {
      showToast('Bu temanın havuzunda kullanılmamış madde kalmadı.')
      return
    }
    setBullets(picks)
    if (picks.length < BULLETS_MAX) showToast(`Havuzda yalnızca ${picks.length} madde kalmıştı.`)
  }
  const noBullets = bullets.every((b) => b.trim() === '')

  /** Madde alanında Enter: sonraki madde, yeni madde ya da sonraki hücre. */
  const onBulletEnter = (i: number) => {
    if (i < bullets.length - 1) return focusBullet(i + 1)
    // Son madde boşsa ya da madde sınırı dolduysa sonraki hücreye geç.
    if (bullets[i]!.trim() !== '' && canAddBullet(bullets)) return addBullet()
    onAdvance?.()
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = bulletIndex(active.id)
    const to = bulletIndex(over.id)
    setBullets(arrayMove(bullets, from, to))
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-end gap-3">
          {photoSlot}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor={`${uid}-name`} className="text-sm font-black tracking-wide uppercase">
              İsim
            </label>
            <div className="relative">
              <input
                id={`${uid}-name`}
                ref={nameRef}
                className="field pr-14"
                value={cell.name}
                placeholder="ör. Ahmet"
                autoComplete="off"
                enterKeyHint="next"
                aria-describedby={`${uid}-name-count`}
                onChange={(e) => updateCell(cell.id, { name: clampName(e.target.value) })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (bullets.length === 0) addBullet()
                    else focusBullet(0)
                  }
                }}
              />
              <InlineCounter id={`${uid}-name-count`} value={cell.name} max={NAME_MAX} />
            </div>
          </div>
        </div>
        <p className="hidden text-xs text-muted sm:block">
          İpucu: Fotoğrafı hücreye sürükleyebilir ya da kopyalayıp Ctrl+V ile yapıştırabilirsin.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 flex w-full items-end justify-between text-sm font-black tracking-wide uppercase">
          Maddeler
          <span className="text-xs font-bold text-muted normal-case tabular-nums">
            {bullets.length}/{BULLETS_MAX}
          </span>
        </legend>

        {noBullets && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">
              Henüz madde yok. Kendin yaz ya da temanın havuzundan öneri al.
            </p>
            <button type="button" className="btn" onClick={suggest}>
              <Sparkle size={18} weight="bold" aria-hidden />3 madde öner
            </button>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'Maddeyi taşımak için boşluk tuşuna bas, ok tuşlarıyla yerini seç, bırakmak için tekrar boşluğa bas. Vazgeçmek için Escape.',
            },
          }}
        >
          <SortableContext items={bullets.map((_, i) => bulletId(i))} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-2">
              {bullets.map((b, i) => (
                <BulletRow
                  key={i}
                  index={i}
                  inputId={`${uid}-b${i}`}
                  value={b}
                  sortable={bullets.length > 1}
                  inputRef={(el) => {
                    bulletRefs.current[i] = el
                  }}
                  onChange={(v) => {
                    const next = [...bullets]
                    next[i] = clampBullet(v)
                    setBullets(next)
                  }}
                  onEnter={() => onBulletEnter(i)}
                  onBackspaceEmpty={() => removeBullet(i)}
                  onRoll={() => rollAt(i)}
                  onRemove={() => removeBullet(i)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          className="btn self-start"
          onClick={addBullet}
          disabled={!canAddBullet(bullets)}
        >
          <Plus size={18} weight="bold" aria-hidden />
          {canAddBullet(bullets) ? 'Madde ekle' : `En fazla ${BULLETS_MAX} madde`}
        </button>
      </fieldset>

      <details className="group rounded-lg border-2 border-ink/15">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-black tracking-wide uppercase [&::-webkit-details-marker]:hidden">
          Diğer işlemler
          <CaretDown size={16} weight="bold" className="transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="flex flex-col gap-4 border-t-2 border-ink/10 p-3">
          {extra}
          <button
            type="button"
            className="btn btn-danger self-start"
            disabled={isCellEmpty(cell)}
            onClick={() => clearCell(cell.id)}
          >
            <Eraser size={18} weight="bold" aria-hidden />
            Hücreyi temizle
          </button>
        </div>
      </details>
    </div>
  )
}

/** Input'un içinde sağda duran küçük karakter sayacı. */
function InlineCounter({ id, value, max }: { id: string; value: string; max: number }) {
  return (
    <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] leading-none">
      <CharCounter id={id} value={value} max={max} />
    </span>
  )
}

interface BulletRowProps {
  index: number
  inputId: string
  value: string
  sortable: boolean
  inputRef: (el: HTMLInputElement | null) => void
  onChange: (value: string) => void
  onEnter: () => void
  onBackspaceEmpty: () => void
  onRoll: () => void
  onRemove: () => void
}

/** [tutamaç] [input + sayaç] [zar] [sil] tek satırda. */
function BulletRow({
  index,
  inputId,
  value,
  sortable,
  inputRef,
  onChange,
  onEnter,
  onBackspaceEmpty,
  onRoll,
  onRemove,
}: BulletRowProps) {
  const n = index + 1
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: bulletId(index),
      disabled: !sortable,
      attributes: { roleDescription: 'sıralanabilir madde' },
    })

  return (
    <li
      ref={setNodeRef}
      className={`flex items-center gap-1.5 rounded-lg ${isDragging ? 'relative z-10 bg-surface shadow-brutal' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="flex h-11 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-ink/60 hover:text-ink active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
        aria-label={`${n}. maddeyi taşı`}
        disabled={!sortable}
      >
        <DotsSixVertical size={22} weight="bold" aria-hidden />
      </button>
      <label htmlFor={inputId} className="sr-only">
        Madde {n}
      </label>
      <div className="relative min-w-0 flex-1">
        <input
          id={inputId}
          ref={inputRef}
          className="field pr-14"
          value={value}
          autoComplete="off"
          enterKeyHint="next"
          aria-describedby={`${inputId}-count`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onEnter()
            } else if (e.key === 'Backspace' && value === '') {
              e.preventDefault()
              onBackspaceEmpty()
            }
          }}
        />
        <InlineCounter id={`${inputId}-count`} value={value} max={BULLET_MAX} />
      </div>
      <button
        type="button"
        className="btn btn-icon shrink-0"
        aria-label={`${n}. madde için zar at`}
        title="Zar at: havuzdan rastgele madde"
        onClick={onRoll}
      >
        <DiceFive size={20} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-danger shrink-0"
        aria-label={`${n}. maddeyi sil`}
        onClick={onRemove}
      >
        <Trash size={18} weight="bold" aria-hidden />
      </button>
    </li>
  )
}
