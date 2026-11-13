import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DraftSaver, type SaveStatus } from '../draftSaver'
import { GameApiError, type ItemDraft, type SaveItemsResult } from '../roomApi'

const ok: SaveItemsResult = { flagged: [], advanced: false }

function setup(save = vi.fn(async (_items: ItemDraft[], _opts: { ready?: boolean; keepalive?: boolean }) => ok)) {
  const statuses: SaveStatus[] = []
  const results: SaveItemsResult[] = []
  const saver = new DraftSaver(
    {
      save,
      debounceMs: 1500,
      retryMs: 3000,
      onStatus: (s) => statuses.push(s),
      onResult: (r) => results.push(r),
      isFatal: (e) => e instanceof GameApiError && e.code === 'not_writing',
    },
    [
      { target: 't1', slot: 0, text: 'eski' },
      { target: 't2', slot: 0, text: '' },
    ],
  )
  return { saver, save, statuses, results }
}

describe('taslak kaydı', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('yazmaya ara verince bir kez kaydeder, tüm maddeleri gönderir', async () => {
    const { saver, save, statuses } = setup()
    saver.update('t1', 0, 'y')
    await vi.advanceTimersByTimeAsync(1000)
    saver.update('t1', 0, 'ye')
    await vi.advanceTimersByTimeAsync(1000)
    saver.update('t1', 0, 'yeni')
    await vi.advanceTimersByTimeAsync(1499)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0]).toEqual([
      { target: 't1', slot: 0, text: 'yeni' },
      { target: 't2', slot: 0, text: '' },
    ])
    expect(save.mock.calls[0]![1]).toEqual({ keepalive: false })
    expect(statuses.at(-1)).toBe('saved')
  })

  it('flush beklemeden gönderir; değişiklik yoksa göndermez', async () => {
    const { saver, save } = setup()
    await saver.flush()
    expect(save).not.toHaveBeenCalled()
    saver.update('t2', 0, 'odak kaybı')
    await saver.flush({ keepalive: true })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![1]).toEqual({ keepalive: true })
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('istek sürerken gelen değişiklik, istek bitince ayrıca gönderilir', async () => {
    let release!: () => void
    const save = vi.fn(
      (_items: ItemDraft[]) =>
        new Promise<SaveItemsResult>((r) => {
          release = () => r(ok)
        }),
    )
    const { saver } = setup(save)
    saver.update('t1', 0, 'a')
    const first = saver.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1)
    saver.update('t1', 0, 'ab')
    const second = saver.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(1)
    release()
    await first
    await vi.advanceTimersByTimeAsync(0)
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1]![0][0]).toEqual({ target: 't1', slot: 0, text: 'ab' })
    release()
    await second
  })

  it('hata olursa yeniden dener; süre bittiyse durur', async () => {
    const save = vi
      .fn<(items: ItemDraft[], opts: object) => Promise<SaveItemsResult>>()
      .mockRejectedValueOnce(new GameApiError('network'))
      .mockResolvedValueOnce(ok)
    const { saver, statuses } = setup(save)
    saver.update('t1', 0, 'x')
    await vi.advanceTimersByTimeAsync(1500)
    expect(statuses.at(-1)).toBe('error')
    await vi.advanceTimersByTimeAsync(3000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(statuses.at(-1)).toBe('saved')

    save.mockRejectedValueOnce(new GameApiError('not_writing'))
    saver.update('t1', 0, 'xy')
    await vi.advanceTimersByTimeAsync(1500)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(3)
    saver.update('t1', 0, 'xyz')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(save).toHaveBeenCalledTimes(3)
  })

  it('hazır olurken bekleyen taslak da gider; sonuç döner', async () => {
    const { saver, save, results } = setup()
    saver.update('t1', 0, 'son hali')
    const r = await saver.setReady(true)
    expect(r).toEqual(ok)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0][0]!.text).toBe('son hali')
    expect(save.mock.calls[0]![1]).toEqual({ ready: true })
    expect(results).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('hazır olma başarısızsa hata fırlatır, taslak bekler', async () => {
    const save = vi.fn().mockRejectedValueOnce(new GameApiError('network')).mockResolvedValue(ok)
    const { saver } = setup(save)
    saver.update('t1', 0, 'z')
    await expect(saver.setReady(true)).rejects.toThrow()
    expect(saver.hasPending).toBe(true)
  })
})
