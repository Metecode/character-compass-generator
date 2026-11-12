import { beforeEach, describe, expect, it } from 'vitest'
import { GAMES_STORAGE_KEY } from '../../constants'
import { isExpired, remainingLabel, useGamesStore, type SavedGame } from '../gamesStore'

const game = (code: string, inMs: number): SavedGame => ({
  code,
  title: 'Test',
  expiresAt: new Date(Date.now() + inMs).toISOString(),
  deleteToken: 't'.repeat(43),
  createdAt: new Date().toISOString(),
})

beforeEach(() => {
  localStorage.clear()
  useGamesStore.setState({ games: [] })
})

describe('gamesStore', () => {
  it('ekler, aynı kodu tekrar eklemez, siler', () => {
    const { addGame, removeGame } = useGamesStore.getState()
    addGame(game('AAAAAAAAAAAAAAAA', 60_000))
    addGame(game('AAAAAAAAAAAAAAAA', 120_000))
    addGame(game('BBBBBBBBBBBBBBBB', 60_000))
    expect(useGamesStore.getState().games.map((g) => g.code)).toEqual(['BBBBBBBBBBBBBBBB', 'AAAAAAAAAAAAAAAA'])
    removeGame('BBBBBBBBBBBBBBBB')
    expect(useGamesStore.getState().games).toHaveLength(1)
  })

  it('kendi anahtarına yazar; pusula kaydına dokunmaz', () => {
    useGamesStore.getState().addGame(game('AAAAAAAAAAAAAAAA', 60_000))
    const raw = JSON.parse(localStorage.getItem(GAMES_STORAGE_KEY)!)
    expect(raw.state.games[0].deleteToken).toBe('t'.repeat(43))
  })

  it('süresi dolanları atar', () => {
    useGamesStore.setState({ games: [game('OLD0000000000000', -1), game('NEW0000000000000', 60_000)] })
    useGamesStore.getState().pruneExpired()
    expect(useGamesStore.getState().games.map((g) => g.code)).toEqual(['NEW0000000000000'])
  })

  it('bozuk kayıtları yüklerken atar', async () => {
    localStorage.setItem(
      GAMES_STORAGE_KEY,
      JSON.stringify({ state: { games: [{ code: 1 }, game('OK00000000000000', 60_000), 'x'] }, version: 1 }),
    )
    await useGamesStore.persist.rehydrate()
    expect(useGamesStore.getState().games.map((g) => g.code)).toEqual(['OK00000000000000'])
  })
})

describe('remainingLabel', () => {
  const now = Date.parse('2026-11-13T10:00:00Z')
  const at = (ms: number) => new Date(now + ms).toISOString()
  it('saat ve dakika', () => {
    expect(remainingLabel(at(23 * 3600_000 + 5 * 60_000), now)).toBe('23 sa 5 dk kaldı')
    expect(remainingLabel(at(12 * 60_000 + 30_000), now)).toBe('12 dk kaldı')
    expect(remainingLabel(at(30_000), now)).toBe('1 dakikadan az kaldı')
    expect(remainingLabel(at(0), now)).toBe('Süresi doldu')
    expect(isExpired({ expiresAt: at(0) }, now)).toBe(true)
  })
})
