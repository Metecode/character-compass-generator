import { useId } from 'react'
import { DEFAULT_BAND_COLORS, DEFAULT_QUADRANT_COLORS, LABEL_MAX } from '../constants'
import { regionsOf } from '../lib/grid'
import { truncate } from '../lib/limits'
import { useCompassStore } from '../store/compassStore'
import { CharCounter } from './CharCounter'
import { Modal } from './Modal'

const QUADRANT_NAMES = ['Sol üst', 'Sağ üst', 'Sol alt', 'Sağ alt'] as const
const BAND_NAMES = ['Üst satır', 'Orta satır', 'Alt satır'] as const

/** Ek pastel öneriler (varsayılanlara ek). */
const SWATCHES = [
  ...DEFAULT_QUADRANT_COLORS,
  '#FFD6A5',
  '#BDB2FF',
  '#FFC6FF',
  '#9BF6FF',
  '#E4E4E4',
] as const

export function QuadrantSettings({ onClose }: { onClose: () => void }) {
  const uid = useId()
  const compass = useCompassStore((s) => s.compass)
  const setRegion = useCompassStore((s) => s.setRegion)
  const setUppercaseNames = useCompassStore((s) => s.setUppercaseNames)
  const isBands = compass.gridSize === 3
  const regions = regionsOf(compass)
  const NAMES = isBands ? BAND_NAMES : QUADRANT_NAMES
  const defaults = isBands ? DEFAULT_BAND_COLORS : DEFAULT_QUADRANT_COLORS

  return (
    <Modal
      title={isBands ? 'Satır bantları' : 'Bölgeler'}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn"
            onClick={() =>
              defaults.forEach((color, i) => setRegion(i, { color }))
            }
          >
            Varsayılan renkler
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
            Tamam
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        {isBands
          ? 'Her satırın etiketi solda dar bir kutuda dikey yazılır. Hepsi boşsa kutu gösterilmez.'
          : 'Etiketler pusulanın üst ve alt kenarında görünür. Boş bırakırsan bant gösterilmez.'}
      </p>
      <div className={`grid grid-cols-1 gap-3 ${isBands ? '' : 'sm:grid-cols-2'}`}>
        {regions.map((q, i) => (
          <fieldset
            key={i}
            className="flex flex-col gap-2 rounded-xl border-2 border-ink p-3"
            style={{ background: q.color }}
          >
            <legend className="rounded-md border-2 border-ink bg-surface px-1.5 text-xs font-black uppercase">
              {NAMES[i]}
            </legend>
            <div className="flex items-end justify-between">
              <label htmlFor={`${uid}-l${i}`} className="text-xs font-bold">
                Etiket
              </label>
              <CharCounter id={`${uid}-c${i}`} value={q.label ?? ''} max={LABEL_MAX} />
            </div>
            <input
              id={`${uid}-l${i}`}
              className="field"
              value={q.label ?? ''}
              placeholder="ör. Kaotik"
              aria-describedby={`${uid}-c${i}`}
              onChange={(e) => setRegion(i, { label: truncate(e.target.value, LABEL_MAX) })}
            />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${NAMES[i]} rengi`}>
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`size-7 rounded-full border-2 border-ink ${
                    q.color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-ink ring-offset-2' : ''
                  }`}
                  style={{ background: c }}
                  aria-label={`Renk ${c}`}
                  aria-pressed={q.color.toLowerCase() === c.toLowerCase()}
                  onClick={() => setRegion(i, { color: c })}
                />
              ))}
              <label className="relative size-7 cursor-pointer overflow-hidden rounded-full border-2 border-dashed border-ink bg-surface text-center text-sm leading-6 font-black">
                <span aria-hidden>+</span>
                <span className="sr-only">Özel renk seç</span>
                <input
                  type="color"
                  value={q.color}
                  onChange={(e) => setRegion(i, { color: e.target.value })}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset className="mt-4 rounded-xl border-2 border-ink p-3">
        <legend className="rounded-md border-2 border-ink bg-surface px-1.5 text-xs font-black uppercase">
          Görünüm
        </legend>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            className="size-5 shrink-0 cursor-pointer accent-ink"
            checked={compass.uppercaseNames}
            onChange={(e) => setUppercaseNames(e.target.checked)}
          />
          İsimleri büyük harfle yaz
        </label>
      </fieldset>
    </Modal>
  )
}
