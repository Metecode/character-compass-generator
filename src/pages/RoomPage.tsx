import { ArrowClockwise, CircleNotch, HourglassHigh } from '@phosphor-icons/react'
import { useState } from 'react'
import { ClosedCard } from '../components/room/ClosedCard'
import { ConnectionBadge } from '../components/room/ConnectionBadge'
import { JoinView } from '../components/room/JoinView'
import { LobbyView } from '../components/room/LobbyView'
import { WritingView } from '../components/room/WritingView'
import { ToastHost } from '../components/ToastHost'
import { useRoom } from '../hooks/useRoom'
import { roomErrorMessage, GameApiError } from '../lib/roomApi'
import { PageShell } from './PageShell'

const CODE = /^[A-Za-z0-9]{12,64}$/
const codeFromPath = (path: string) => /^\/r\/([^/]+)\/?$/.exec(path)?.[1] ?? ''

/** /r/{code} — canlı oda. */
export default function RoomPage() {
  const [code] = useState(() => codeFromPath(window.location.pathname))
  if (!CODE.test(code)) {
    return (
      <PageShell title="Canlı oda" noindex>
        <ClosedCard reason="gone" />
      </PageShell>
    )
  }
  return <Room code={code} />
}

function Room({ code }: { code: string }) {
  const room = useRoom(code)
  const [deleted, setDeleted] = useState(false)
  const { screen } = room

  let body
  if (deleted) body = <ClosedCard reason="deleted" />
  else if (screen.kind === 'loading') {
    body = (
      <div className="flex items-center justify-center gap-2 py-24 font-bold" role="status">
        <CircleNotch size={24} weight="bold" className="animate-spin" aria-hidden />
        Oda yükleniyor…
      </div>
    )
  } else if (screen.kind === 'gone') body = <ClosedCard reason="gone" />
  else if (screen.kind === 'error') {
    body = (
      <div role="alert" className="mx-auto max-w-md rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg">
        <h1 className="text-2xl font-black tracking-tight">Oda açılamadı</h1>
        <p className="mt-2">{roomErrorMessage(new GameApiError(screen.code), 'Bir şeyler ters gitti. Tekrar dener misin?')}</p>
        <button type="button" className="btn btn-primary mt-5" onClick={room.refresh}>
          <ArrowClockwise size={20} weight="bold" aria-hidden />
          Tekrar dene
        </button>
      </div>
    )
  } else if (screen.kind === 'outsider') {
    const d = screen.data
    body = d.joinable ? (
      <JoinView code={code} data={d} removed={screen.removed} onJoined={room.adopt} />
    ) : (
      <ClosedCard reason={d.closedReason === 'full' ? 'full' : 'started'} />
    )
  } else if (screen.data.phase === 'lobby') {
    body = (
      <LobbyView
        data={screen.data}
        session={screen.session}
        onChanged={room.refresh}
        onLeft={() => {
          room.forget()
          window.location.assign('/')
        }}
        onDeleted={() => {
          room.forget()
          setDeleted(true)
        }}
      />
    )
  } else if (screen.data.phase === 'writing' && screen.data.writing) {
    body = (
      <WritingView
        key={`${screen.session.code}:${screen.session.playerId}`}
        data={screen.data}
        session={screen.session}
        clockOffset={screen.clockOffset}
        onChanged={room.refresh}
        onDeleted={() => {
          room.forget()
          setDeleted(true)
        }}
      />
    )
  } else {
    // Açılış ve sonuç ekranları C parçasında.
    body = (
      <div className="mx-auto max-w-md rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg" role="status">
        <HourglassHigh size={30} weight="bold" aria-hidden />
        <h1 className="mt-3 text-2xl font-black tracking-tight">Maddeler yazıldı</h1>
        <p className="mt-2">Açılış ekranı yakında hazır olacak.</p>
      </div>
    )
  }

  return (
    <PageShell title="Canlı oda" noindex>
      <ConnectionBadge visible={room.reconnecting} />
      {body}
      <ToastHost />
    </PageShell>
  )
}
