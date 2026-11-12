import { useRef } from 'react'
import {
  BULLET_FONT_MAX,
  BULLET_FONT_MIN,
  CELL_GAP,
  CELL_PHOTO,
  NAME_FONT_MAX,
  NAME_FONT_MIN,
} from '../constants'
import { useAutoFitText } from '../hooks/useAutoFitText'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import type { Cell } from '../types'

interface Props {
  cell: Cell
  /** Hücre içi ölçü çarpanı (4x4 = 1). */
  scale: number
  uppercase: boolean
}

/**
 * Hücrenin görünen içeriği (foto, isim, maddeler). Pusuladaki etkileşimli hücre
 * ve düzenleme panelindeki canlı önizleme aynı çizimi kullanır.
 */
export function CellFace({ cell, scale, uppercase }: Props) {
  const px = (v: number) => Math.round(v * scale)
  const photo = px(CELL_PHOTO)
  const nameRef = useRef<HTMLDivElement>(null)
  const bulletsRef = useRef<HTMLUListElement>(null)
  const bullets = cell.bullets.filter((b) => b.trim() !== '')
  const hasPhoto = Boolean(cell.photoId)
  const photoUrl = usePhotoUrl(cell.photoId)

  useAutoFitText(nameRef, px(NAME_FONT_MAX), px(NAME_FONT_MIN), [cell.name, hasPhoto, uppercase])
  useAutoFitText(bulletsRef, px(BULLET_FONT_MAX), px(BULLET_FONT_MIN), [bullets.join('\n'), hasPhoto])

  return (
    <>
      <div className="flex min-w-0 items-center" style={{ gap: px(CELL_GAP) }}>
        {hasPhoto && (
          <div
            className="shrink-0 overflow-hidden border-ink bg-white/60"
            style={{ width: photo, height: photo, borderWidth: px(3) }}
          >
            {photoUrl && (
              <img
                src={photoUrl}
                alt=""
                draggable={false}
                className="block size-full object-cover"
                data-cell-photo
              />
            )}
          </div>
        )}
        {cell.name.trim() !== '' && (
          <div
            ref={nameRef}
            className={`min-w-0 flex-1 overflow-hidden leading-[1.05] font-black tracking-tight break-normal ${uppercase ? 'uppercase' : ''}`}
            style={{ maxHeight: hasPhoto ? photo : photo * 0.8 }}
          >
            {cell.name}
          </div>
        )}
      </div>

      {bullets.length > 0 && (
        <ul ref={bulletsRef} className="min-h-0 flex-1 overflow-hidden leading-[1.18] font-bold">
          {bullets.map((b, i) => (
            <li key={i} className="pl-[0.7em] -indent-[0.7em]">
              - {b}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
