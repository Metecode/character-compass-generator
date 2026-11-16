import { useEffect, useState } from 'react'
import { roomFrameBox, type FrameBox } from '../lib/viewport'

const measure = (): FrameBox => roomFrameBox(document.documentElement.clientHeight, window.visualViewport)

/** Oda çerçevesinin kutusunu görünür alana (visualViewport) göre günceller. */
export function useFrameBox(): FrameBox {
  const [box, setBox] = useState(measure)

  useEffect(() => {
    const vv = window.visualViewport
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const next = measure()
        setBox((prev) =>
          prev.top === next.top && prev.height === next.height && prev.keyboard === next.keyboard ? prev : next,
        )
      })
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return box
}
