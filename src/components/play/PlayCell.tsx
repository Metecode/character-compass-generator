import { Check, Question, X } from '@phosphor-icons/react'
import { useRef } from 'react'
import {
  BULLET_FONT_MAX,
  BULLET_FONT_MIN,
  CELL_GAP,
  CELL_PADDING,
  CELL_PHOTO,
  NAME_FONT_MAX,
  NAME_FONT_MIN,
} from '../../constants'
import { useAutoFitText } from '../../hooks/useAutoFitText'

export interface PlayCellReveal {
  name: string
  photo: string | null
  /** Oynanabilir hücrede doğru mu; oynanmayan hücrede null. */
  correct: boolean | null
  hinted: boolean
  guess: string | null
}

interface Props {
  index: number
  color: string
  /** Hücre içi ölçü çarpanı (4x4 = 1). */
  scale: number
  bullets: string[]
  playable: boolean
  /** Oyuncunun bu hücreye koyduğu isim. */
  assigned: string | null
  /** Açılmış ipucu (bulanık foto, data URL). */
  hint: string | null
  selected: boolean
  onSelect?: (index: number) => void
  /** Sonuç ekranında açıldıysa gerçek isim ve foto. */
  reveal?: PlayCellReveal | null
}

const GOOD = '#1f9d55'
const BAD = '#c81e1e'

/**
 * Tahmin oyunu hücresi (1080 tuvalinde). Foto ve isim kapalı, maddeler açık.
 * Sonuçta foto + doğru isim açılır; doğru yeşil, yanlış kırmızı çerçeve.
 */
export function PlayCell({ index, color, scale, bullets, playable, assigned, hint, selected, onSelect, reveal }: Props) {
  const px = (v: number) => Math.round(v * scale)
  const photo = px(CELL_PHOTO)
  const nameRef = useRef<HTMLDivElement>(null)
  const bulletsRef = useRef<HTMLUListElement>(null)
  const shownName = reveal ? reveal.name : assigned
  const photoUrl = reveal?.photo ?? null
  const showPhotoBox = Boolean(reveal ? photoUrl : playable)

  useAutoFitText(nameRef, px(NAME_FONT_MAX), px(NAME_FONT_MIN), [shownName, showPhotoBox])
  useAutoFitText(bulletsRef, px(BULLET_FONT_MAX), px(BULLET_FONT_MIN), [bullets.join('\n'), showPhotoBox, reveal?.correct])

  const empty = bullets.length === 0 && !reveal?.name
  const interactive = playable && !reveal && onSelect
  const verdict = reveal?.correct ?? null

  const label = reveal
    ? `Hücre ${index + 1}: ${reveal.name || 'boş'}${verdict === null ? '' : verdict ? ', doğru' : `, yanlış (tahminin: ${reveal.guess ?? '-'})`}`
    : playable
      ? `Hücre ${index + 1}: ${assigned ?? 'isim seçilmedi'}. ${bullets.join(', ')}`
      : `Hücre ${index + 1}: ${empty ? 'boş' : bullets.join(', ')}`

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label}
      aria-pressed={interactive ? selected : undefined}
      onClick={interactive ? () => onSelect(index) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(index)
              }
            }
          : undefined
      }
      data-play-cell={index}
      className={`group relative flex min-h-0 min-w-0 flex-col overflow-hidden outline-none select-none ${
        interactive ? 'cursor-pointer touch-manipulation' : ''
      }`}
      style={{ background: color, padding: px(CELL_PADDING), gap: px(CELL_GAP) }}
    >
      {!empty && (
        <div
          className="flex min-w-0 items-center"
          // Sonuçta sağ üstteki doğru/yanlış rozeti isimle çakışmasın.
          style={{ gap: px(CELL_GAP), paddingRight: reveal && verdict !== null ? px(48) : 0 }}
        >
          {showPhotoBox && (
            <div
              className={`relative flex shrink-0 items-center justify-center overflow-hidden border-ink ${
                photoUrl ? 'animate-pop-in bg-white/60' : 'border-dashed bg-white/40 text-ink/40'
              }`}
              style={{ width: photo, height: photo, borderWidth: px(3) }}
            >
              {photoUrl ? (
                <img src={photoUrl} alt="" draggable={false} className="block size-full object-cover" data-cell-photo />
              ) : hint ? (
                <img
                  src={hint}
                  alt=""
                  draggable={false}
                  className="block size-full scale-110 object-cover"
                  style={{ filter: `blur(${px(6)}px)` }}
                />
              ) : (
                <Question size={px(56)} weight="bold" aria-hidden />
              )}
            </div>
          )}
          {shownName ? (
            <div
              ref={nameRef}
              className={`min-w-0 flex-1 overflow-hidden leading-[1.05] font-black tracking-tight break-normal ${
                reveal ? 'animate-pop-in' : ''
              }`}
              style={{ maxHeight: showPhotoBox ? photo : photo * 0.8 }}
            >
              {shownName}
            </div>
          ) : (
            playable && (
              <div
                className="min-w-0 flex-1 font-black tracking-tight text-ink/40"
                style={{ fontSize: px(NAME_FONT_MAX * 0.85) }}
              >
                Kim?
              </div>
            )
          )}
        </div>
      )}

      {bullets.length > 0 && (
        <ul ref={bulletsRef} className="min-h-0 flex-1 overflow-hidden leading-[1.18] font-bold">
          {bullets.map((b, i) => (
            <li key={i} className="pl-[0.7em] -indent-[0.7em]">
              - {b}
            </li>
          ))}
        </ul>
      )}

      {reveal && verdict === false && (
        <p className="shrink-0 truncate font-bold text-[#8a1414]" style={{ fontSize: px(18) }}>
          Tahminin: {reveal.guess ?? '-'}
        </p>
      )}

      {/* Doğru / yanlış çerçevesi ve rozeti */}
      {reveal && verdict !== null && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: `inset 0 0 0 ${px(8)}px ${verdict ? GOOD : BAD}` }}
          />
          <div
            aria-hidden
            className="animate-pop-in absolute flex items-center justify-center gap-1 rounded-full border-ink font-black text-white"
            style={{
              top: px(10),
              right: px(10),
              height: px(44),
              minWidth: px(44),
              padding: `0 ${px(8)}px`,
              borderWidth: px(3),
              background: verdict ? GOOD : BAD,
              fontSize: px(20),
            }}
          >
            {verdict ? <Check size={px(24)} weight="bold" /> : <X size={px(24)} weight="bold" />}
            {verdict && reveal.hinted && <span>½</span>}
          </div>
        </>
      )}

      {/* Seçim ve odak çerçevesi */}
      {interactive && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 transition-[box-shadow] duration-150 ${
            selected
              ? 'shadow-[inset_0_0_0_6px_var(--color-focus)]'
              : 'group-hover:shadow-[inset_0_0_0_4px_rgb(18_18_18/0.35)] group-focus-visible:shadow-[inset_0_0_0_6px_var(--color-focus)]'
          }`}
        />
      )}
    </div>
  )
}
