import { CircleNotch, PaperPlaneTilt } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'

import { useIsDesktop } from '../../hooks/useMediaQuery'
import {
  answersOf,
  classifyPlayError,
  clearDraft,
  deviceId,
  nextOpenCell,
  place,
  preferFreeEntry,
  placedCount,
  restorePlacement,
  saveDraft,
  unplace,
  type Placement,
} from '../../lib/play'
import { GameApiError, requestHint, startGame, submitGuess, type OpenGame, type PlayedResult } from '../../lib/playApi'
import { NamePickerPanel, NamePickerSheet, type NamePickerProps } from './NamePicker'
import { PlayBoard } from './PlayBoard'
import { PlayCell } from './PlayCell'

interface Props {
  code: string
  game: OpenGame
  playerName: string
  initialHints: Record<number, string>
  savedCells: (string | null)[]
  onPlayed: (result: PlayedResult, animate: boolean) => void
  /** İkinci deneme: hata yerine bu cihazın sonucunu yeniden yükle. */
  onAlreadyPlayed: () => void
  onChangeName: () => void
}

export function PlayView({ code, game, playerName, initialHints, savedCells, onPlayed, onAlreadyPlayed, onChangeName }: Props) {
  const isDesktop = useIsDesktop()
  const n = game.cells.length
  const playable = useMemo(() => game.cells.map((c) => c.playable), [game.cells])
  const total = playable.filter(Boolean).length
  const [placement, setPlacement] = useState<Placement>(() => restorePlacement(savedCells, game.names, n))
  const [selected, setSelected] = useState<number | null>(null)
  const [hints, setHints] = useState<Record<number, string>>(initialHints)
  const [hintBusy, setHintBusy] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null)

  // Mobilde açık isim seçicinin yüksekliği: sayfa sonuna o kadar boşluk konur ve
  // seçili hücre seçicinin üstünde görünür olacak şekilde kaydırılır.
  const [sheetHeight, setSheetHeight] = useState(0)
  useEffect(() => {
    if (selected === null || isDesktop || sheetHeight === 0) return
    const el = document.querySelector<HTMLElement>(`[data-play-cell="${selected}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    const visibleBottom = window.innerHeight - sheetHeight - 8
    if (r.bottom > visibleBottom || r.top < 8) {
      const scroller = el.closest<HTMLElement>('[data-page-scroll]')
      scroller?.scrollBy({ top: r.bottom > visibleBottom ? r.bottom - visibleBottom : r.top - 8, behavior: 'smooth' })
    }
  }, [selected, sheetHeight, isDesktop])

  // Oyuna başlandı: sunucu başlangıç zamanını bu cihaz için yalnızca ilk seferde
  // yazar (yenileme sıfırlamaz). Başarısız olursa oyun yine oynanır; süre boş kalır.
  useEffect(() => {
    void startGame(code, deviceId()).catch(() => {})
  }, [code])

  const placed = placedCount(placement, playable)
  const complete = placed === total

  // Taslak: isim ve yerleştirmeler cihazda kalır (sayfa yenilenince kaybolmasın).
  useEffect(() => {
    saveDraft(code, { name: playerName, cells: placement.map((e) => (e === null ? null : (game.names[e] ?? null))) })
  }, [code, playerName, placement, game.names])

  const pick = (entry: number) => {
    if (selected === null) return
    const next = place(placement, selected, preferFreeEntry(placement, game.names, selected, entry))
    setPlacement(next)
    setError(null)
    // Sıradaki boş hücreye geç; hepsi dolduysa seçiciyi kapat.
    setSelected(nextOpenCell(next, playable, selected))
  }

  const openHint = async (cell: number) => {
    if (hintBusy !== null) return
    setHintBusy(cell)
    setError(null)
    try {
      const image = await requestHint(code, deviceId(), cell)
      setHints((h) => ({ ...h, [cell]: image }))
    } catch (e) {
      const c = e instanceof GameApiError ? e.code : undefined
      if (c === 'already_played') return onAlreadyPlayed()
      const { kind, message } = classifyPlayError(c)
      setError({ message, retry: kind === 'network' })
    } finally {
      setHintBusy(null)
    }
  }

  const submit = async () => {
    if (!complete || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitGuess(code, deviceId(), playerName, answersOf(placement, game.names, playable))
      clearDraft(code)
      onPlayed(result, true)
    } catch (e) {
      const c = e instanceof GameApiError ? e.code : undefined
      if (c === 'already_played') {
        clearDraft(code)
        return onAlreadyPlayed()
      }
      const { kind, message } = classifyPlayError(c)
      if (kind === 'gone') return onAlreadyPlayed() // yeniden yükle → "Bu oyun artık yok"
      setError({ message, retry: kind === 'network' })
    } finally {
      setSubmitting(false)
    }
  }

  const pickerProps: NamePickerProps | null =
    selected === null
      ? null
      : {
          cell: selected,
          bullets: game.cells[selected]!.bullets,
          names: game.names,
          placement,
          onPick: pick,
          onClear: () => setPlacement((p) => unplace(p, selected)),
          onClose: () => setSelected(null),
          hint: {
            available: game.cells[selected]!.hint,
            used: hints[selected] !== undefined,
            busy: hintBusy === selected,
            onUse: () => openHint(selected),
          },
        }

  const board = (
    <PlayBoard
      gridSize={game.gridSize}
      regions={game.regions}
      renderCell={(i, color, scale) => {
        const c = game.cells[i]!
        const e = placement[i] ?? null
        return (
          <PlayCell
            index={i}
            color={color}
            scale={scale}
            bullets={c.bullets}
            playable={c.playable}
            assigned={e === null ? null : (game.names[e] ?? null)}
            hint={hints[i] ?? null}
            selected={selected === i}
            onSelect={setSelected}
          />
        )
      }}
    />
  )

  const submitBar = (
    <div className="flex flex-col gap-2">
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-danger bg-surface px-3 py-2 text-sm font-bold text-danger">
          <span className="flex-1">{error.message}</span>
          {error.retry && (
            <button type="button" className="btn" onClick={submit} disabled={!complete || submitting}>
              Tekrar dene
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black tabular-nums" aria-live="polite">
            {placed}/{total} yerleştirildi
          </p>
          <div className="mt-1 h-2 overflow-hidden rounded-full border border-ink/30 bg-paper" aria-hidden>
            <div className="h-full bg-ink transition-[width] duration-200" style={{ width: `${(placed / Math.max(1, total)) * 100}%` }} />
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary min-w-28"
          onClick={submit}
          disabled={!complete || submitting}
          aria-busy={submitting}
        >
          {submitting ? (
            <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
          ) : (
            <PaperPlaneTilt size={20} weight="bold" aria-hidden />
          )}
          Gönder
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{game.title || 'Bu kim?'}</h1>
        <p className="text-sm text-muted">
          Merhaba <strong className="text-ink">{playerName}</strong> ·{' '}
          <button type="button" className="underline" onClick={onChangeName}>
            adı değiştir
          </button>
          <br />
          Bir hücreye dokun, kim olduğunu seç. Hepsini yerleştirince gönder.
        </p>
      </div>

      {isDesktop ? (
        <div className="flex items-start gap-6">
          <div className="min-w-0 flex-1">{board}</div>
          <aside className="sticky top-4 flex w-[360px] shrink-0 flex-col gap-4 rounded-2xl border-[3px] border-ink bg-surface p-5 shadow-brutal">
            {pickerProps ? (
              <NamePickerPanel {...pickerProps} />
            ) : (
              <p className="text-sm text-muted">Bir hücre seç; isim listesi burada açılır.</p>
            )}
            <div className="border-t-2 border-ink/10 pt-4">{submitBar}</div>
          </aside>
        </div>
      ) : (
        <>
          {board}
          <div className="sticky bottom-0 z-30 -mx-4 border-t-[3px] border-ink bg-surface px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            {submitBar}
          </div>
          {pickerProps && <NamePickerSheet {...pickerProps} onHeight={setSheetHeight} />}
          <div aria-hidden style={{ height: selected === null ? 0 : sheetHeight }} />
        </>
      )}
    </div>
  )
}
