import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SHEET_TOP_GAP } from '../../lib/viewport'
import { useBackgroundScrollLock, useSheetFrame } from '../useSheetFrame'

/** jsdom'da visualViewport yok: iOS'taki gibi davranan sahte bir tane. */
class FakeVisualViewport extends EventTarget {
  height = 852
  offsetTop = 0
  scale = 1
  width = 393
  set(patch: Partial<Pick<FakeVisualViewport, 'height' | 'offsetTop' | 'scale'>>) {
    Object.assign(this, patch)
    this.dispatchEvent(new Event('resize'))
  }
}

let vv: FakeVisualViewport

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
  vv = new FakeVisualViewport()
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  // Layout viewport (klavyeyle küçülmez).
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(393)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(852)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'visualViewport')
})

const flush = () => act(() => vi.advanceTimersToNextFrame())

describe('useSheetFrame (visualViewport)', () => {
  it('klavye açılınca paneli klavyenin üstüne taşır, kapanınca geri alır', () => {
    const { result } = renderHook(() => useSheetFrame(true))
    flush()
    expect(result.current.bottom).toBe(0)
    expect(result.current.keyboard).toBe(false)

    act(() => vv.set({ height: 516 }))
    flush()
    expect(result.current).toEqual({ bottom: 336, maxHeight: 516 - SHEET_TOP_GAP, keyboard: true })

    // iOS odaklanan alanı göstermek için sayfayı kaydırır: scroll olayı.
    act(() => {
      vv.offsetTop = 100
      vv.dispatchEvent(new Event('scroll'))
    })
    flush()
    expect(result.current.bottom).toBe(852 - (100 + 516))

    act(() => vv.set({ height: 852, offsetTop: 0 }))
    flush()
    expect(result.current.bottom).toBe(0)
    expect(result.current.keyboard).toBe(false)
  })

  it('panel kapalıyken dinlemez, kapanınca dinleyicileri kaldırır', () => {
    const add = vi.spyOn(vv, 'addEventListener')
    const remove = vi.spyOn(vv, 'removeEventListener')
    const { rerender, unmount } = renderHook(({ on }) => useSheetFrame(on), {
      initialProps: { on: false },
    })
    expect(add).not.toHaveBeenCalled()
    rerender({ on: true })
    expect(add).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(add).toHaveBeenCalledWith('scroll', expect.any(Function))
    unmount()
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})

describe('useBackgroundScrollLock', () => {
  const touchMove = (target: EventTarget, touches = 1) => {
    const e = new Event('touchmove', { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'touches', { value: { length: touches } })
    target.dispatchEvent(e)
    return e
  }

  it('arka planı kilitler; panel içi ve iki parmak hareketleri serbest; kapanınca eski hale döner', () => {
    const sheet = document.createElement('div')
    const inner = document.createElement('input')
    sheet.append(inner)
    const outside = document.createElement('div')
    document.body.append(sheet, outside)
    document.documentElement.style.overflow = ''

    const { rerender } = renderHook(({ on }) => useBackgroundScrollLock(on, { current: sheet }), {
      initialProps: { on: true },
    })
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')
    expect(touchMove(outside).defaultPrevented).toBe(true)
    expect(touchMove(inner).defaultPrevented).toBe(false)
    expect(touchMove(outside, 2).defaultPrevented).toBe(false)

    rerender({ on: false })
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(touchMove(outside).defaultPrevented).toBe(false)
    sheet.remove()
    outside.remove()
  })
})
