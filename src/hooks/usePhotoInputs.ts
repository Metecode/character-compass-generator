import { useEffect } from 'react'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'

/**
 * Global foto girdileri:
 * - Panodan yapıştırma (Ctrl+V): seçili hücreye kırpma modalını açar.
 * - Hücre dışına dosya bırakılırsa tarayıcının dosyayı açmasını engeller.
 */
export function usePhotoInputs(): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (useUiStore.getState().crop) return
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((it) => it.kind === 'file' && it.type.startsWith('image/'))
        ?.getAsFile()
      if (!file) return // metin yapıştırmaya karışma
      e.preventDefault()
      const { selectedId } = useCompassStore.getState()
      if (!selectedId) {
        useUiStore.getState().showToast('Fotoğrafı yapıştırmak için önce bir hücre seç.')
        return
      }
      useUiStore.getState().openCrop(selectedId, file)
    }

    const blockFileDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }

    window.addEventListener('paste', onPaste)
    window.addEventListener('dragover', blockFileDrop)
    window.addEventListener('drop', blockFileDrop)
    return () => {
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('dragover', blockFileDrop)
      window.removeEventListener('drop', blockFileDrop)
    }
  }, [])
}
