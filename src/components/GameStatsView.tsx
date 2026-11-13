import { ArrowClockwise, ArrowLeft, CircleNotch, Trash } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { formatPoints } from '../lib/play'
import type { GameStats } from '../lib/playApi'
import type { SavedGame } from '../store/gamesStore'
import { Ranking } from './play/Ranking'

type Load = { kind: 'loading' } | { kind: 'error'; message: string; gone: boolean } | { kind: 'ok'; data: GameStats }

const MESSAGES: Record<string, string> = {
  rate_limited: 'Çok fazla deneme yapıldı, biraz sonra tekrar dene.',
  network: 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.',
  not_found: 'Bu oyun artık yok: süresi dolmuş ya da silinmiş.',
}

/**
 * Kurucu görünümü (silme anahtarıyla): kaç kişi oynadı, en kolay tanınan ve
 * kimsenin bilemediği kişi, sıralama ve "Bu oyuncuyu sıralamadan kaldır".
 * Ağ kodu yalnızca bu görünüm açılınca yüklenir.
 */
export function GameStatsView({ game, onBack }: { game: SavedGame; onBack: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const fetchStats = useCallback(
    async (remove?: string): Promise<Load> => {
      const api = await import('../lib/playApi')
      try {
        return { kind: 'ok', data: await api.gameStats(game.code, game.deleteToken, remove) }
      } catch (e) {
        const code = e instanceof api.GameApiError ? e.code : ''
        return { kind: 'error', message: MESSAGES[code] ?? 'İstatistik alınamadı.', gone: code === 'not_found' }
      }
    },
    [game.code, game.deleteToken],
  )

  useEffect(() => {
    let cancelled = false
    void fetchStats().then((l) => {
      if (!cancelled) setLoad(l)
    })
    return () => {
      cancelled = true
    }
  }, [fetchStats])

  const retry = () => {
    setLoad({ kind: 'loading' })
    void fetchStats().then(setLoad)
  }

  const remove = async (id: string) => {
    setRemoving(id)
    const next = await fetchStats(id)
    setRemoving(null)
    setConfirmId(null)
    setLoad(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <button type="button" className="btn self-start" onClick={onBack}>
        <ArrowLeft size={18} weight="bold" aria-hidden />
        Oyunlarım
      </button>
      <h3 className="text-lg font-black tracking-tight">{game.title || 'Başlıksız pusula'}</h3>

      {load.kind === 'loading' && (
        <p className="flex items-center gap-2 text-sm font-bold" role="status">
          <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden />
          Yükleniyor…
        </p>
      )}

      {load.kind === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm font-bold text-danger">{load.message}</p>
          {!load.gone && (
            <button type="button" className="btn" onClick={retry}>
              <ArrowClockwise size={18} weight="bold" aria-hidden />
              Tekrar dene
            </button>
          )}
        </div>
      )}

      {load.kind === 'ok' && (
        <>
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg border-2 border-ink p-3">
              <dt className="font-bold text-muted">Oynayan</dt>
              <dd className="text-2xl font-black tabular-nums">{load.data.stats.players}</dd>
            </div>
            <div className="rounded-lg border-2 border-ink p-3">
              <dt className="font-bold text-muted">En kolay tanınan</dt>
              <dd className="font-black">{load.data.stats.easiest.join(', ') || '-'}</dd>
            </div>
            <div className="rounded-lg border-2 border-ink p-3">
              <dt className="font-bold text-muted">Kimsenin bilemediği</dt>
              <dd className="font-black">{load.data.stats.nobody.join(', ') || '-'}</dd>
            </div>
          </dl>

          {load.data.stats.players > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-bold">Kişi kişi doğru bilen sayısı</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {load.data.stats.people.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{p.name}</span>
                    <span className="tabular-nums">
                      {p.correct}/{load.data.stats.players}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="flex flex-col gap-2">
            <h4 className="font-black">Sıralama</h4>
            <Ranking
              rows={load.data.ranking}
              total={load.data.total}
              action={(row) =>
                confirmId === row.id ? (
                  <span className="flex shrink-0 gap-1">
                    <button type="button" className="btn min-h-9 px-2 text-xs" onClick={() => setConfirmId(null)} disabled={removing !== null}>
                      Vazgeç
                    </button>
                    <button
                      type="button"
                      className="btn min-h-9 border-danger bg-danger px-2 text-xs text-white"
                      onClick={() => void remove(row.id)}
                      disabled={removing !== null}
                      aria-busy={removing === row.id}
                    >
                      {removing === row.id && <CircleNotch size={14} weight="bold" className="animate-spin" aria-hidden />}
                      Kaldır
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-icon btn-danger min-h-9 w-9 shrink-0"
                    aria-label={`${row.name} (${formatPoints(row.points2)} puan) oyuncusunu sıralamadan kaldır`}
                    title="Bu oyuncuyu sıralamadan kaldır"
                    onClick={() => setConfirmId(row.id)}
                  >
                    <Trash size={16} weight="bold" aria-hidden />
                  </button>
                )
              }
            />
            <p className="text-xs text-muted">
              Kaldırılan oyuncunun tahmini silinir; aynı cihazdan yeniden oynayabilir.
            </p>
          </section>
        </>
      )}
    </div>
  )
}
