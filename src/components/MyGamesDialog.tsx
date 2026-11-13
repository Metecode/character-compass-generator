import { ChartBar, CircleNotch, Copy, Trash } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { copyText, gameUrl } from '../lib/gameLink'
import { remainingLabel, useGamesStore, type SavedGame } from '../store/gamesStore'
import { useUiStore } from '../store/uiStore'
import { GameStatsView } from './GameStatsView'
import { Modal } from './Modal'

/** Kalan süre yazısı yarım dakikada bir tazelenir. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [intervalMs])
  return now
}

function GameRow({ game, now, onStats }: { game: SavedGame; now: number; onStats: () => void }) {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const removeGame = useGamesStore((s) => s.removeGame)
  const showToast = useUiStore((s) => s.showToast)
  const url = gameUrl(game.code)

  const onDelete = async () => {
    if (busy) return
    setBusy(true)
    const api = await import('../lib/gameApi')
    try {
      await api.deleteGame(game.code, game.deleteToken)
      removeGame(game.code)
      showToast('Oyun ve fotoğrafları silindi.', 'success')
    } catch (e) {
      showToast(api.gameErrorMessage(e, 'Silinemedi. Biraz sonra tekrar dener misin?'), 'error')
      setBusy(false)
      setConfirm(false)
    }
  }

  return (
    <li className="rounded-lg border-2 border-ink p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-bold">{game.title || 'Başlıksız pusula'}</p>
          <p className="text-sm text-muted">{remainingLabel(game.expiresAt, now)}</p>
        </div>
        <button
          type="button"
          className="btn btn-icon shrink-0"
          aria-label="Linki kopyala"
          onClick={async () => {
            if (await copyText(url)) showToast('Link kopyalandı.', 'success')
            else showToast('Kopyalanamadı.', 'error')
          }}
        >
          <Copy size={20} weight="bold" aria-hidden />
        </button>
      </div>
      <p className="mt-1 truncate font-mono text-xs text-muted">{url}</p>
      <div className="mt-2 flex justify-end gap-2">
        {confirm ? (
          <>
            <button type="button" className="btn" onClick={() => setConfirm(false)} disabled={busy}>
              Vazgeç
            </button>
            <button
              type="button"
              className="btn border-danger bg-danger text-white"
              onClick={onDelete}
              disabled={busy}
              aria-busy={busy}
            >
              {busy && <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />}
              Evet, sil
            </button>
          </>
        ) : (
          <>
          <button type="button" className="btn" onClick={onStats}>
            <ChartBar size={20} weight="bold" aria-hidden />
            İstatistik
          </button>
          <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)}>
            <Trash size={20} weight="bold" aria-hidden />
            Şimdi sil
          </button>
          </>
        )}
      </div>
    </li>
  )
}

/** Bu cihazda oluşturulan oyun linkleri: kalan süre ve "Şimdi sil". */
export function MyGamesDialog({ onClose }: { onClose: () => void }) {
  const games = useGamesStore((s) => s.games)
  const pruneExpired = useGamesStore((s) => s.pruneExpired)
  const now = useNow()
  const [statsCode, setStatsCode] = useState<string | null>(null)
  const statsGame = games.find((g) => g.code === statsCode) ?? null

  useEffect(() => {
    pruneExpired(now)
  }, [now, pruneExpired])

  return (
    <Modal title="Oyunlarım" onClose={onClose}>
      {statsGame ? (
        <GameStatsView game={statsGame} onBack={() => setStatsCode(null)} />
      ) : games.length === 0 ? (
        <p className="text-sm">Bu cihazda açık oyun linki yok.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((g) => (
            <GameRow key={g.code} game={g} now={now} onStats={() => setStatsCode(g.code)} />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">
        Süre dolunca link kapanır; fotoğraflar ve maddeler en geç 15 dakika içinde sunucudan silinir.
      </p>
    </Modal>
  )
}
