import { CheckCircle, CircleNotch, Copy, Link, ShareNetwork, WarningCircle } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { CREATOR_NAME_KEY, CREATOR_NAME_MAX, GAME_DEFAULT_DURATION_HOURS, GAME_DURATIONS_HOURS } from '../constants'
import { GAME_WARNING, copyText, gameUrl, inviteMessage } from '../lib/gameLink'
import { cleanCreatorName } from '../lib/gamePayload'
import { CharCounter } from './CharCounter'
import { useCompassStore } from '../store/compassStore'
import { useGamesStore } from '../store/gamesStore'
import { useUiStore } from '../store/uiStore'
import { Modal } from './Modal'

const DURATION_LABELS: Record<number, string> = { 1: '1 saat', 24: '24 saat', 72: '72 saat' }

function savedCreatorName(): string {
  try {
    return localStorage.getItem(CREATOR_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberCreatorName(name: string | null) {
  try {
    if (name) localStorage.setItem(CREATOR_NAME_KEY, name)
    else localStorage.removeItem(CREATOR_NAME_KEY)
  } catch {
    // yok say: ad yalnızca kolaylık için hatırlanır
  }
}

interface Props {
  onClose: () => void
  onOpenMyGames: () => void
}

/** "Oyun linki oluştur" penceresi: kurucu adı, süre, uyarı + onay, sonra link ve davet metni. */
export function GameLinkDialog({ onClose, onOpenMyGames }: Props) {
  const [duration, setDuration] = useState<number>(GAME_DEFAULT_DURATION_HOURS)
  const [creatorName, setCreatorName] = useState(savedCreatorName)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ code: string; expiresAt: string; creatorName: string | null } | null>(
    null,
  )
  const addGame = useGamesStore((s) => s.addGame)
  const showToast = useUiStore((s) => s.showToast)
  const groupId = useId()
  const checkId = useId()
  const nameId = useId()

  const onCreate = async () => {
    if (busy || !agreed) return
    setBusy(true)
    setError(null)
    // Ağ kodu yalnızca bu noktada yüklenir; meme modunda hiç inmez.
    const api = await import('../lib/gameApi')
    try {
      const { compass } = useCompassStore.getState()
      const name = cleanCreatorName(creatorName)
      rememberCreatorName(name)
      const game = await api.createGame(compass, duration, name ?? '')
      addGame({
        code: game.code,
        title: compass.title.trim(),
        expiresAt: game.expiresAt,
        deleteToken: game.deleteToken,
        createdAt: new Date().toISOString(),
      })
      setCreated({ code: game.code, expiresAt: game.expiresAt, creatorName: name })
    } catch (e) {
      setError(api.gameErrorMessage(e, 'Oyun linki oluşturulamadı. Tekrar dener misin?'))
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    const url = gameUrl(created.code)
    const message = inviteMessage(created.creatorName, url)
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
        <p className="mt-3 text-sm font-bold">Davet mesajı</p>
        <p className="mt-1 rounded-lg border-2 border-ink bg-paper p-3 text-sm break-words">{message.copy}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canShare && (
            <button
              type="button"
              className="btn btn-primary"
              data-autofocus
              onClick={() => navigator.share({ title: 'Bu kim? Tahmin et', text: message.text, url }).catch(() => {})}
            >
              <ShareNetwork size={20} weight="bold" aria-hidden />
              Paylaş
            </button>
          )}
          <button
            type="button"
            className={canShare ? 'btn' : 'btn btn-primary'}
            data-autofocus={canShare ? undefined : true}
            onClick={async () => {
              if (await copyText(message.copy)) showToast('Davet mesajı kopyalandı.', 'success')
              else showToast('Kopyalanamadı; aşağıdaki linki elle seçip kopyala.', 'error')
            }}
          >
            <Copy size={20} weight="bold" aria-hidden />
            Mesajı kopyala
          </button>
        </div>
        <label className="mt-4 block text-sm font-bold" htmlFor={`${checkId}-url`}>
          Link
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id={`${checkId}-url`}
            className="field min-w-0 flex-1 font-mono text-sm"
            value={url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            className="btn shrink-0"
            onClick={async () => {
              if (await copyText(url)) showToast('Link kopyalandı.', 'success')
              else showToast('Kopyalanamadı; linki elle seçip kopyala.', 'error')
            }}
          >
            <Link size={20} weight="bold" aria-hidden />
            Yalnızca linki kopyala
          </button>
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

      <div className="mt-4 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={nameId} className="text-sm font-bold">
            Adın <span className="font-normal text-muted">(isteğe bağlı)</span>
          </label>
          <CharCounter id={`${nameId}-count`} value={creatorName} max={CREATOR_NAME_MAX} />
        </div>
        <input
          id={nameId}
          className="field"
          value={creatorName}
          autoComplete="nickname"
          aria-describedby={`${nameId}-help ${nameId}-count`}
          onChange={(e) => setCreatorName(Array.from(e.target.value).slice(0, CREATOR_NAME_MAX).join(''))}
        />
        <p id={`${nameId}-help`} className="text-xs text-muted">
          Davette “{cleanCreatorName(creatorName) ?? 'Adın'} seni challenge'a davet etti” diye görünür.
        </p>
      </div>

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
