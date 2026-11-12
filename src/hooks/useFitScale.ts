import { useLayoutEffect, useState, type RefObject } from 'react'

/** Sabit boyutlu bir düğümü kapsayıcıya sığdıracak ölçeği hesaplar. */
export function useFitScale(containerRef: RefObject<HTMLElement | null>, size: number): number {
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const { width, height } = el.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      setScale(Math.min(width / size, height / size))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [containerRef, size])

  return scale
}
