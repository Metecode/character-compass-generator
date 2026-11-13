import { Check, CircleNotch, Eye, X } from '@phosphor-icons/react'
import { useLayoutEffect, useRef } from 'react'
import { useSheetFrame } from '../../hooks/useSheetFrame'

export interface NamePickerProps {
  cell: number
  bullets: string[]
  names: readonly string[]
  /** Hücre → isim girişi. */
  placement: readonly (number | null)[]
  onPick: (entry: number) => void
  onClear: () => void
  onClose: () => void
  hint: { available: boolean; used: boolean; busy: boolean; onUse: () => void }
}

/** Seçici içeriği: maddeler, isim listesi, ipucu. Mobil ve masaüstü aynı içeriği kullanır. */
function PickerBody({ cell, bullets, names, placement, onPick, onClear, hint }: Omit<NamePickerProps, 'onClose'>) {
  const current = placement[cell] ?? null
  const cellOf = (entry: number) => placement.findIndex((e) => e === entry)

  return (
    <div className="flex flex-col gap-4">
      {bullets.length > 0 && (
        <ul className="rounded-lg bg-paper px-3 py-2 text-sm font-bold">
          {bullets.map((b, i) => (
            <li key={i}>- {b}</li>
          ))}
        </ul>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-black tracking-wide uppercase">Bu kim?</legend>
        <ul className="grid grid-cols-2 gap-2">
          {names.map((name, entry) => {
            const at = cellOf(entry)
            const here = at === cell
            const elsewhere = at >= 0 && !here
            return (
              <li key={entry}>
                <button
                  type="button"
                  aria-pressed={here}
                  onClick={() => onPick(entry)}
                  className={`flex min-h-12 w-full items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-left text-base font-bold transition-[transform,box-shadow] duration-150 active:translate-x-0.5 active:translate-y-0.5 ${
                    here
                      ? 'border-ink bg-accent shadow-brutal-sm'
                      : elsewhere
                        ? 'border-ink/30 bg-paper text-ink/70'
                        : 'border-ink bg-surface shadow-brutal-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-brutal'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{name}</span>
                    {elsewhere && (
                      <span className="block text-xs font-medium">
                        {at + 1}. hücrede · buraya taşı
                      </span>
                    )}
                  </span>
                  {here && <Check size={18} weight="bold" className="shrink-0" aria-hidden />}
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        {current !== null && (
          <button type="button" className="btn" onClick={onClear}>
            <X size={18} weight="bold" aria-hidden />
            Bu hücreyi boşalt
          </button>
        )}
        {hint.available && !hint.used && (
          <button type="button" className="btn" onClick={hint.onUse} disabled={hint.busy} aria-busy={hint.busy}>
            {hint.busy ? (
              <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden />
            ) : (
              <Eye size={18} weight="bold" aria-hidden />
            )}
            İpucu
          </button>
        )}
      </div>
      {hint.available && (
        <p className="text-xs text-muted">
          {hint.used
            ? 'İpucu açıldı: bu hücreyi doğru bilirsen yarım puan alırsın.'
            : 'İpucu bulanık fotoğrafı açar; o hücreyi doğru bilirsen yarım puan sayılır.'}
        </p>
      )}
    </div>
  )
}

/**
 * Mobil: alttan açılan sayfa (güvenli alan ve görünür alan Aşama 0'daki gibi).
 * Arka plan kilitlenmez: ızgara sayfanın arkasında kaydırılabilir kalır, böylece
 * her hücreye ulaşılır. Yüksekliği `onHeight` ile bildirilir (sayfa sonuna boşluk).
 */
export function NamePickerSheet({ onHeight, ...props }: NamePickerProps & { onHeight?: (h: number) => void }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const frame = useSheetFrame(true)
  useLayoutEffect(() => {
    const el = sheetRef.current
    if (!el || !onHeight) return
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight + frame.bottom))
    ro.observe(el)
    return () => {
      ro.disconnect()
      onHeight(0)
    }
  }, [onHeight, frame.bottom])
  return (
    <div
      ref={sheetRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${props.cell + 1}. hücre için isim seç`}
      className="animate-sheet-in fixed inset-x-0 z-40 flex flex-col rounded-t-2xl border-t-[3px] border-ink bg-surface shadow-[0_-6px_0_0_rgb(18_18_18/0.12)]"
      style={{ bottom: frame.bottom, maxHeight: frame.maxHeight }}
    >
      <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-ink/25" aria-hidden />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-ink/10 px-4 pt-2 pb-3">
        <h2 className="text-lg font-black tracking-tight">{props.cell + 1}. hücre</h2>
        <button type="button" className="btn btn-icon" aria-label="Kapat" onClick={props.onClose}>
          <X size={20} weight="bold" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <PickerBody {...props} />
      </div>
    </div>
  )
}

/** Masaüstü: ızgaranın yanında panel. */
export function NamePickerPanel(props: NamePickerProps) {
  return (
    <section aria-label={`${props.cell + 1}. hücre için isim seç`} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-black tracking-tight">{props.cell + 1}. hücre</h2>
        <button type="button" className="btn btn-icon" aria-label="Kapat" onClick={props.onClose}>
          <X size={20} weight="bold" aria-hidden />
        </button>
      </div>
      <PickerBody {...props} />
    </section>
  )
}
