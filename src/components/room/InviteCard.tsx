import { Copy, Link, QrCode as QrIcon, ShareNetwork } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { copyText, roomInviteMessage, roomUrl } from '../../lib/gameLink'
import { useUiStore } from '../../store/uiStore'
import { QrCode } from './QrCode'

/**
 * Katılım linki, QR ve hazır davet metni. Paylaşımda link yalnızca `url`
 * alanında gider; kopyalanan metinde tek parça.
 *
 * `qr="inline"` (masaüstü): QR kartta hep görünür; katılım çoğunlukla ekranı
 * göstererek olur. `qr="button"` (telefon): "QR göster" tam ekran açar.
 */
export function InviteCard({
  code,
  creatorName,
  primary,
  qr,
}: {
  code: string
  creatorName: string
  primary: boolean
  qr: 'inline' | 'button'
}) {
  const url = roomUrl(code)
  const message = roomInviteMessage(creatorName, url)
  const showToast = useUiStore((s) => s.showToast)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const [fullQr, setFullQr] = useState(false)

  return (
    <section className="shrink-0 rounded-2xl border-[3px] border-ink bg-surface p-3 shadow-brutal sm:p-4" aria-labelledby="invite-title">
      <h2 id="invite-title" className="text-lg font-black tracking-tight">
        Arkadaşlarını çağır
      </h2>
      {qr === 'inline' && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <QrCode value={url} label="Odaya katılma linkinin QR kodu" />
          <p className="text-sm text-muted">Aynı ortamdakiler kamerayla okutup katılabilir.</p>
        </div>
      )}
      <div className={qr === 'button' ? 'mt-2.5 grid grid-cols-2 gap-2 [&>.btn]:px-2 [&>.btn]:whitespace-nowrap max-[380px]:[&>.btn>svg]:hidden' : 'mt-2.5 flex flex-wrap gap-2'}>
        {qr === 'button' && (
          <button type="button" className="btn" onClick={() => setFullQr(true)}>
            <QrIcon size={20} weight="bold" aria-hidden />
            QR göster
          </button>
        )}
        {canShare && (
          <button
            type="button"
            className={primary ? 'btn btn-primary' : 'btn'}
            onClick={() => navigator.share({ title: 'Canlı pusula', text: message.text, url }).catch(() => {})}
          >
            <ShareNetwork size={20} weight="bold" aria-hidden />
            Paylaş
          </button>
        )}
        <button
          type="button"
          className={primary && !canShare ? 'btn btn-primary' : 'btn'}
          onClick={async () => {
            if (await copyText(message.copy)) showToast('Davet mesajı kopyalandı.', 'success')
            else showToast('Kopyalanamadı; linki elle seçip kopyala.', 'error')
          }}
        >
          <Copy size={20} weight="bold" aria-hidden />
          Mesajı kopyala
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (await copyText(url)) showToast('Link kopyalandı.', 'success')
            else showToast('Kopyalanamadı; linki elle seçip kopyala.', 'error')
          }}
        >
          <Link size={20} weight="bold" aria-hidden />
          Linki kopyala
        </button>
      </div>
      {fullQr && <QrFullscreen url={url} onClose={() => setFullQr(false)} />}
    </section>
  )
}

/**
 * Tam ekran QR: düz beyaz zemin, siyah modüller, standart sessiz bölge; ekrana
 * sığan en büyük boy (parlaklık düşükken de okunsun). Herhangi bir yere
 * dokununca ya da Esc ile kapanır.
 */
function QrFullscreen({ url, onClose }: { url: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [size] = useState(() => {
    const w = document.documentElement.clientWidth
    const h = window.visualViewport?.height ?? window.innerHeight
    return Math.max(200, Math.floor(Math.min(w - 24, h - 120, 640)))
  })

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault()
        if (e.key === 'Escape') onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Katılım QR kodu"
      data-qr-fullscreen
      className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-white p-3 text-ink"
      onClick={onClose}
    >
      <QrCode value={url} size={size} margin={4} className="bg-white" label="Odaya katılma linkinin QR kodu" />
      <button ref={closeRef} type="button" className="btn" onClick={onClose}>
        Kapatmak için dokun
      </button>
    </div>,
    document.body,
  )
}
