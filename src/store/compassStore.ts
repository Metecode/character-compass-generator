import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { HISTORY_LIMIT, STORAGE_KEY } from '../constants'
import type { Theme } from '../data/themes'
import { createDefaultCompass, createEmptyCell, reflowCells } from '../lib/grid'
import { clampCellPatch } from '../lib/limits'
import { STORE_VERSION, migratePersisted } from '../lib/migrate'
import { sanitizeCompass } from '../lib/sanitize'
import type { CellContent, Compass, GridSize, Region } from '../types'

export interface CompassState {
  compass: Compass
  selectedId: string | null
  /** Geri al yığını (en eski başta). Kalıcı değildir. */
  past: Compass[]
  future: Compass[]

  select: (id: string | null) => void
  setTitle: (title: string) => void
  /** Şu anki boyutun bölgesini (4x4/2x2'de çeyrek, 3x3'te bant) günceller. */
  setRegion: (index: number, patch: Partial<Region>) => void
  /**
   * Izgarayı yeniden boyutlandırır; dolu kartlar okuma sırasıyla taşınır, sığmayan
   * kartlar düşer (onayı arayüz ister). Geri alınabilir.
   */
  setGridSize: (size: GridSize) => void
  setUppercaseNames: (on: boolean) => void
  /** Temanın renk, etiket ve madde havuzunu uygular; hücrelere ve boyuta dokunmaz. */
  applyTheme: (theme: Theme) => void
  updateCell: (id: string, patch: Partial<CellContent>) => void
  clearCell: (id: string) => void
  /** İki hücrenin yerini (dolayısıyla içeriğini) takas eder. */
  swapCells: (idA: string, idB: string) => void
  reset: () => void
  /** Dışarıdan gelen pusulayı (canlı oda sonucu) doğrulayıp mevcutun yerine koyar. Geri alınabilir. */
  loadCompass: (compass: Compass) => void
  undo: () => void
  redo: () => void
  /** Geçmişe yazmadan foto referanslarını temizler (açılışta kayıp fotolar için). */
  dropMissingPhotos: (existing: ReadonlySet<string>) => void
}

/**
 * Ardışık küçük değişiklikler (aynı alana yazmak, renk seçiciyi sürüklemek) tek
 * bir geri alma adımında birleşir.
 */
const COALESCE_MS = 1000
let lastKey: string | null = null
let lastAt = 0
export const breakCoalescing = () => {
  lastKey = null
}

type Commit = Pick<CompassState, 'compass' | 'past' | 'future'>

function commit(s: CompassState, compass: Compass, key?: string): Commit {
  const now = Date.now()
  const merge = key !== undefined && key === lastKey && now - lastAt < COALESCE_MS
  lastKey = key ?? null
  lastAt = now
  return {
    compass,
    past: merge ? s.past : [...s.past, s.compass].slice(-HISTORY_LIMIT),
    future: [],
  }
}

const keepSelection = (compass: Compass, id: string | null) =>
  id && compass.cells.some((c) => c.id === id) ? id : null

