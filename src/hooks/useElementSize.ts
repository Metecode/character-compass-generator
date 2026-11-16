import { useLayoutEffect, useState } from 'react'

/**
 * Bir düğümün içerik kutusu boyutu (ResizeObserver ile güncel). Callback ref
 * döner: düğüm sonradan bağlansa da (ör. masaüstüne geçince) ölçüm başlar.
 */
export function useElementSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    if (!el) return
    const update = () => {
      const width = Math.round(el.clientWidth)
      const height = Math.round(el.clientHeight)
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])

  return [setEl, size]
}
