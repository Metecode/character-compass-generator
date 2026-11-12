import { describe, expect, it } from 'vitest'
import { BULLET_MAX, BULLETS_MAX, NAME_MAX } from '../../constants'
import {
  canAddBullet,
  clampBullet,
  clampBullets,
  clampCellPatch,
  clampName,
  textLength,
  truncate,
} from '../limits'

describe('limitler', () => {
  it('isim NAME_MAX karakterde kesilir', () => {
    const long = 'a'.repeat(NAME_MAX + 5)
    expect(clampName(long)).toHaveLength(NAME_MAX)
    expect(clampName('Ahmet')).toBe('Ahmet')
  })

  it('madde BULLET_MAX karakterde kesilir', () => {
    expect(textLength(clampBullet('x'.repeat(BULLET_MAX * 2)))).toBe(BULLET_MAX)
  })

  it('tam limitte metin değişmez', () => {
    const exact = 'ğ'.repeat(NAME_MAX)
    expect(clampName(exact)).toBe(exact)
  })

  it('emojiyi ortadan bölmez, kod noktası sayar', () => {
    const s = '😀'.repeat(NAME_MAX + 2)
    const out = clampName(s)
    expect(textLength(out)).toBe(NAME_MAX)
    expect(out).toBe('😀'.repeat(NAME_MAX))
    expect(truncate('ab😀c', 3)).toBe('ab😀')
  })

  it('satır sonlarını boşluğa çevirir', () => {
    expect(clampName('Ali\nVeli')).toBe('Ali Veli')
    expect(clampBullet('a\r\nb')).toBe('a b')
  })

  it(`en fazla ${BULLETS_MAX} madde tutulur`, () => {
    const many = ['1', '2', '3', '4', '5']
    expect(clampBullets(many)).toEqual(many.slice(0, BULLETS_MAX))
  })

  it('madde eklenebilirlik limiti', () => {
    expect(canAddBullet([])).toBe(true)
    expect(canAddBullet(Array(BULLETS_MAX - 1).fill('x'))).toBe(true)
    expect(canAddBullet(Array(BULLETS_MAX).fill('x'))).toBe(false)
  })

  it('clampCellPatch sadece verilen alanlara dokunur', () => {
    expect(clampCellPatch({ photoId: 'p1' })).toEqual({ photoId: 'p1' })
    const out = clampCellPatch({ name: 'n'.repeat(99), bullets: Array(9).fill('b'.repeat(99)) })
    expect(out.name).toHaveLength(NAME_MAX)
    expect(out.bullets).toHaveLength(BULLETS_MAX)
    out.bullets!.forEach((b) => expect(b).toHaveLength(BULLET_MAX))
  })
})
