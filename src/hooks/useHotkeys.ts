import { useEffect } from 'react'
import { useCompassStore } from '../store/compassStore'

/**
 * Ctrl/Cmd+Z: geri al, Ctrl/Cmd+Shift+Z veya Ctrl+Y: ileri al.
 * Metin alanlarında da uygulama geçmişi kullanılır (alanlar store'a bağlı olduğu
 * için tarayıcının kendi geri alması tutarsız çalışır). Modal açıkken devre dışı.
 */
export function useHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (document.querySelector('[data-modal-open]')) return
      const k = e.key.toLowerCase()
      const { undo, redo } = useCompassStore.getState()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((k === 'z' && e.shiftKey) || (k === 'y' && !e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
