import {
  ArrowCounterClockwise,
  CircleNotch,
  DownloadSimple,
  Palette,
  ShareNetwork,
  Swatches,
} from '@phosphor-icons/react'
import { Suspense, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { canShareFiles, downloadBlob, fileNameFor, renderCompassPng } from '../lib/exportPng'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'
import { GameMenu, MoreMenu } from './GameMenu'
import { GridSizePicker } from './GridSizePicker'
import { HistoryButtons } from './HistoryButtons'
import { Modal } from './Modal'
import { LazyQuadrantSettings, LazyThemePicker, preloadQuadrants, preloadTheme } from './lazyDialogs'

type ArtRef = RefObject<HTMLDivElement | null>

function Label({ children }: { children: ReactNode }) {
  return <span className="hidden md:inline">{children}</span>
}

const spinner = <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />

/** PNG indir / paylaş: masaüstü araç çubuğu ve mobil alt çubuk aynı mantığı kullanır. */
function useCompassExport(artRef: ArtRef) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null)
  const showToast = useUiStore((s) => s.showToast)
  const coarse = useMediaQuery('(pointer: coarse)')
  const shareSupported = useMemo(() => coarse && canShareFiles(), [coarse])

  const render = async () => {
    const node = artRef.current
    if (!node) throw new Error('Pusula bulunamadı')
    const { compass } = useCompassStore.getState()
    const photoIds = compass.cells.flatMap((c) => (c.photoId ? [c.photoId] : []))
    const blob = await renderCompassPng(node, photoIds)
    return { blob, name: fileNameFor(compass.title) }
  }

  const download = async () => {
    if (busy) return
    setBusy('download')
    try {
      const { blob, name } = await render()
      downloadBlob(blob, name)
      showToast('PNG indirildi.', 'success')
    } catch {
      showToast('Görsel oluşturulamadı. Tekrar dener misin?', 'error')
    } finally {
      setBusy(null)
    }
  }

  const share = async () => {
    if (busy) return
    setBusy('share')
    try {
      const { blob, name } = await render()
      const file = new File([blob], name, { type: 'image/png' })
      await navigator.share({
        files: [file],
        title: useCompassStore.getState().compass.title,
      })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        showToast('Paylaşılamadı. PNG indirip elle paylaşabilirsin.', 'error')
      }
    } finally {
      setBusy(null)
    }
  }

  return { busy, download, share, shareSupported }
}

