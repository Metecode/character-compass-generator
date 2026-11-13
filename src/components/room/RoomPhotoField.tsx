import { Camera, UserCircle } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { isImageFile } from '../../lib/image'
import { useUiStore } from '../../store/uiStore'
import { PhotoCropDialog } from '../CropModal'

export const OWN_PHOTO_WARNING = 'Yalnızca kendi fotoğrafını yükle.'

/**
 * Oyuncunun kendi fotoğrafı: dosya seç → kare kırp (400×400 JPEG) → önizleme.
 * Fotoğraf yalnızca oda kurulunca / odaya girilince sunucuya gider.
 */
export function RoomPhotoField({
  value,
  onChange,
  invalid,
  onCroppingChange,
}: {
  value: Blob | null
  onChange: (blob: Blob) => void
  invalid?: boolean
  /** Kırpma penceresi açık mı (üstteki Modal Escape ile kapanmasın diye). */
  onCroppingChange?: (cropping: boolean) => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const showToast = useUiStore((s) => s.showToast)

  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  useEffect(() => {
    onCroppingChange?.(cropSrc !== null)
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc)
    }
  }, [cropSrc, onCroppingChange])

  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-bold">
        Fotoğrafın
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={`flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] bg-paper ${
            invalid ? 'border-danger' : 'border-ink'
          }`}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-help`}
          onClick={() => inputRef.current?.click()}
        >
          {preview ? (
            <img src={preview} alt="Seçtiğin fotoğraf" className="size-full object-cover" />
          ) : (
            <UserCircle size={44} weight="bold" aria-hidden />
          )}
        </button>
        <div className="flex flex-col items-start gap-1">
          <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
            <Camera size={20} weight="bold" aria-hidden />
            {value ? 'Değiştir' : 'Fotoğraf seç'}
          </button>
        </div>
      </div>
      <p id={`${id}-help`} className={`text-xs ${invalid ? 'font-bold text-danger' : 'text-muted'}`}>
        {invalid ? `Bir fotoğraf seç. ${OWN_PHOTO_WARNING}` : `${OWN_PHOTO_WARNING} Oyun bitince silinir.`}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!isImageFile(file)) {
            if (file) showToast('Bu dosya bir görsel değil. JPG, PNG veya WebP dene.', 'error')
            return
          }
          setCropSrc(URL.createObjectURL(file))
        }}
      />
      {cropSrc && (
        <PhotoCropDialog
          key={cropSrc}
          src={cropSrc}
          onCancel={() => setCropSrc(null)}
          onSave={(blob) => {
            onChange(blob)
            setCropSrc(null)
          }}
        />
      )}
    </div>
  )
}
