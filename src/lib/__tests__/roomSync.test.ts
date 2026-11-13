import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomSync } from '../roomSync'

const OPTS = { heartbeatMs: 60_000, pollMs: 5_000, jitterMs: 300, minGapMs: 1_000 }

function setup(random = () => 0.5) {
  let resolve: (() => void) | null = null
  const fetch = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r
      }),
  )
  const sync = new RoomSync({ ...OPTS, fetch, random, now: () => Date.now() })
  /** Süren isteği bitirir ve mikro görevlerin işlenmesini bekler. */
  const finish = async () => {
    resolve?.()
    resolve = null
    await vi.advanceTimersByTimeAsync(0)
  }
  return { sync, fetch, finish }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('RoomSync', () => {
  it('başlayınca hemen çeker; bağlı değilken 5 sn yoklar', async () => {
    const { sync, fetch, finish } = setup()
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(1)
    await finish()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    sync.stop()
  })

  it('bağlıyken 60 sn nabız; bağlanınca kaçanlar için hemen çeker', async () => {
    const { sync, fetch, finish } = setup()
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    await finish()
    await vi.advanceTimersByTimeAsync(2_000)
    sync.setConnected(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetch).toHaveBeenCalledTimes(2)
    await finish()
    await vi.advanceTimersByTimeAsync(59_999)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(3)
    sync.stop()
  })

  it('kopunca yoklamaya döner', async () => {
    const { sync, fetch, finish } = setup()
    sync.setConnected(true)
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    await finish()
    sync.setConnected(false)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(fetch).toHaveBeenCalledTimes(2)
    sync.stop()
  })

  it('peş peşe sinyaller tek isteğe iner, rastgele gecikmeyle', async () => {
    const { sync, fetch, finish } = setup(() => 0.5)
    sync.setConnected(true)
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    await finish()
    await vi.advanceTimersByTimeAsync(5_000)
    for (let i = 0; i < 10; i++) sync.signal()
    await vi.advanceTimersByTimeAsync(149)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    await finish()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetch).toHaveBeenCalledTimes(2)
    sync.stop()
  })

  it('iki istek arasında en az 1 sn; istek sürerken gelen sinyal bitince bir kez çeker', async () => {
    const { sync, fetch, finish } = setup(() => 0)
    sync.setConnected(true)
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    sync.signal()
    sync.signal()
    await vi.advanceTimersByTimeAsync(200)
    await finish() // ilk istek 200 ms sürdü
    await vi.advanceTimersByTimeAsync(799)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    await finish()
    sync.stop()
  })

  it('durunca bir daha çekmez', async () => {
    const { sync, fetch, finish } = setup()
    sync.start()
    await vi.advanceTimersByTimeAsync(0)
    sync.stop()
    await finish()
    sync.signal()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
