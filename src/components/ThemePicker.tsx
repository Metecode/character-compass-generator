import { Check, Info } from '@phosphor-icons/react'
import { THEMES, getTheme, type Theme } from '../data/themes'
import { reflowCells } from '../lib/grid'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'
import { Modal } from './Modal'

/** Temanın önerilen boyuttaki renk düzeninin küçük önizlemesi. */
function ThemePreview({ theme }: { theme: Theme }) {
  if (theme.suggestedSize === 3) {
    return (
      <div className="grid size-12 shrink-0 grid-rows-3 gap-0.5 overflow-hidden rounded-md border-2 border-ink bg-ink">
        {theme.bands.map((b, i) => (
          <span key={i} style={{ background: b.color }} />
        ))}
      </div>
    )
  }
  return (
    <div className="grid size-12 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-md border-2 border-ink bg-ink">
      {theme.quadrants.map((q, i) => (
        <span key={i} style={{ background: q.color }} />
      ))}
    </div>
  )
}

export function ThemePicker({ onClose }: { onClose: () => void }) {
  const themeId = useCompassStore((s) => s.compass.themeId)
  const gridSize = useCompassStore((s) => s.compass.gridSize)
  const cells = useCompassStore((s) => s.compass.cells)
  const applyTheme = useCompassStore((s) => s.applyTheme)
  const setGridSize = useCompassStore((s) => s.setGridSize)
  const showToast = useUiStore((s) => s.showToast)

  const active = getTheme(themeId)
  const suggested = active.suggestedSize
  const dropCount = suggested === gridSize ? 0 : reflowCells(cells, suggested).dropped.length

  return (
    <Modal
      title="Tema"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose} data-autofocus>
          Tamam
        </button>
      }
    >
      <p className="mb-4 text-sm text-muted">
        Tema renkleri, etiketleri ve zarın getirdiği maddeleri değiştirir. Kartlarına dokunmaz.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Temalar">
        {THEMES.map((t) => {
          const selected = t.id === active.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                if (!selected) applyTheme(t)
              }}
              className={`flex min-h-16 items-center gap-3 rounded-xl border-2 border-ink p-2.5 text-left transition-[transform,box-shadow,background-color] duration-150 ${
                selected
                  ? 'bg-accent shadow-brutal-sm'
                  : 'bg-surface hover:-translate-x-px hover:-translate-y-px hover:shadow-brutal-sm'
              }`}
            >
              <ThemePreview theme={t} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-1.5 text-base font-black">
                  {t.name}
                  {selected && <Check size={16} weight="bold" aria-hidden />}
                </span>
                <span className="text-xs leading-snug text-ink/75">{t.description}</span>
                <span className="mt-0.5 text-[11px] font-bold tracking-wide text-ink/60 uppercase">
                  Önerilen {t.suggestedSize}×{t.suggestedSize}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {suggested !== gridSize && (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border-2 border-ink bg-paper p-3 sm:flex-row sm:items-center">
          <p className="flex flex-1 items-start gap-2 text-sm">
            <Info size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
            <span>
              {active.name} için önerilen boyut {suggested}×{suggested}; şu an {gridSize}×{gridSize}.
              {dropCount > 0 && (
                <strong className="text-danger"> Geçersen {dropCount} kart sığmaz ve kaldırılır.</strong>
              )}
            </span>
          </p>
          <button
            type="button"
            className={`btn shrink-0 ${dropCount > 0 ? 'border-danger text-danger' : ''}`}
            onClick={() => {
              setGridSize(suggested)
              if (dropCount > 0) showToast(`${dropCount} kart kaldırıldı. Geri al ile geri getirebilirsin.`)
            }}
          >
            {suggested}×{suggested} boyutuna geç
          </button>
        </div>
      )}
    </Modal>
  )
}
