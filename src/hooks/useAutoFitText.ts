import { useLayoutEffect, type DependencyList, type RefObject } from 'react'

const overflows = (el: HTMLElement) =>
  el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 0.5

/**
 * Kutuya sığana kadar font boyutunu max'tan min'e 1px adımlarla düşürür.
 * Kutu overflow:hidden ve sabit/maks. yüksekliğe sahip olmalı. Ölçüm transform'dan
 * etkilenmez (scroll/client boyutları layout boyutlarıdır), bu yüzden ölçeklenmiş
 * tuvalde de doğru çalışır. Min'de hâlâ taşıyorsa kelime içinden kırılmaya izin verir.
 */
export function useAutoFitText(
  ref: RefObject<HTMLElement | null>,
  max: number,
  min: number,
  deps: DependencyList,
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      el.style.overflowWrap = 'normal'
      let size = max
      el.style.fontSize = `${size}px`
      while (size > min && overflows(el)) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
      if (overflows(el)) el.style.overflowWrap = 'anywhere'
    }

    fit()
    let alive = true
    // Fontlar geç yüklenirse ölçüler değişir.
    void document.fonts?.ready.then(() => alive && fit())
    // Ebeveyni izle: kutunun kendisi font ile büyüyüp küçülebilir (döngüye girmesin).
    const ro = new ResizeObserver(() => fit())
    ro.observe(el.parentElement ?? el)
    return () => {
      alive = false
      ro.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, max, min, ...deps])
}
