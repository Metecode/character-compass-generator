import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { GAMES_STORAGE_KEY } from '../constants'

/**
 * Bu cihazda oluşturulan oyun linkleri. Silme anahtarı (delete_token) yalnızca
 * burada durur; sunucuda özeti var. Pusula kaydından (compassStore) ayrıdır,
 * böylece pusula şeması ve STORE_VERSION etkilenmez.
 */
export interface SavedGame {
  code: string
  title: string
  expiresAt: string
  deleteToken: string
  createdAt: string
}

interface GamesState {
  games: SavedGame[]
  addGame: (g: SavedGame) => void
  removeGame: (code: string) => void
  /** Süresi dolanları listeden atar (sunucu zaten siliyor). */
  pruneExpired: (now?: number) => void
}

const isSavedGame = (v: unknown): v is SavedGame => {
  if (typeof v !== 'object' || v === null) return false
  const g = v as Record<string, unknown>
  return (
    typeof g.code === 'string' &&
    typeof g.title === 'string' &&
    typeof g.expiresAt === 'string' &&
    typeof g.deleteToken === 'string' &&
    typeof g.createdAt === 'string' &&
    !Number.isNaN(Date.parse(g.expiresAt))
  )
}

export const isExpired = (g: Pick<SavedGame, 'expiresAt'>, now = Date.now()): boolean =>
  Date.parse(g.expiresAt) <= now

export const useGamesStore = create<GamesState>()(
  persist(
    (set) => ({
      games: [],
      addGame: (g) => set((s) => ({ games: [g, ...s.games.filter((x) => x.code !== g.code)] })),
      removeGame: (code) => set((s) => ({ games: s.games.filter((g) => g.code !== code) })),
      pruneExpired: (now = Date.now()) =>
        set((s) => {
          const games = s.games.filter((g) => !isExpired(g, now))
          return games.length === s.games.length ? s : { games }
        }),
    }),
    {
      name: GAMES_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ games: s.games }),
      merge: (persisted, current) => {
        const raw = (persisted as { games?: unknown } | undefined)?.games
        const games = Array.isArray(raw) ? raw.filter(isSavedGame) : []
        return { ...current, games: games.filter((g) => !isExpired(g)) }
      },
    },
  ),
)

/** "23 sa 5 dk kaldı" / "12 dk kaldı" / "1 dakikadan az kaldı" */
export function remainingLabel(expiresAt: string, now = Date.now()): string {
  const ms = Date.parse(expiresAt) - now
  if (ms <= 0) return 'Süresi doldu'
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin < 1) return '1 dakikadan az kaldı'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} sa ${m} dk kaldı` : `${m} dk kaldı`
}
