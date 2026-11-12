import { CircleNotch, MagnifyingGlassMinus, MagnifyingGlassPlus } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { cropToJpeg } from '../lib/image'
import { savePhoto } from '../lib/photos'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'

export function CropModal() {
  const crop = useUiStore((s) => s.crop)
  if (!crop) return null
  // key: yeni dosyada durum sıfırlansın
  return <CropDialog key={crop.src} cellId={crop.cellId} src={crop.src} />
}

function CropDialog({ cellId, src }: { cellId: string; src: string }) {
  const titleId = useId()
  const closeCrop = useUiStore((s) => s.closeCrop)
  const showToast = useUiStore((s) => s.showToast)
  const updateCell = useCompassStore((s) => s.updateCell)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [saving, setSaving] = useState(false)
  const saveRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    saveRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeCrop()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [closeCrop])

  const save = async () => {
    if (!area || saving) return
    setSaving(true)
    try {
      const blob = await cropToJpeg(src, area)
      const photoId = await savePhoto(blob)
      updateCell(cellId, { photoId })
      closeCrop()
    } catch {
      showToast('Foto kaydedilemedi. Başka bir görsel dene.', 'error')
      setSaving(false)
    }
  }

  return (
    <div
      data-modal-open
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && !saving && closeCrop()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-lg flex-col gap-4 rounded-t-2xl border-[3px] border-ink bg-surface p-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-brutal-lg sm:rounded-2xl sm:p-5"
      >
        <h2 id={titleId} className="text-lg font-black tracking-tight">
          Fotoğrafı kırp
        </h2>

        <div className="relative aspect-square w-full overflow-hidden rounded-lg border-2 border-ink bg-ink">
          <Cropper
            image={src}
            crop={pos}
            zoom={zoom}
            maxZoom={4}
            aspect={1}
            showGrid={false}
            onCropChange={setPos}
            onZoomChange={setZoom}
            onCropComplete={(_, px) => setArea(px)}
            mediaProps={{ alt: 'Kırpılacak fotoğraf' }}
          />
        </div>

        <div className="flex items-center gap-3">
          <MagnifyingGlassMinus size={20} weight="bold" aria-hidden />
          <label htmlFor={`${titleId}-zoom`} className="sr-only">
            Yakınlaştır
          </label>
          <input
            id={`${titleId}-zoom`}
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-11 flex-1 cursor-pointer accent-ink"
          />
          <MagnifyingGlassPlus size={20} weight="bold" aria-hidden />
        </div>
        <p className="-mt-2 text-sm text-muted">Sürükleyerek konumla, kaydırarak yakınlaştır.</p>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={closeCrop} disabled={saving}>
            Vazgeç
          </button>
          <button
            ref={saveRef}
            type="button"
            className="btn btn-primary min-w-28"
            onClick={save}
            disabled={!area || saving}
          >
            {saving && <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden />}
            {saving ? 'Kaydediliyor' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}
