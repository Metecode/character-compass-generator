import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenGame } from '../../lib/playApi'

const submitGuess = vi.fn()
const startGame = vi.fn()
vi.mock('../../lib/playApi', async (orig) => ({
  ...(await orig<typeof import('../../lib/playApi')>()),
  submitGuess: (...args: unknown[]) => submitGuess(...args),
  startGame: (...args: unknown[]) => startGame(...args),
  requestHint: vi.fn(),
}))

const { PlayView } = await import('../play/PlayView')
const { GameApiError } = await import('../../lib/apiClient')

// 2x2: üç oynanabilir hücre + bir boş hücre; isimler karışık sırada.
const game: OpenGame = {
  title: 'Sınıf',
  gridSize: 2,
  regions: [{ color: '#FFADAD' }, { color: '#A0C4FF' }, { color: '#CAFFBF' }, { color: '#FDFFB6' }],
  cells: [
    { bullets: ['Gece kuşu'], playable: true, hint: false },
    { bullets: ['Kaos ajanı'], playable: true, hint: true },
    { bullets: [], playable: false, hint: false },
    { bullets: ['Plan bozan'], playable: true, hint: false },
  ],
  names: ['Ali', 'Işıl', 'İlker'],
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  localStorage.clear()
  submitGuess.mockReset()
  startGame.mockReset()
  startGame.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const setup = (props: Partial<React.ComponentProps<typeof PlayView>> = {}) => {
  const onPlayed = vi.fn()
  const onAlreadyPlayed = vi.fn()
  render(
    <PlayView
      code="ABCDEFGHIJKL"
      game={game}
      playerName="Deniz"
      initialHints={{}}
      savedCells={[]}
      onPlayed={onPlayed}
      onAlreadyPlayed={onAlreadyPlayed}
      onChangeName={() => {}}
      {...props}
    />,
  )
  return { onPlayed, onAlreadyPlayed }
}

const cell = (i: number) => document.querySelector(`[data-play-cell="${i}"]`) as HTMLElement
const picker = () => screen.getByRole('dialog', { name: /hücre için isim seç/ })
const pick = (name: string) => fireEvent.click(within(picker()).getByRole('button', { name: new RegExp(`^${name}`) }))

describe('PlayView', () => {
  it('oyuna başlayınca sunucuya başlangıç bildirilir; hata oyunu durdurmaz', async () => {
    startGame.mockRejectedValueOnce(new GameApiError('network'))
    setup()
    await waitFor(() => expect(startGame).toHaveBeenCalled())
    expect(startGame.mock.calls[0]![0]).toBe('ABCDEFGHIJKL')
    expect(screen.getByText('0/3 yerleştirildi')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('oyun sırasında sayaç ya da süre gösterilmez', () => {
    setup()
    expect(screen.queryByText(/\d+ (sn|dk)\b/)).toBeNull()
  })

  it('boş hücre tahmin edilmez (tıklanamaz); ilerleme ve Gönder', () => {
    setup()
    expect(cell(2).getAttribute('role')).toBeNull()
    expect(screen.getByText('0/3 yerleştirildi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gönder' })).toBeDisabled()
  })

  it('isim atanır, listede işaretli görünür, başka hücreye taşınabilir; tümü dolunca Gönder aktif', () => {
    setup()
    fireEvent.click(cell(0))
    pick('Işıl')
    // Seçici sıradaki boş hücreye (1) geçti; Işıl artık "1. hücrede".
    expect(within(picker()).getByText('1. hücrede · buraya taşı')).toBeInTheDocument()
    pick('Işıl') // 1. hücreye taşı
    expect(screen.getByText('1/3 yerleştirildi')).toBeInTheDocument()
    expect(cell(0)).toHaveTextContent('Kim?')
    expect(cell(1)).toHaveTextContent('Işıl')

    fireEvent.click(cell(0))
    pick('Ali')
    pick('İlker') // otomatik olarak 3. hücre
    expect(screen.getByText('3/3 yerleştirildi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gönder' })).toBeEnabled()
  })

  it('ipucu butonu yalnızca bulanık dosyası olan hücrede', () => {
    setup()
    fireEvent.click(cell(0))
    expect(within(picker()).queryByRole('button', { name: 'İpucu' })).toBeNull()
    fireEvent.click(cell(1))
    expect(within(picker()).getByRole('button', { name: 'İpucu' })).toBeInTheDocument()
  })

  const fillAll = () => {
    fireEvent.click(cell(0))
    pick('Ali')
    pick('Işıl')
    pick('İlker')
  }

  it('gönderirken cevaplar hücre sırasıyla gider', async () => {
    submitGuess.mockResolvedValue({ score: { points2: 0, total: 3, cells: [] } })
    const { onPlayed } = setup()
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(onPlayed).toHaveBeenCalled())
    expect(submitGuess.mock.calls[0]!.slice(2)).toEqual(['Deniz', ['Ali', 'Işıl', null, 'İlker']])
  })

  it('ikinci deneme: hata yerine o cihazın sonucu yüklenir', async () => {
    submitGuess.mockRejectedValue(new GameApiError('already_played'))
    const { onAlreadyPlayed } = setup()
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(onAlreadyPlayed).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('hız limiti ve dolu oyun kullanıcı dilinde; ağ hatasında "Tekrar dene"', async () => {
    submitGuess.mockRejectedValueOnce(new GameApiError('rate_limited'))
    setup()
    fillAll()
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Çok fazla deneme yapıldı, biraz sonra tekrar dene.')

    submitGuess.mockRejectedValueOnce(new GameApiError('game_full'))
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Bu oyun doldu.'))

    submitGuess.mockRejectedValueOnce(new GameApiError('network'))
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument())
  })

  it('taslak: yerleştirmeler cihazda saklanır ve geri yüklenir', () => {
    setup()
    fireEvent.click(cell(3))
    pick('Ali')
    cleanup()
    const saved = JSON.parse(localStorage.getItem('compass-play:ABCDEFGHIJKL')!)
    expect(saved).toEqual({ name: 'Deniz', cells: [null, null, null, 'Ali'] })
    setup({ savedCells: saved.cells })
    expect(cell(3)).toHaveTextContent('Ali')
  })
})
