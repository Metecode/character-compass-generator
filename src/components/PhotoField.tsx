import { Camera, X } from '@phosphor-icons/react'
import { useRef } from 'react'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'

interface Props {
  cellId: string
}

/** Kompakt foto alanı: küçük resme dokununca dosya seçilir, köşedeki X kaldırır. */
export function PhotoField({ cellId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const photoId = useCompassStore((s) => s.compass.cells.find((c) => c.id === cellId)?.photoId)
  const updateCell = useCompassStore((s) => s.updateCell)
  const openCrop = useUiStore((s) => s.openCrop)
  const url = usePhotoUrl(photoId)

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        className="flex size-[4.75rem] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border-2 border-ink bg-paper text-xs font-bold text-muted shadow-brutal-sm transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-brutal active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        aria-label={photoId ? 'Fotoğrafı değiştir' : 'Foto seç'}
        onClick={() => inputRef.current?.click()}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <>
            <Camera size={24} weight="bold" aria-hidden />
            Foto
          </>
        )}
      </button>
      {photoId && (
        <button
          type="button"
          className="absolute -top-2.5 -right-2.5 flex size-8 items-center justify-center rounded-full border-2 border-ink bg-surface text-danger"
          aria-label="Fotoğrafı kaldır"
          onClick={() => updateCell(cellId, { photoId: undefined })}
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          openCrop(cellId, e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}
