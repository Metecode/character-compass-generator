import { ArrowDown, ArrowUp, DiceFive, Eraser, Plus, Sparkle, Trash } from '@phosphor-icons/react'
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { BULLET_MAX, BULLETS_MAX, NAME_MAX } from '../constants'
import { getTheme } from '../data/themes'
import { rollBullet, suggestBullets } from '../lib/bulletPool'
import { canAddBullet, clampBullet, clampName } from '../lib/limits'
import { isCellEmpty } from '../lib/grid'
import { breakCoalescing, useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'
import { CharCounter } from './CharCounter'

interface Props {
  cellId: string
  /** Foto bölümü (3. adımda eklenir) gibi ek içerikler için yuva. */
  photoSlot?: ReactNode
  extra?: ReactNode
}

export function CellEditor({ cellId, photoSlot, extra }: Props) {
  const uid = useId()
  const cell = useCompassStore((s) => s.compass.cells.find((c) => c.id === cellId))
  const updateCell = useCompassStore((s) => s.updateCell)
  const clearCell = useCompassStore((s) => s.clearCell)
  const showToast = useUiStore((s) => s.showToast)
  /** Alan başına zarın son getirdiği madde: tekrar basınca hemen geri gelmesin. */
  const lastRolled = useRef(new Map<string, string>())
  const bulletRefs = useRef<(HTMLInputElement | null)[]>([])
  // Odak, yeni madde DOM'a girer girmez (paint'ten önce) taşınır; aksi halde hızlı
  // yazılan ilk harfler önceki alana düşebilir.
  const pendingFocus = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return
    bulletRefs.current[pendingFocus.current]?.focus()
    pendingFocus.current = null
  })

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

  const moveBullet = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= bullets.length) return
    const next = [...bullets]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    setBullets(next)
    focusBullet(j)
  }

  return (
    <div className="flex flex-col gap-5">
      {photoSlot}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-end justify-between gap-2">
          <label htmlFor={`${uid}-name`} className="text-sm font-black tracking-wide uppercase">
            İsim
          </label>
          <CharCounter id={`${uid}-name-count`} value={cell.name} max={NAME_MAX} />
        </div>
        <input
          id={`${uid}-name`}
          className="field"
          value={cell.name}
          placeholder="ör. Ahmet"
          autoComplete="off"
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

        <ol className="flex flex-col gap-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span aria-hidden className="w-3 shrink-0 text-center font-black">
                  -
                </span>
                <label htmlFor={`${uid}-b${i}`} className="sr-only">
                  Madde {i + 1}
                </label>
                <input
                  id={`${uid}-b${i}`}
                  ref={(el) => {
                    bulletRefs.current[i] = el
                  }}
                  className="field min-w-0 flex-1"
                  value={b}
                  autoComplete="off"
                  aria-describedby={`${uid}-b${i}-count`}
                  onChange={(e) => {
                    const next = [...bullets]
                    next[i] = clampBullet(e.target.value)
                    setBullets(next)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (i === bullets.length - 1) addBullet()
                      else focusBullet(i + 1)
                    } else if (e.key === 'Backspace' && b === '') {
                      e.preventDefault()
                      removeBullet(i)
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-icon shrink-0"
                  aria-label={`${i + 1}. madde için zar at`}
                  title="Zar at: havuzdan rastgele madde"
                  onClick={() => rollAt(i)}
                >
                  <DiceFive size={20} weight="bold" aria-hidden />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 pl-4.5">
                <CharCounter id={`${uid}-b${i}-count`} value={b} max={BULLET_MAX} />
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-icon min-h-9 w-9"
                    aria-label={`${i + 1}. maddeyi yukarı taşı`}
                    disabled={i === 0}
                    onClick={() => moveBullet(i, -1)}
                  >
                    <ArrowUp size={16} weight="bold" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon min-h-9 w-9"
                    aria-label={`${i + 1}. maddeyi aşağı taşı`}
                    disabled={i === bullets.length - 1}
                    onClick={() => moveBullet(i, 1)}
                  >
                    <ArrowDown size={16} weight="bold" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon btn-danger min-h-9 w-9"
                    aria-label={`${i + 1}. maddeyi sil`}
                    onClick={() => removeBullet(i)}
                  >
                    <Trash size={16} weight="bold" aria-hidden />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>

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

      {extra}

      <div className="border-t-2 border-dashed border-ink/25 pt-4">
        <button
          type="button"
          className="btn btn-danger"
          disabled={isCellEmpty(cell)}
          onClick={() => clearCell(cell.id)}
        >
          <Eraser size={18} weight="bold" aria-hidden />
          Hücreyi temizle
        </button>
      </div>
    </div>
  )
}
