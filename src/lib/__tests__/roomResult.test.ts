import { describe, expect, it } from 'vitest'
import { useCompassStore } from '../../store/compassStore'
import { ROOM_COMPASS_TITLE, deletesInText, ranksOf, roomCompass, winnersOf } from '../roomResult'

const players = new Map([
  ['a', { name: 'Ayşe' }],
  ['b', { name: 'Burak' }],
  ['c', { name: 'Ceren' }],
])

describe('canlı oda sonucu → düzenleyici', () => {
  const cells = [
    { cell: 0, playerId: 'b', items: [{ key: 1, text: 'kahveci' }] },
    { cell: 4, playerId: 'a', items: [] },
    { cell: 8, playerId: 'c', items: [0, 1, 2].map((k) => ({ key: k, text: `madde ${k}` })) },
  ]

  it('hücre yerleri, adlar, maddeler ve indirilen fotoğraflar korunur; boş hücreler boş', () => {
    const c = roomCompass(3, cells, players, new Map([['a', 'foto-a']]))
    expect(c.gridSize).toBe(3)
    expect(c.title).toBe(ROOM_COMPASS_TITLE)
    expect(c.cells).toHaveLength(9)
    expect(c.cells[0]).toMatchObject({ name: 'Burak', bullets: ['kahveci'] })
    expect(c.cells[0]!.photoId).toBeUndefined()
    expect(c.cells[4]).toMatchObject({ name: 'Ayşe', bullets: [], photoId: 'foto-a' })
    expect(c.cells[8]!.bullets).toEqual(['madde 0', 'madde 1', 'madde 2'])
    for (const i of [1, 2, 3, 5, 6, 7]) expect(c.cells[i]).toMatchObject({ name: '', bullets: [] })
    expect(new Set(c.cells.map((x) => x.id)).size).toBe(9)
  })

  it('store pusulayı doğrulayarak yükler ve geri alınabilir', () => {
    const st = () => useCompassStore.getState()
    st().reset()
    const before = st().compass
    st().loadCompass(roomCompass(2, [{ cell: 3, playerId: 'c', items: [{ key: 0, text: 'x' }] }], players, new Map()))
    expect(st().compass.gridSize).toBe(2)
    expect(st().compass.cells[3]).toMatchObject({ name: 'Ceren', bullets: ['x'] })
    st().undo()
    expect(st().compass).toEqual(before)
  })
})

describe('kazananlar ve sıra', () => {
  it('en yüksek puan; eşitlikte hepsi; herkes 0 ise kazanan yok', () => {
    expect(winnersOf([{ playerId: 'a', score: 3 }, { playerId: 'b', score: 1 }])).toEqual({ ids: ['a'], score: 3 })
    expect(winnersOf([{ playerId: 'a', score: 2 }, { playerId: 'b', score: 2 }]).ids).toEqual(['a', 'b'])
    expect(winnersOf([{ playerId: 'a', score: 0 }])).toEqual({ ids: [], score: 0 })
  })

  it('eşit puan aynı sırayı alır', () => {
    const s = [5, 3, 3, 1].map((score, i) => ({ playerId: String(i), score }))
    expect(ranksOf(s)).toEqual([1, 2, 2, 4])
  })
})

describe('silinme notu', () => {
  it('dakika yukarı yuvarlanır; son dakikada "birazdan"', () => {
    expect(deletesInText(30 * 60_000)).toBe('Bu oda 30 dakika sonra silinir.')
    expect(deletesInText(29 * 60_000 + 1)).toBe('Bu oda 30 dakika sonra silinir.')
    expect(deletesInText(59_000)).toBe('Bu oda birazdan silinir.')
    expect(deletesInText(-5)).toBe('Bu oda birazdan silinir.')
  })
})
