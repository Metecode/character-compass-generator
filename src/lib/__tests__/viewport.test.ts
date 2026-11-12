import { describe, expect, it } from 'vitest'
import {
  KEYBOARD_THRESHOLD,
  SHEET_TOP_GAP,
  defaultSheetHeight,
  panelTitle,
  revealDelta,
  sheetFrame,
} from '../viewport'

// iPhone 15: 393 x 852 layout viewport; klavye ~336 px.
const W = 393
const H = 852

describe('sheetFrame', () => {
  it('visualViewport yoksa altta durur, varsayılan yükseklik', () => {
    expect(sheetFrame(W, H, null)).toEqual({
      bottom: 0,
      maxHeight: Math.round(defaultSheetHeight(W, H)),
      keyboard: false,
    })
  })

  it('klavye kapalıyken altta, varsayılan yükseklikte', () => {
    const f = sheetFrame(W, H, { height: H, offsetTop: 0, scale: 1 })
    expect(f.bottom).toBe(0)
    expect(f.keyboard).toBe(false)
    expect(f.maxHeight).toBe(Math.round(Math.max(H * 0.6, H - W - 72)))
  })

  it('klavye açılınca panelin altı klavyenin üstüne oturur, arada boşluk kalmaz', () => {
    const vv = { height: 516, offsetTop: 0, scale: 1 }
    const f = sheetFrame(W, H, vv)
    expect(f.bottom).toBe(H - 516) // 336: klavye yüksekliği
    expect(f.keyboard).toBe(true)
    // Panelin üst kenarı görünür alanın içinde kalır, alt bölümler kesilmez.
    expect(f.maxHeight).toBe(516 - SHEET_TOP_GAP)
    expect(H - f.bottom - f.maxHeight).toBeGreaterThanOrEqual(vv.offsetTop)
  })

  it('iOS sayfayı kaydırdığında (offsetTop > 0) panel yine görünür alanın altında', () => {
    const vv = { height: 516, offsetTop: 120, scale: 1 }
    const f = sheetFrame(W, H, vv)
    // Görünür alanın alt kenarı layout viewport'ta 636. px'de.
    expect(H - f.bottom).toBe(636)
    expect(H - f.bottom - f.maxHeight).toBe(120 + SHEET_TOP_GAP)
  })

  it('adres çubuğu gibi küçük daralmalar klavye sayılmaz ama yükseklik sınırlanır', () => {
    const f = sheetFrame(W, H, { height: H - 60, offsetTop: 0, scale: 1 })
    expect(60).toBeLessThan(KEYBOARD_THRESHOLD)
    expect(f.keyboard).toBe(false)
    expect(f.bottom).toBe(60)
    expect(f.maxHeight).toBeLessThanOrEqual(H - 60 - SHEET_TOP_GAP)
  })

  it('kullanıcı yakınlaştırmışsa (pinch zoom) konuma dokunmaz', () => {
    const f = sheetFrame(W, H, { height: 300, offsetTop: 200, scale: 2 })
    expect(f.bottom).toBe(0)
    expect(f.keyboard).toBe(false)
  })
})

describe('revealDelta', () => {
  const box = { top: 100, bottom: 400 }

  it('görünür öğe için 0', () => {
    expect(revealDelta({ top: 150, bottom: 200 }, box)).toBe(0)
  })

  it('alttan taşan öğe için aşağı kaydırır', () => {
    expect(revealDelta({ top: 380, bottom: 430 }, box, 12)).toBe(430 - (400 - 12))
  })

  it('üstten taşan öğe için yukarı kaydırır', () => {
    expect(revealDelta({ top: 60, bottom: 110 }, box, 12)).toBe(60 - (100 + 12))
  })

  it('kapsayıcıdan büyük öğenin üst kenarını gösterir', () => {
    expect(revealDelta({ top: 500, bottom: 1000 }, box, 12)).toBe(500 - 112)
  })
})

describe('panelTitle', () => {
  it('ismi gösterir, boşsa "Yeni kişi"', () => {
    expect(panelTitle('Deniz')).toBe('Deniz')
    expect(panelTitle('  İpek ')).toBe('İpek')
    expect(panelTitle('')).toBe('Yeni kişi')
    expect(panelTitle('   ')).toBe('Yeni kişi')
    expect(panelTitle(undefined)).toBe('Yeni kişi')
  })
})
