import { Copy, Link, QrCode as QrIcon, ShareNetwork } from '@phosphor-icons/react'
import { useState } from 'react'
import { copyText, roomInviteMessage, roomUrl } from '../../lib/gameLink'
import { useUiStore } from '../../store/uiStore'
import { QrCode } from './QrCode'

/**
 * Katılım linki, QR ve hazır davet metni. Paylaşımda link yalnızca `url`
 * alanında gider; kopyalanan metinde tek parça.
 */
export function InviteCard({ code, creatorName, primary }: { code: string; creatorName: string; primary: boolean }) {
  const url = roomUrl(code)
  const message = roomInviteMessage(creatorName, url)
  const showToast = useUiStore((s) => s.showToast)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const [showQr, setShowQr] = useState(primary)

  return (
    <section className="rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-brutal" aria-labelledby="invite-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="invite-title" className="text-lg font-black tracking-tight">
          Arkadaşlarını çağır
        </h2>
        <button
          type="button"
          className="btn btn-icon"
          aria-pressed={showQr}
          aria-label={showQr ? 'QR kodunu gizle' : 'QR kodunu göster'}
          onClick={() => setShowQr((v) => !v)}
        >
          <QrIcon size={20} weight="bold" aria-hidden />
        </button>
      </div>
      {showQr && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <QrCode value={url} label="Odaya katılma linkinin QR kodu" />
          <p className="text-sm text-muted">Aynı ortamdakiler kamerayla okutup katılabilir.</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
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
    </section>
  )
}
