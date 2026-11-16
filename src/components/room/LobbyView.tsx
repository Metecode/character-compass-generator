import { CircleNotch, Crown, Play, SignOut, Trash, UserMinus } from '@phosphor-icons/react'
import { useState } from 'react'
import { roomAction, roomAdmin, roomErrorMessage, type MemberView, type RoomPlayer, type RoomSession } from '../../lib/roomApi'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { useUiStore } from '../../store/uiStore'
import type { MenuItem } from '../ActionMenu'
import { Modal } from '../Modal'
import { InviteCard } from './InviteCard'
import { RoomFrame } from './RoomFrame'
import { MODE_LABELS, writeTimeLabel } from './roomText'

type Confirm = { kind: 'kick'; player: RoomPlayer } | { kind: 'leave' } | { kind: 'delete' }

/**
 * LOBI: katılanlar canlı listelenir (liste kendi içinde kayar); admin oyuncu çıkarabilir,
 * herkes davet edebilir. "Oyunu başlat" altta sabit; çıkış ve silme "Diğer" menüsünde.
 */
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
  const [starting, setStarting] = useState(false)
  const showToast = useUiStore((s) => s.showToast)
  const isAdmin = data.me.isAdmin
  const count = data.players.length
  const { minPlayers, maxPlayers, mode, writeSeconds, allowProfanity } = data.settings
  const admin = data.players.find((p) => p.isAdmin)
  const missing = Math.max(0, minPlayers - count)
  const desktop = useIsDesktop()

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

  const start = async () => {
    if (starting) return
    setStarting(true)
    try {
      await roomAdmin(session, { action: 'start' })
      onChanged()
    } catch (e) {
      showToast(roomErrorMessage(e, 'Oyun başlatılamadı. Tekrar dener misin?'), 'error')
      onChanged()
    } finally {
      setStarting(false)
    }
  }

  const menu: MenuItem[] = [
    {
      id: 'leave',
      label: 'Odadan çık',
      icon: <SignOut size={20} weight="bold" />,
      onSelect: () => setConfirm({ kind: 'leave' }),
    },
    ...(isAdmin
      ? [
          {
            id: 'delete',
            label: 'Odayı sil',
            icon: <Trash size={20} weight="bold" />,
            danger: true,
            onSelect: () => setConfirm({ kind: 'delete' as const }),
          },
        ]
      : []),
  ]

  const footer = isAdmin ? (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="btn btn-primary min-h-12 w-full text-base"
        onClick={start}
        disabled={missing > 0 || starting}
        aria-describedby="start-hint"
      >
        {starting ? (
          <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
        ) : (
          <Play size={20} weight="fill" aria-hidden />
        )}
        Oyunu başlat
      </button>
      <p id="start-hint" className="text-center text-sm text-muted">
        {missing > 0
          ? `${missing} kişi daha lazım (en az ${minPlayers}).`
          : 'Başlatınca katılım ve oyuncu çıkarma kapanır.'}
      </p>
    </div>
  ) : (
    <p className="py-1 text-center text-[15px] font-bold" role="status">
      {missing > 0
        ? `${missing} kişi daha lazım (en az ${minPlayers}).`
        : `${admin?.name ?? 'Admin'} başlatınca yazma aşaması başlayacak.`}
    </p>
  )

  return (
    <RoomFrame title="Lobi" menu={menu} footer={footer} width={desktop ? 'wide' : 'narrow'}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-6">
        <div className="flex shrink-0 flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          <section className="rounded-2xl border-[3px] border-ink bg-surface p-3 shadow-brutal sm:p-4" aria-labelledby="lobby-title">
            <h1 id="lobby-title" className="text-xl leading-tight font-black tracking-tight text-balance sm:text-2xl">
              {isAdmin ? 'Arkadaşların gelsin' : `${admin?.name ?? 'Admin'} oyunu başlatacak`}
            </h1>
            <p className="mt-1 text-sm font-bold text-muted">
              {MODE_LABELS[mode].title} · {writeTimeLabel(writeSeconds)} yazma ·{' '}
              {allowProfanity ? 'argo serbest' : 'argo süzgeci açık'}
            </p>
            {missing === 0 && !data.guessing && (
              <p className="mt-2 rounded-lg border-2 border-dashed border-ink bg-paper p-2 text-sm font-bold" role="note">
                {`${count} kişiyle ${MODE_LABELS[mode].title} modda tahmin yok, yalnızca açılış. Puanlı oynamak için Hızlı modu seç ya da ${minPlayers + 1}+ kişi olun.`}
              </p>
            )}
          </section>

          <InviteCard code={session.code} creatorName={data.creatorName} primary={isAdmin} qr={desktop ? 'inline' : 'button'} />
        </div>

        <section
          className="flex min-h-0 flex-1 flex-col rounded-2xl border-[3px] border-ink bg-surface shadow-brutal"
          aria-labelledby="players-title"
        >
          <h2 id="players-title" className="px-3 pt-3 text-lg font-black tracking-tight sm:px-4">
            Katılanlar{' '}
            <span className="text-muted">
              {count}/{maxPlayers}
            </span>
          </h2>
          <ul
            data-room-scroll="players"
            className="mt-2 grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto overscroll-contain px-3 pb-3 min-[480px]:grid-cols-2 sm:px-4 lg:grid-cols-2"
            aria-live="polite"
          >
            {data.players.map((p) => (
              <li
                key={p.id}
                className={`flex min-w-0 items-center gap-2 rounded-xl border-2 border-ink bg-paper p-1.5 ${p.online ? '' : 'opacity-55'}`}
              >
                <img
                  src={p.photo}
                  alt=""
                  width={40}
                  height={40}
                  className="size-10 shrink-0 rounded-full border-2 border-ink object-cover"
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
    </RoomFrame>
  )
}
