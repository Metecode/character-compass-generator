import { Image as ImageIcon, Trash, UploadSimple } from '@phosphor-icons/react'
import { useId, useRef } from 'react'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'

interface Props {
  cellId: string
}

export function PhotoField({ cellId }: Props) {
  const uid = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const photoId = useCompassStore((s) => s.compass.cells.find((c) => c.id === cellId)?.photoId)
  const updateCell = useCompassStore((s) => s.updateCell)
  const openCrop = useUiStore((s) => s.openCrop)
  const url = usePhotoUrl(photoId)

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${uid}-label`} className="text-sm font-black tracking-wide uppercase">
        Foto
      </span>
      <div className="flex items-center gap-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-ink bg-paper">
          {url ? (
            <img src={url} alt="Hücre fotoğrafı" className="size-full object-cover" />
          ) : (
            <ImageIcon size={28} className="text-muted" aria-hidden />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <UploadSimple size={18} weight="bold" aria-hidden />
            {photoId ? 'Değiştir' : 'Foto seç'}
          </button>
          {photoId && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => updateCell(cellId, { photoId: undefined })}
            >
              <Trash size={18} weight="bold" aria-hidden />
              Kaldır
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-labelledby={`${uid}-label`}
          onChange={(e) => {
            openCrop(cellId, e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
      <p className="hidden text-xs text-muted sm:block">
        İpucu: Fotoğrafı hücreye sürükleyebilir ya da kopyalayıp Ctrl+V ile yapıştırabilirsin.
      </p>
    </div>
  )
}
