import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'

/** Bileşen açıkken "üstte bir alt sayfa/modal var" diye sayılır (mobil alt çubuk gizlenir). */
export function useOverlay(active = true): void {
  const push = useUiStore((s) => s.pushOverlay)
  const pop = useUiStore((s) => s.popOverlay)
  useEffect(() => {
    if (!active) return
    push()
    return pop
  }, [active, push, pop])
}
