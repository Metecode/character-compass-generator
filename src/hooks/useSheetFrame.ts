import { useEffect, useState } from 'react'
import { sheetFrame, type SheetFrame } from '../lib/viewport'

const measure = (): SheetFrame => {
  const root = document.documentElement
  return sheetFrame(root.clientWidth, root.clientHeight, window.visualViewport)
}

/**
 * Alt sayfanın konumunu ve yüksekliğini görünür alana (visualViewport) göre
 * günceller: klavye açılınca panel klavyenin hemen üstüne oturur.
 */
export function useSheetFrame(active: boolean): SheetFrame {
  const [frame, setFrame] = useState(measure)

  useEffect(() => {
    if (!active) return
    const vv = window.visualViewport
    let raf = 0
    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const next = measure()
        setFrame((prev) =>
          prev.bottom === next.bottom &&
          prev.maxHeight === next.maxHeight &&
          prev.keyboard === next.keyboard
            ? prev
            : next,
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
  }, [active])

  return frame
}

/**
 * Panel açıkken arka plan sayfasının kaymasını engeller. Panelin içi kaymaya
 * devam eder; iki parmak (yakınlaştırma) hareketlerine dokunulmaz.
 */
export function useBackgroundScrollLock(active: boolean, sheet: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    const prev = { html: root.style.overflow, body: document.body.style.overflow }
    root.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) return
      if (sheet.current?.contains(e.target as Node)) return
      if (e.cancelable) e.preventDefault()
    }
    // Klavye kapanınca iOS'un kaydırdığı sayfayı yerine döndür.
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!sheet.current?.contains(document.activeElement) && window.scrollY !== 0) {
          window.scrollTo(0, 0)
        }
      })
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('focusout', onFocusOut)
    return () => {
      root.style.overflow = prev.html
      document.body.style.overflow = prev.body
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [active, sheet])
}
