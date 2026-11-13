import { describe, expect, it } from 'vitest'
import { MENU_MARGIN, menuPosition } from '../menuPosition'

const menu = { width: 288, height: 120 }

describe('menuPosition', () => {
  it('sağda yer varsa düğmenin sağ kenarına hizalanır', () => {
    const p = menuPosition({ left: 1100, right: 1180, bottom: 50 }, menu, { width: 1440, height: 900 })
    expect(p).toEqual({ left: 1180 - 288, top: 58 })
  })

  it('soldan taşacaksa düğmenin sol kenarına hizalanır', () => {
    const p = menuPosition({ left: 20, right: 100, bottom: 50 }, menu, { width: 1440, height: 900 })
    expect(p.left).toBe(20)
  })

  it('hiçbir boyutta ekran dışına çıkmaz', () => {
    for (const width of [320, 360, 390, 430, 640, 800, 1440]) {
      for (const bx of [0, 40, width / 2, width - 60, width - 10]) {
        const p = menuPosition({ left: bx, right: bx + 50, bottom: 50 }, menu, { width, height: 700 })
        expect(p.left).toBeGreaterThanOrEqual(MENU_MARGIN)
        if (width >= menu.width + 2 * MENU_MARGIN) {
          expect(p.left + menu.width).toBeLessThanOrEqual(width - MENU_MARGIN)
        }
      }
    }
  })

  it('alttan taşacaksa yukarı kayar', () => {
    const p = menuPosition({ left: 100, right: 200, bottom: 650 }, menu, { width: 800, height: 700 })
    expect(p.top + menu.height).toBeLessThanOrEqual(700 - MENU_MARGIN)
  })
})
