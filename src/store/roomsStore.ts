import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { ROOMS_STORAGE_KEY } from '../constants'

/**
 * Bu cihazın canlı oda oturumları. Oturum anahtarı yalnızca burada durur
 * (sunucuda özeti var); sayfa yenilenince ya da bağlantı kopunca oyuncu aynı
 * yerine bununla döner. Pusula kaydından ayrıdır (STORE_VERSION etkilenmez).
 */
export interface SavedRoom {
  code: string
  session: string
  playerId: string
  savedAt: number
}

/** Oda en geç 2 saatte silinir; daha eski kayıtlar işe yaramaz. */
const MAX_AGE_MS = 3 * 3600_000

interface RoomsState {
  rooms: SavedRoom[]
  saveRoom: (r: Omit<SavedRoom, 'savedAt'>) => void
  forgetRoom: (code: string) => void
}

const isSavedRoom = (v: unknown): v is SavedRoom => {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r.code === 'string' &&
    typeof r.session === 'string' &&
    typeof r.playerId === 'string' &&
    typeof r.savedAt === 'number'
  )
}

export const useRoomsStore = create<RoomsState>()(
  persist(
    (set) => ({
      rooms: [],
      saveRoom: (r) =>
        set((s) => ({ rooms: [{ ...r, savedAt: Date.now() }, ...s.rooms.filter((x) => x.code !== r.code)] })),
      forgetRoom: (code) => set((s) => ({ rooms: s.rooms.filter((r) => r.code !== code) })),
    }),
    {
      name: ROOMS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ rooms: s.rooms }),
      merge: (persisted, current) => {
        const raw = (persisted as { rooms?: unknown } | undefined)?.rooms
        const now = Date.now()
        const rooms = Array.isArray(raw) ? raw.filter(isSavedRoom).filter((r) => now - r.savedAt < MAX_AGE_MS) : []
        return { ...current, rooms }
      },
    },
  ),
)

export const savedRoomOf = (code: string): SavedRoom | undefined =>
  useRoomsStore.getState().rooms.find((r) => r.code === code)
