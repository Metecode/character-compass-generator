import {
  ArrowCounterClockwise,
  CircleNotch,
  DownloadSimple,
  Palette,
  ShareNetwork,
  Swatches,
} from '@phosphor-icons/react'
import { useMemo, useState, type ReactNode, type RefObject } from 'react'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { canShareFiles, downloadBlob, fileNameFor, renderCompassPng } from '../lib/exportPng'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'
import { GridSizePicker } from './GridSizePicker'
import { Modal } from './Modal'
import { QuadrantSettings } from './QuadrantSettings'
import { ThemePicker } from './ThemePicker'

interface Props {
  artRef: RefObject<HTMLDivElement | null>
  history?: ReactNode
}

function Label({ children }: { children: ReactNode }) {
  return <span className="hidden md:inline">{children}</span>
}

export function Toolbar({ artRef, history }: Props) {
  const [busy, setBusy] = useState<'download' | 'share' | null>(null)
  const [dialog, setDialog] = useState<'theme' | 'quadrants' | 'reset' | null>(null)
  const reset = useCompassStore((s) => s.reset)
  const isBands = useCompassStore((s) => s.compass.gridSize === 3)
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

  const onDownload = async () => {
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

  const onShare = async () => {
    if (busy) return
    setBusy('share')
    try {
      const { blob, name } = await render()
      const file = new File([blob], name, { type: 'image/png' })
      await navigator.share({ files: [file], title: useCompassStore.getState().compass.title })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        showToast('Paylaşılamadı. PNG indirip elle paylaşabilirsin.', 'error')
      }
    } finally {
      setBusy(null)
    }
  }

  const spinner = <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />

  return (
    <>
      {history}
      <GridSizePicker />
      <button type="button" className="btn" aria-label="Tema" onClick={() => setDialog('theme')}>
        <Swatches size={20} weight="bold" aria-hidden />
        <Label>Tema</Label>
      </button>
      <button
        type="button"
        className="btn"
        aria-label={isBands ? 'Bant renkleri ve etiketleri' : 'Bölge renkleri ve etiketleri'}
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
      {shareSupported && (
        <button
          type="button"
          className="btn"
          aria-label="Paylaş"
          onClick={onShare}
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
        onClick={onDownload}
        disabled={busy !== null}
        aria-busy={busy === 'download'}
      >
        {busy === 'download' ? spinner : <DownloadSimple size={20} weight="bold" aria-hidden />}
        PNG indir
      </button>

      {dialog === 'theme' && <ThemePicker onClose={() => setDialog(null)} />}
      {dialog === 'quadrants' && <QuadrantSettings onClose={() => setDialog(null)} />}
      {dialog === 'reset' && (
        <Modal
          title="Pusulayı sıfırla?"
          size="sm"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setDialog(null)} data-autofocus>
                Vazgeç
              </button>
              <button
                type="button"
                className="btn border-danger bg-danger text-white"
                onClick={() => {
                  reset()
                  setDialog(null)
                  showToast('Pusula sıfırlandı. Geri almak için Ctrl+Z.')
                }}
              >
                Evet, sıfırla
              </button>
            </>
          }
        >
          <p className="text-sm">
            Tüm isimler, maddeler, fotoğraflar, bölge renkleri ve etiketleri silinecek.
          </p>
        </Modal>
      )}
    </>
  )
}
