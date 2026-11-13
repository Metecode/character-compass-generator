import { CircleNotch, Crown, SignOut, Trash, UserMinus } from '@phosphor-icons/react'
import { useState } from 'react'
import { roomAction, roomAdmin, roomErrorMessage, type MemberView, type RoomPlayer, type RoomSession } from '../../lib/roomApi'
import { useUiStore } from '../../store/uiStore'
import { Modal } from '../Modal'
import { InviteCard } from './InviteCard'
import { MODE_LABELS, writeTimeLabel } from './roomText'

type Confirm = { kind: 'kick'; player: RoomPlayer } | { kind: 'leave' } | { kind: 'delete' }

/** LOBI: katılanlar canlı listelenir; admin oyuncu çıkarabilir, herkes davet edebilir. */
export function LobbyView({
  data,
  session,
  onChanged,
  onLeft,
  onDeleted,
}: {
  data: MemberView
  session: RoomSession
  onChanged: () => void
  onLeft: () => void
  onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)
  const showToast = useUiStore((s) => s.showToast)
  const isAdmin = data.me.isAdmin
  const count = data.players.length
  const { minPlayers, maxPlayers, mode, writeSeconds, allowProfanity } = data.settings
  const admin = data.players.find((p) => p.isAdmin)
  const missing = Math.max(0, minPlayers - count)

  const run = async () => {
    if (!confirm || busy) return
    setBusy(true)
    try {
      if (confirm.kind === 'kick') {
        await roomAdmin(session, { action: 'kick', playerId: confirm.player.id })
        showToast(`${confirm.player.name} odadan çıkarıldı.`, 'success')
        setConfirm(null)
        onChanged()
      } else if (confirm.kind === 'leave') {
        await roomAction(session, { action: 'leave' })
        onLeft()
      } else {
        await roomAdmin(session, { action: 'delete' })
        onDeleted()
      }
    } catch (e) {
      showToast(roomErrorMessage(e, 'İşlem yapılamadı. Tekrar dener misin?'), 'error')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-brutal-lg">
        <p className="text-sm font-black tracking-wide text-muted uppercase">Lobi</p>
        <h1 className="mt-1 text-2xl leading-tight font-black tracking-tight text-balance">
          {isAdmin ? 'Arkadaşların gelsin' : `${admin?.name ?? 'Admin'} oyunu başlatacak`}
        </h1>
        <p className="mt-2 text-[15px]">
          {missing > 0
            ? `Başlamak için en az ${minPlayers} kişi gerekiyor; ${missing} kişi daha lazım.`
            : isAdmin
              ? 'Yeterli kişi var. Herkes gelince oyunu başlat.'
              : 'Herkes gelince yazma aşaması başlayacak.'}
        </p>
        <p className="mt-3 text-sm font-bold text-muted">
          {MODE_LABELS[mode].title} · {writeTimeLabel(writeSeconds)} yazma · {allowProfanity ? 'argo serbest' : 'argo süzgeci açık'}
        </p>
      </div>

      <InviteCard code={session.code} creatorName={data.creatorName} primary={isAdmin} />

      <section className="rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-brutal" aria-labelledby="players-title">
        <h2 id="players-title" className="text-lg font-black tracking-tight">
          Katılanlar{' '}
          <span className="text-muted">
            {count}/{maxPlayers}
          </span>
        </h2>
        <ul
          className={`mt-3 grid gap-2 ${isAdmin ? 'grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}
          aria-live="polite"
        >
          {data.players.map((p) => (
            <li
              key={p.id}
              className={`flex min-w-0 items-center gap-2 rounded-xl border-2 border-ink bg-paper p-2 ${p.online ? '' : 'opacity-55'}`}
            >
              <img
                src={p.photo}
                alt=""
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-full border-2 border-ink object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">
                  {p.name}
                  {p.id === data.me.id && <span className="font-bold text-muted"> (sen)</span>}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  {p.isAdmin && <Crown size={12} weight="fill" aria-hidden />}
                  {p.isAdmin ? 'Admin' : p.online ? 'Burada' : 'Bağlantı yok'}
                </p>
              </div>
              {isAdmin && p.id !== data.me.id && (
                <button
                  type="button"
                  className="btn btn-icon shrink-0"
                  aria-label={`${p.name} adlı oyuncuyu çıkar`}
                  onClick={() => setConfirm({ kind: 'kick', player: p })}
                >
                  <UserMinus size={18} weight="bold" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn" onClick={() => setConfirm({ kind: 'leave' })}>
          <SignOut size={20} weight="bold" aria-hidden />
          Odadan çık
        </button>
        {isAdmin && (
          <button type="button" className="btn btn-danger" onClick={() => setConfirm({ kind: 'delete' })}>
            <Trash size={20} weight="bold" aria-hidden />
            Odayı sil
          </button>
        )}
      </div>

      {confirm && (
        <Modal
          size="sm"
          title={
            confirm.kind === 'kick'
              ? `${confirm.player.name} çıkarılsın mı?`
              : confirm.kind === 'leave'
                ? 'Odadan çıkılsın mı?'
                : 'Oda silinsin mi?'
          }
          onClose={() => !busy && setConfirm(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={busy}>
                Vazgeç
              </button>
              <button
                type="button"
                className={confirm.kind === 'leave' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={run}
                disabled={busy}
                data-autofocus
              >
                {busy && <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden />}
                {confirm.kind === 'kick' ? 'Çıkar' : confirm.kind === 'leave' ? 'Çık' : 'Sil'}
              </button>
            </>
          }
        >
          <p className="text-[15px]">
            {confirm.kind === 'kick'
              ? 'Fotoğrafı sunucudan silinir. Linki biliyorsa yeniden katılabilir.'
              : confirm.kind === 'leave'
                ? isAdmin && count > 1
                  ? 'Fotoğrafın sunucudan silinir. Adminlik en eski oyuncuya geçer.'
                  : count > 1
                    ? 'Fotoğrafın sunucudan silinir. Linkle yeniden katılabilirsin.'
                    : 'Odada başka kimse yok; oda tamamen silinir.'
                : 'Oda, herkesin fotoğrafı ve adıyla birlikte hemen silinir. Geri alınamaz.'}
          </p>
        </Modal>
      )}
    </div>
  )
}
