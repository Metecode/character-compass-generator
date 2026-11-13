import { CircleNotch, FastForward, PencilSimple, ShareNetwork } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { canShareFiles, downloadBlob, fileNameFor, renderNodePng } from '../../lib/exportPng'
import { scoreLabel } from '../../lib/play'
import type { PlayedResult } from '../../lib/playApi'
import { PlayBoard } from './PlayBoard'
import { PlayCell } from './PlayCell'
import { Ranking } from './Ranking'
import { ScoreCard } from './ScoreCard'

const STEP_MS = 450

interface Props {
  result: PlayedResult
  /** Hücreler sırayla açılsın mı (yeni gönderildiyse evet; linki yeniden açınca hayır). */
  animate: boolean
}

export function ResultView({ result, animate }: Props) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const coarse = useMediaQuery('(pointer: coarse)')
  // Açılış sırası: okuma sırasıyla içi dolu hücreler.
  const order = useMemo(
    () => result.cells.flatMap((c, i) => (c.name || c.bullets.length > 0 ? [i] : [])),
    [result.cells],
  )
  const [revealed, setRevealed] = useState(() => (animate && !reduceMotion ? 0 : order.length))
  const done = revealed >= order.length
  const revealedSet = useMemo(() => new Set(order.slice(0, revealed)), [order, revealed])

  useEffect(() => {
    if (done) return
    const t = window.setTimeout(() => setRevealed((r) => r + 1), revealed === 0 ? 300 : STEP_MS)
    return () => window.clearTimeout(t)
  }, [revealed, done])

  const { points2, total } = result.score
  const label = scoreLabel(points2, total)

  // Skor kartı: yalnızca paylaşırken ekran dışında çizilir.
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sharing) return
    let cancelled = false
    ;(async () => {
      try {
        await new Promise((r) => requestAnimationFrame(() => r(null)))
        const node = cardRef.current
        if (!node) throw new Error('card')
        const blob = await renderNodePng(node)
        if (cancelled) return
        const name = `skor-${fileNameFor(result.title || 'pusula')}`
        if (coarse && canShareFiles()) {
          const file = new File([blob], name, { type: 'image/png' })
          try {
            await navigator.share({ files: [file], title: `${label} bildim!` })
          } catch (e) {
            if (!(e instanceof DOMException && e.name === 'AbortError')) downloadBlob(blob, name)
          }
        } else {
          downloadBlob(blob, name)
        }
      } catch {
        if (!cancelled) setShareError('Skor kartı oluşturulamadı. Tekrar dener misin?')
      } finally {
        if (!cancelled) setSharing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sharing, coarse, label, result.title])

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border-[3px] border-ink bg-surface p-5 shadow-brutal-lg">
        <p className="text-sm font-bold text-muted">{result.title || 'Bu kim?'}</p>
        <p className="mt-1 text-4xl font-black tracking-tight" aria-live="polite">
          {done ? (
            <>
              {label} <span className="bg-accent px-1">bildin!</span>
            </>
          ) : (
            'Cevaplar açılıyor…'
          )}
        </p>
        <p className="mt-1 text-sm text-muted">
          {result.playerName} olarak oynadın. İpucu açılan hücreler doğruysa yarım puan sayıldı.
        </p>
        {!done && (
          <button type="button" className="btn mt-3" onClick={() => setRevealed(order.length)}>
            <FastForward size={18} weight="bold" aria-hidden />
            Animasyonu geç
          </button>
        )}
      </div>

      <PlayBoard
        gridSize={result.gridSize}
        regions={result.regions}
        renderCell={(i, color, scale) => {
          const cell = result.cells[i]!
          const s = result.score.cells[i] ?? null
          const open = revealedSet.has(i)
          return (
            <PlayCell
              index={i}
              color={color}
              scale={scale}
              bullets={cell.bullets}
              playable={s !== null}
              assigned={s?.guess ?? null}
              hint={null}
              selected={false}
              reveal={
                open
                  ? { name: cell.name, photo: cell.photo, correct: s ? s.correct : null, hinted: s?.hinted ?? false, guess: s?.guess ?? null }
                  : null
              }
            />
          )
        }}
      />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => setSharing(true)} disabled={sharing} aria-busy={sharing}>
          {sharing ? (
            <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
          ) : (
            <ShareNetwork size={20} weight="bold" aria-hidden />
          )}
          Skorumu paylaş
        </button>
        <a href="/" className="btn">
          <PencilSimple size={20} weight="bold" aria-hidden />
          Kendi pusulanı yap
        </a>
      </div>
      {shareError && (
        <p role="alert" className="text-sm font-bold text-danger">
          {shareError}
        </p>
      )}

      <section aria-labelledby="ranking-title" className="flex flex-col gap-2">
        <h2 id="ranking-title" className="text-lg font-black tracking-tight">
          Sıralama
        </h2>
        <Ranking rows={result.ranking} total={total} />
      </section>

      {sharing &&
        createPortal(
          <div aria-hidden className="pointer-events-none fixed top-0 -left-[20000px]">
            <ScoreCard ref={cardRef} title={result.title} points2={points2} total={total} />
          </div>,
          document.body,
        )}
    </div>
  )
}