export const useCompassStore = create<CompassState>()(
  persist(
    (set) => ({
      compass: createDefaultCompass(),
      selectedId: null,
      past: [],
      future: [],

      select: (id) => {
        breakCoalescing()
        set({ selectedId: id })
      },

      setTitle: (title) =>
        set((s) => (title === s.compass.title ? s : commit(s, { ...s.compass, title }, 'title'))),

      setRegion: (index, patch) =>
        set((s) => {
          const field = s.compass.gridSize === 3 ? 'bands' : 'quadrants'
          const list = s.compass[field]
          const current = list[index]
          if (!current) return s
          const next: Region = { ...current, ...patch }
          if (next.label !== undefined && next.label.trim() === '') delete next.label
          const updated = list.map((r, i) => (i === index ? next : r))
          const key = `${field}${index}:${Object.keys(patch).sort().join(',')}`
          return commit(s, { ...s.compass, [field]: updated } as Compass, key)
        }),

      setGridSize: (size) =>
        set((s) => {
          if (size === s.compass.gridSize) return s
          const { cells } = reflowCells(s.compass.cells, size)
          const compass = { ...s.compass, gridSize: size, cells }
          return { ...commit(s, compass), selectedId: keepSelection(compass, s.selectedId) }
        }),

      setUppercaseNames: (on) =>
        set((s) =>
          on === s.compass.uppercaseNames ? s : commit(s, { ...s.compass, uppercaseNames: on }),
        ),

      applyTheme: (theme) =>
        set((s) => {
          const clone = <T extends object>(list: readonly T[]) => list.map((r) => ({ ...r }))
          return commit(s, {
            ...s.compass,
            quadrants: clone(theme.quadrants) as Compass['quadrants'],
            bands: clone(theme.bands) as Compass['bands'],
            themeId: theme.id,
          })
        }),

      updateCell: (id, patch) =>
        set((s) => {
          const safe = clampCellPatch(patch)
          const prev = s.compass.cells.find((c) => c.id === id)
          if (!prev) return s
          const next = { ...prev, ...safe }
          if (!next.photoId) delete next.photoId
          const cells = s.compass.cells.map((c) => (c.id === id ? next : c))
          // Metin yazımı birleşir; madde ekleme/silme ve foto ayrı adımdır.
          let key: string | undefined
          if (safe.name !== undefined && Object.keys(safe).length === 1) key = `name:${id}`
          else if (
            safe.bullets !== undefined &&
            Object.keys(safe).length === 1 &&
            safe.bullets.length === prev.bullets.length
          )
            key = `bullets:${id}`
          return commit(s, { ...s.compass, cells }, key)
        }),

      clearCell: (id) =>
        set((s) => {
          if (!s.compass.cells.some((c) => c.id === id)) return s
          const cells = s.compass.cells.map((c) => (c.id === id ? { ...createEmptyCell(), id } : c))
          return commit(s, { ...s.compass, cells })
        }),

      swapCells: (idA, idB) =>
        set((s) => {
          if (idA === idB) return s
          const cells = [...s.compass.cells]
          const a = cells.findIndex((c) => c.id === idA)
          const b = cells.findIndex((c) => c.id === idB)
          if (a < 0 || b < 0) return s
          ;[cells[a], cells[b]] = [cells[b]!, cells[a]!]
          return commit(s, { ...s.compass, cells })
        }),

      reset: () => set((s) => ({ ...commit(s, createDefaultCompass()), selectedId: null })),

      loadCompass: (compass) => set((s) => ({ ...commit(s, sanitizeCompass(compass)), selectedId: null })),

      undo: () =>
        set((s) => {
          const prev = s.past[s.past.length - 1]
          if (!prev) return s
          breakCoalescing()
          return {
            compass: prev,
            past: s.past.slice(0, -1),
            future: [s.compass, ...s.future],
            selectedId: keepSelection(prev, s.selectedId),
          }
        }),

      redo: () =>
        set((s) => {
          const [next, ...rest] = s.future
          if (!next) return s
          breakCoalescing()
          return {
            compass: next,
            past: [...s.past, s.compass],
            future: rest,
            selectedId: keepSelection(next, s.selectedId),
          }
        }),

      dropMissingPhotos: (existing) =>
        set((s) => {
          if (!s.compass.cells.some((c) => c.photoId && !existing.has(c.photoId))) return s
          const cells = s.compass.cells.map((c) => {
            if (!c.photoId || existing.has(c.photoId)) return c
            const { photoId: _drop, ...rest } = c
            return rest
          })
          return { compass: { ...s.compass, cells } }
        }),
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Sadece pusula kalıcı; seçim ve geçmiş oturuma özel.
      partialize: (s) => ({ compass: s.compass }),
      migrate: (persisted, version) => migratePersisted(persisted, version) as { compass: Compass },
      merge: (persisted, current) => ({
        ...current,
        compass: sanitizeCompass((persisted as { compass?: unknown } | undefined)?.compass),
      }),
    },
  ),
)
