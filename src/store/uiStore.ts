import { create } from 'zustand'
import { isImageFile } from '../lib/image'

export interface CropRequest {
  cellId: string
  src: string
}

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error' | 'success'
}

export type GameDialog = 'create' | 'mine'
/** Pusula ayar pencereleri (masaüstünde araç çubuğundan, mobilde "⋯" menüsünden açılır). */
export type CompassDialog = 'theme' | 'quadrants' | 'reset'

interface UiState {
  crop: CropRequest | null
  toast: Toast | null
  /** Açık oyun linki penceresi ("Oyun linki oluştur" ya da "Oyunlarım"). */
  gameDialog: GameDialog | null
  setGameDialog: (d: GameDialog | null) => void
  compassDialog: CompassDialog | null
  setCompassDialog: (d: CompassDialog | null) => void
  /**
   * Açık alt sayfa / modal sayısı. Mobil alt çubuk bu 0 değilken gizlenir
   * (düzenleme paneli, kırpma, menüler ve tüm pencereler sayılır).
   */
  overlays: number
  pushOverlay: () => void
  popOverlay: () => void
  /** Dosyayı doğrular ve kırpma modalını açar. */
  openCrop: (cellId: string, file: File | null | undefined) => void
  closeCrop: () => void
  showToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: () => void
}

let toastSeq = 0

/** Kalıcı olmayan arayüz durumu (geri al / kaydet kapsamı dışında). */
export const useUiStore = create<UiState>()((set, get) => ({
  crop: null,
  toast: null,
  gameDialog: null,
  setGameDialog: (gameDialog) => set({ gameDialog }),
  compassDialog: null,
  setCompassDialog: (compassDialog) => set({ compassDialog }),
  overlays: 0,
  pushOverlay: () => set((s) => ({ overlays: s.overlays + 1 })),
  popOverlay: () => set((s) => ({ overlays: Math.max(0, s.overlays - 1) })),

  openCrop: (cellId, file) => {
    if (!isImageFile(file)) {
      get().showToast('Bu dosya bir görsel değil. JPG, PNG veya WebP dene.', 'error')
      return
    }
    get().closeCrop()
    set({ crop: { cellId, src: URL.createObjectURL(file) } })
  },

  closeCrop: () => {
    const c = get().crop
    if (c) URL.revokeObjectURL(c.src)
    set({ crop: null })
  },

  showToast: (message, tone = 'info') => set({ toast: { id: ++toastSeq, message, tone } }),
  dismissToast: () => set({ toast: null }),
}))