/** Masaüstü (≥ 640 px): tek satırlık araç çubuğu. */
export function Toolbar({ artRef }: { artRef: ArtRef }) {
  const { busy, download, share, shareSupported } = useCompassExport(artRef)
  const isBands = useCompassStore((s) => s.compass.gridSize === 3)
  const setDialog = useUiStore((s) => s.setCompassDialog)

  return (
    <>
      <HistoryButtons />
      <GridSizePicker />
      <button
        type="button"
        className="btn"
        aria-label="Tema"
        onPointerEnter={preloadTheme}
        onFocus={preloadTheme}
        onClick={() => setDialog('theme')}
      >
        <Swatches size={20} weight="bold" aria-hidden />
        <Label>Tema</Label>
      </button>
      <button
        type="button"
        className="btn"
        aria-label={isBands ? 'Bant renkleri ve etiketleri' : 'Bölge renkleri ve etiketleri'}
        onPointerEnter={preloadQuadrants}
        onFocus={preloadQuadrants}
        onClick={() => setDialog('quadrants')}
      >
        <Palette size={20} weight="bold" aria-hidden />
        <Label>{isBands ? 'Bantlar' : 'Bölgeler'}</Label>
      </button>
      <button
        type="button"
        className="btn btn-danger"
        aria-label="Sıfırla"
        onClick={() => setDialog('reset')}
      >
        <ArrowCounterClockwise size={20} weight="bold" aria-hidden />
        <Label>Sıfırla</Label>
      </button>
      <GameMenu />
      {shareSupported && (
        <button
          type="button"
          className="btn"
          aria-label="Paylaş"
          onClick={share}
          disabled={busy !== null}
          aria-busy={busy === 'share'}
        >
          {busy === 'share' ? spinner : <ShareNetwork size={20} weight="bold" aria-hidden />}
          <Label>Paylaş</Label>
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary"
        onClick={download}
        disabled={busy !== null}
        aria-busy={busy === 'download'}
      >
        {busy === 'download' ? spinner : <DownloadSimple size={20} weight="bold" aria-hidden />}
        PNG indir
      </button>
    </>
  )
}

/** Mobil (< 640 px) üst satır: solda boyut seçici; sağda geri al, ileri al, "⋯". */
export function MobileTopRow() {
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <GridSizePicker />
      <div className="flex items-center gap-1.5">
        <HistoryButtons />
        <MoreMenu />
      </div>
    </div>
  )
}

/**
 * Mobil alt çubuk (ekranın altında sabit): Oyun, Paylaş, PNG indir.
 * Bir alt sayfa ya da modal açıkken gizlenir. Yüksekliği `--bottom-bar-h`
 * değişkenine yazılır; sayfa altına o kadar boşluk konur.
 */
export function MobileBottomBar({ artRef }: { artRef: ArtRef }) {
  const { busy, download, share, shareSupported } = useCompassExport(artRef)
  const hidden = useUiStore((s) => s.overlays > 0)
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const update = () => {
      // Gizliyken son yükseklik korunur; sayfa düzeni zıplamaz.
      if (el.offsetHeight > 0) root.style.setProperty('--bottom-bar-h', `${el.offsetHeight}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--bottom-bar-h')
    }
  }, [])

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Pusula işlemleri"
      data-bottom-bar
      aria-hidden={hidden || undefined}
      className={`fixed inset-x-0 bottom-0 z-30 items-center gap-2 ${hidden ? 'hidden' : 'flex'} border-t-[3px] border-ink bg-surface px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]`}
    >
      <GameMenu variant="bar" />
      {shareSupported && (
        <button
          type="button"
          className="btn px-3"
          onClick={share}
          disabled={busy !== null}
          aria-busy={busy === 'share'}
        >
          {busy === 'share' ? spinner : <ShareNetwork size={20} weight="bold" aria-hidden />}
          Paylaş
        </button>
      )}
      <button
        type="button"
        className="btn btn-primary min-w-0 flex-1"
        onClick={download}
        disabled={busy !== null}
        aria-busy={busy === 'download'}
      >
        {busy === 'download' ? spinner : <DownloadSimple size={20} weight="bold" aria-hidden />}
        PNG indir
      </button>
    </div>
  )
}

/** Pencere parçası inerken: küçük "Yükleniyor…" göstergesi (ilk açılışta, kısa süre). */
function DialogLoading() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center sm:bottom-auto sm:top-20">
      <p
        role="status"
        className="animate-pop-in flex items-center gap-2 rounded-full border-2 border-ink bg-surface px-4 py-2 text-sm font-bold shadow-brutal-sm"
      >
        {spinner}
        Yükleniyor…
      </p>
    </div>
  )
}

/** Tema, Bölgeler/Bantlar ve Sıfırla pencereleri (uiStore.compassDialog). */
export function CompassDialogs() {
  const dialog = useUiStore((s) => s.compassDialog)
  const setDialog = useUiStore((s) => s.setCompassDialog)
  const reset = useCompassStore((s) => s.reset)
  const showToast = useUiStore((s) => s.showToast)
  const close = () => setDialog(null)

  if (dialog === 'theme' || dialog === 'quadrants') {
    return (
      <Suspense fallback={<DialogLoading />}>
        {dialog === 'theme' ? <LazyThemePicker onClose={close} /> : <LazyQuadrantSettings onClose={close} />}
      </Suspense>
    )
  }
  if (dialog !== 'reset') return null
  return (
    <Modal
      title="Pusulayı sıfırla?"
      size="sm"
      onClose={close}
      footer={
        <>
          <button type="button" className="btn" onClick={close} data-autofocus>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn border-danger bg-danger text-white"
            onClick={() => {
              reset()
              close()
              showToast('Pusula sıfırlandı. Geri almak için Geri al düğmesine bas.')
            }}
          >
            Evet, sıfırla
          </button>
        </>
      }
    >
      <p className="text-sm">Tüm isimler, maddeler, fotoğraflar, bölge renkleri ve etiketleri silinecek.</p>
    </Modal>
  )
}
