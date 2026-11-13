/**
 * Oda durumunu ne zaman yeniden çekeceğini belirler (ağa dokunmaz; `fetch`
 * dışarıdan verilir, test edilebilir).
 *
 * - Kanal sinyali gelince: 0–jitter ms rastgele bekleyip çeker (16 kişi aynı anda istemesin).
 * - Peş peşe gelen sinyaller tek isteğe iner; iki istek arasında en az `minGapMs`.
 * - Aynı anda tek istek; sürerken gelen talep bitince bir kez daha çeker.
 * - Soket bağlıyken `heartbeatMs`'de bir nabız (çevrimiçi bilgisi, kaçan sinyaller);
 *   koparsa `pollMs`'de bir yoklar. Yeniden bağlanınca hemen çeker.
 */

export interface RoomSyncOptions {
  /** Durumu çeker; hatayı kendisi ele alır (asla fırlatmamalı). */
  fetch: () => Promise<void>
  heartbeatMs: number
  pollMs: number
  jitterMs: number
  minGapMs: number
  random?: () => number
  now?: () => number
}

export class RoomSync {
  private readonly o: Required<RoomSyncOptions>
  private connected = false
  private inFlight = false
  private pending = false
  private stopped = true
  private timer: ReturnType<typeof setTimeout> | null = null
  private dueAt = Infinity
  private lastStart = -Infinity

  constructor(options: RoomSyncOptions) {
    this.o = { random: Math.random, now: Date.now, ...options }
  }

  /** İlk çekiş hemen yapılır. */
  start(): void {
    this.stopped = false
    this.request(0)
  }

  stop(): void {
    this.stopped = true
    this.clear()
  }

  get isConnected(): boolean {
    return this.connected
  }

  /** Soket durumu değişti. Bağlanınca kaçan sinyaller için hemen çeker. */
  setConnected(connected: boolean): void {
    if (connected === this.connected) return
    this.connected = connected
    if (connected) this.request(0)
    else this.request(this.o.pollMs)
  }

  /** Kanal sinyali. */
  signal(): void {
    this.request(Math.floor(this.o.random() * this.o.jitterMs))
  }

  /** Kendi eyleminden sonra ya da sekme görünür olunca: beklemeden çek. */
  refresh(): void {
    this.request(0)
  }

  private clear() {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.dueAt = Infinity
  }

  private request(delay: number): void {
    if (this.stopped) return
    if (this.inFlight) {
      this.pending = true
      return
    }
    const now = this.o.now()
    const at = Math.max(now + delay, this.lastStart + this.o.minGapMs)
    if (at >= this.dueAt) return
    this.clear()
    this.dueAt = at
    this.timer = setTimeout(() => void this.run(), Math.max(0, at - now))
  }

  private async run(): Promise<void> {
    this.clear()
    if (this.stopped) return
    this.inFlight = true
    this.lastStart = this.o.now()
    try {
      await this.o.fetch()
    } finally {
      this.inFlight = false
    }
    if (this.stopped) return
    if (this.pending) {
      this.pending = false
      this.request(0)
    } else {
      this.request(this.connected ? this.o.heartbeatMs : this.o.pollMs)
    }
  }
}
