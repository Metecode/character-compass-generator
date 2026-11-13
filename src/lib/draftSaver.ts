import type { ItemDraft, SaveItemsResult } from './roomApi'

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export const draftKey = (target: string, slot: number): string => `${target}:${slot}`

interface Options {
  save: (items: ItemDraft[], opts: { ready?: boolean; keepalive?: boolean }) => Promise<SaveItemsResult>
  /** Yazmaya ara verdikten bu kadar sonra kaydet. */
  debounceMs: number
  /** Kayıt başarısızsa bu kadar sonra yeniden dene. */
  retryMs: number
  onStatus: (s: SaveStatus) => void
  onResult: (r: SaveItemsResult) => void
  /** true dönerse kayıt durur (ör. süre bitti, oda yok). */
  isFatal: (e: unknown) => boolean
}

/**
 * Canlı odada maddelerin taslak kaydı. Yazdıkça `update`; kayıt debounce ile,
 * odak kaybında ve süre sonunda `flush` ile hemen. Aynı anda tek istek gider;
 * istek sürerken gelen değişiklik bittiğinde gönderilir. Her kayıtta oyuncunun
 * tüm maddeleri (en fazla 3) gönderilir; sunucu yalnızca değişeni yazar.
 */
export class DraftSaver {
  private items = new Map<string, ItemDraft>()
  private dirty = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private running: Promise<unknown> | null = null
  private stopped = false
  private readonly opts: Options

  constructor(opts: Options, initial: readonly ItemDraft[]) {
    this.opts = opts
    for (const it of initial) this.items.set(draftKey(it.target, it.slot), { ...it })
  }

  update(target: string, slot: number, text: string): void {
    if (this.stopped) return
    this.items.set(draftKey(target, slot), { target, slot, text })
    this.dirty = true
    this.opts.onStatus('pending')
    this.schedule(this.opts.debounceMs)
  }

  get hasPending(): boolean {
    return this.dirty
  }

  /** Bekleyen değişikliği hemen gönderir. */
  async flush({ keepalive = false }: { keepalive?: boolean } = {}): Promise<void> {
    this.clearTimer()
    await this.idle()
    if (!this.dirty || this.stopped) return
    await this.run(() => this.send({ keepalive }))
  }

  /** Hazır durumunu değiştirir; maddeler de birlikte gider. Hata fırlatır. */
  async setReady(ready: boolean): Promise<SaveItemsResult> {
    this.clearTimer()
    await this.idle()
    return this.run(async () => {
      const sent = this.snapshot()
      const wasDirty = this.dirty
      this.dirty = false
      this.opts.onStatus('saving')
      try {
        const r = await this.opts.save(sent, { ready })
        this.opts.onResult(r)
        this.opts.onStatus(this.dirty ? 'pending' : 'saved')
        if (this.dirty) this.schedule(this.opts.debounceMs)
        return r
      } catch (e) {
        this.dirty = this.dirty || wasDirty
        this.opts.onStatus(this.dirty ? 'pending' : 'idle')
        throw e
      }
    })
  }

  stop(): void {
    this.stopped = true
    this.clearTimer()
  }

  private snapshot(): ItemDraft[] {
    return [...this.items.values()].map((it) => ({ ...it }))
  }

  private async idle(): Promise<void> {
    while (this.running) await this.running.catch(() => undefined)
  }

  private run<T>(task: () => Promise<T>): Promise<T> {
    const p = task()
    this.running = p
    const clear = () => {
      if (this.running === p) this.running = null
    }
    p.then(clear, clear)
    return p
  }

  private async send({ keepalive }: { keepalive: boolean }): Promise<void> {
    const sent = this.snapshot()
    this.dirty = false
    this.opts.onStatus('saving')
    try {
      const r = await this.opts.save(sent, { keepalive })
      this.opts.onResult(r)
      this.opts.onStatus(this.dirty ? 'pending' : 'saved')
      if (this.dirty) this.schedule(this.opts.debounceMs)
    } catch (e) {
      this.dirty = true
      if (this.opts.isFatal(e)) {
        this.stop()
        this.opts.onStatus('error')
        return
      }
      this.opts.onStatus('error')
      this.schedule(this.opts.retryMs)
    }
  }

  private schedule(ms: number): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, ms)
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }
}
