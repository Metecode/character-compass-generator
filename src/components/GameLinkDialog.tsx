import { CheckCircle, CircleNotch, Copy, ShareNetwork, WarningCircle } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { GAME_DEFAULT_DURATION_HOURS, GAME_DURATIONS_HOURS } from '../constants'
import { GAME_WARNING, copyText, gameUrl } from '../lib/gameLink'
import { useCompassStore } from '../store/compassStore'
import { useGamesStore } from '../store/gamesStore'
import { useUiStore } from '../store/uiStore'
import { Modal } from './Modal'

const DURATION_LABELS: Record<number, string> = { 1: '1 saat', 24: '24 saat', 72: '72 saat' }

interface Props {
  onClose: () => void
  onOpenMyGames: () => void
}

/** "Oyun linki oluştur" penceresi: süre, uyarı + onay, sonra link. */
export function GameLinkDialog({ onClose, onOpenMyGames }: Props) {
  const [duration, setDuration] = useState<number>(GAME_DEFAULT_DURATION_HOURS)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ code: string; expiresAt: string } | null>(null)
  const addGame = useGamesStore((s) => s.addGame)
  const showToast = useUiStore((s) => s.showToast)
  const groupId = useId()
  const checkId = useId()

  const onCreate = async () => {
    if (busy || !agreed) return
    setBusy(true)
    setError(null)
    // Ağ kodu yalnızca bu noktada yüklenir; meme modunda hiç inmez.
    const api = await import('../lib/gameApi')
    try {
      const { compass } = useCompassStore.getState()
      const game = await api.createGame(compass, duration)
      addGame({
        code: game.code,
        title: compass.title.trim(),
        expiresAt: game.expiresAt,
        deleteToken: game.deleteToken,
        createdAt: new Date().toISOString(),
      })
      setCreated({ code: game.code, expiresAt: game.expiresAt })
    } catch (e) {
      setError(api.gameErrorMessage(e, 'Oyun linki oluşturulamadı. Tekrar dener misin?'))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    const url = gameUrl(created.code)
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
    const expires = new Date(created.expiresAt).toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })
    return (
      <Modal
        title="Oyun linki hazır"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="btn" onClick={onOpenMyGames}>
              Oyunlarım
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Tamam
            </button>
          </>
        }
      >
        <p className="flex items-center gap-2 text-sm font-bold">
          <CheckCircle size={20} weight="fill" className="shrink-0 text-[#1f9d55]" aria-hidden />
          Link {expires} tarihine kadar açık.
        </p>
        <label className="mt-3 block text-sm font-bold" htmlFor={`${checkId}-url`}>
          Link
        </label>
        <input
          id={`${checkId}-url`}
          className="field mt-1 font-mono text-sm"
          value={url}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          data-autofocus
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (await copyText(url)) showToast('Link kopyalandı.', 'success')
              else showToast('Kopyalanamadı; linki elle seçip kopyala.', 'error')
            }}
          >
            <Copy size={20} weight="bold" aria-hidden />
            Kopyala
          </button>
          {canShare && (
            <button
              type="button"
              className="btn"
              onClick={() => navigator.share({ url, title: 'Bu kim? Tahmin et' }).catch(() => {})}
            >
              <ShareNetwork size={20} weight="bold" aria-hidden />
              Paylaş
            </button>
          )}
        </div>
        <p className="mt-3 text-sm text-muted">
          Silme anahtarı yalnızca bu cihazda saklanıyor. Linki erken kapatmak için
          “Oyunlarım”dan “Şimdi sil”e bas.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      title="Oyun linki oluştur"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCreate}
            disabled={!agreed || busy}
            aria-busy={busy}
          >
            {busy && <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />}
            {busy ? 'Oluşturuluyor…' : 'Linki oluştur'}
          </button>
        </>
      }
    >
      <p className="text-sm">
        Arkadaşların linki açıp maddelerden kimin kim olduğunu tahmin eder.
      </p>

      <fieldset className="mt-4">
        <legend id={groupId} className="text-sm font-bold">
          Link ne kadar açık kalsın?
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby={groupId}>
          {GAME_DURATIONS_HOURS.map((h, i) => (
            <label
              key={h}
              className={`btn cursor-pointer has-[:focus-visible]:border-focus ${
                duration === h ? 'btn-primary' : ''
              }`}
            >
              <input
                type="radio"
                name={groupId}
                value={h}
                checked={duration === h}
                onChange={() => setDuration(h)}
                className="sr-only"
                data-autofocus={i === 1 ? true : undefined}
              />
              {DURATION_LABELS[h]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 rounded-lg border-2 border-ink bg-accent/30 p-3">
        <p className="flex gap-2 text-sm font-bold">
          <WarningCircle size={20} weight="bold" className="mt-px shrink-0" aria-hidden />
          {GAME_WARNING}
        </p>
        <label htmlFor={checkId} className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
          <input
            id={checkId}
            type="checkbox"
            className="size-5 shrink-0 accent-ink"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          Okudum, pusuladaki kişilerin haberi var.
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border-2 border-danger bg-[#ffe3e3] p-2 text-sm font-bold text-danger">
          {error}
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Ayrıntılar:{' '}
        <a href="/gizlilik" target="_blank" rel="noopener" className="underline">
          Gizlilik
        </a>
      </p>
    </Modal>
  )
}
