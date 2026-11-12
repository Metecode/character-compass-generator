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

interface UiState {
  crop: CropRequest | null
  toast: Toast | null
  /** Açık oyun linki penceresi ("Oyun linki oluştur" ya da "Oyunlarım"). */
  gameDialog: GameDialog | null
  setGameDialog: (d: GameDialog | null) => void
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
