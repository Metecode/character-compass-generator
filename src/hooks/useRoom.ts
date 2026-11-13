import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ROOM_HEARTBEAT_MS,
  ROOM_MIN_FETCH_GAP_MS,
  ROOM_POLL_MS,
  ROOM_SIGNAL_JITTER_MS,
} from '../constants'
import { GameApiError, getRoomState, type MemberView, type OutsiderView, type RoomSession } from '../lib/roomApi'
import { openRoomChannel } from '../lib/roomRealtime'
import { RoomSync } from '../lib/roomSync'
import { savedRoomOf, useRoomsStore } from '../store/roomsStore'

export type RoomScreen =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'error'; code: string }
  /** `removed`: bu cihazın oturumu vardı ama artık geçersiz (çıkarıldı ya da çıktı). */
  | { kind: 'outsider'; data: OutsiderView; removed: boolean }
  | { kind: 'member'; data: MemberView; session: RoomSession }

export interface UseRoom {
  screen: RoomScreen
  /** Soket kopuk ya da son istek ağ hatası verdi ("Bağlantı yeniden kuruluyor"). */
  reconnecting: boolean
  /** Beklemeden yeniden çek (kendi eyleminden sonra). */
  refresh: () => void
  /** Katıldıktan / oda kurduktan sonra oturumu kaydedip üye görünümüne geç. */
  adopt: (s: RoomSession) => void
  /** Bu cihazın oturumunu unut (çıkış, silme). */
  forget: () => void
}

/** Bağlantı göstergesi kısa kopmalarda yanıp sönmesin. */
const RECONNECT_BADGE_DELAY_MS = 2_000

/**
 * /r/{code} sayfasının durumu: sunucudan çekme, Realtime sinyali, nabız,
 * yoklamaya düşme ve oturumun cihazda saklanması.
 */
export function useRoom(code: string): UseRoom {
  const [screen, setScreen] = useState<RoomScreen>({ kind: 'loading' })
  /** Kanalın bağlı olduğu konu; `topic`ten farklıysa soket kopuk sayılır. */
  const [connectedTopic, setConnectedTopic] = useState<string | null>(null)
  const [netError, setNetError] = useState(false)
  const [badgeDelayPassed, setBadgeDelayPassed] = useState(false)
  const [session, setSession] = useState<RoomSession | null>(() => {
    const s = savedRoomOf(code)
    return s ? { code, session: s.session, playerId: s.playerId } : null
  })
  const syncRef = useRef<RoomSync | null>(null)
  const isAdminRef = useRef(false)
  const removedRef = useRef(false)
  const [topic, setTopic] = useState<string | null>(null)

  const forget = useCallback(() => {
    useRoomsStore.getState().forgetRoom(code)
    setSession(null)
    setTopic(null)
  }, [code])

  // Çekme + zamanlama (oturum değişince baştan kurulur).
  useEffect(() => {
    let alive = true
    const fetchState = async () => {
      try {
        const state = await getRoomState(code, session?.session)
        if (!alive) return
        setNetError(false)
        if (state.view === 'member' && session) {
          isAdminRef.current = state.me.isAdmin
          setTopic(state.channel)
          setScreen((prev) =>
            prev.kind === 'member' && prev.data.version === state.version && samePlayers(prev.data, state)
              ? prev
              : { kind: 'member', data: state, session },
          )
        } else if (state.view === 'outsider') {
          if (session && !state.sessionValid) {
            removedRef.current = true
            useRoomsStore.getState().forgetRoom(code)
            setSession(null)
            setTopic(null)
          }
          setScreen({ kind: 'outsider', data: state, removed: removedRef.current })
        }
      } catch (e) {
        if (!alive) return
        const errCode = e instanceof GameApiError ? e.code : 'internal'
        if (errCode === 'not_found') {
          useRoomsStore.getState().forgetRoom(code)
          setTopic(null)
          setScreen({ kind: 'gone' })
          syncRef.current?.stop()
          return
        }
        if (errCode === 'network') setNetError(true)
        // Ekranda veri varsa korunur; yoksa hata ekranı.
        setScreen((prev) => (prev.kind === 'member' || prev.kind === 'outsider' ? prev : { kind: 'error', code: errCode }))
      }
    }
    const sync = new RoomSync({
      fetch: fetchState,
      heartbeatMs: ROOM_HEARTBEAT_MS,
      pollMs: ROOM_POLL_MS,
      jitterMs: ROOM_SIGNAL_JITTER_MS,
      minGapMs: ROOM_MIN_FETCH_GAP_MS,
    })
    syncRef.current = sync
    sync.start()
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync.refresh()
    }
    const onOnline = () => sync.refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      alive = false
      sync.stop()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      if (syncRef.current === sync) syncRef.current = null
    }
  }, [code, session])

  // Yalnızca üye kanala bağlanır; oturumsuz ziyaretçi bağlantı açmaz.
  useEffect(() => {
    if (!topic || !session) return
    // Bağlı = kanal katılımı tamam VE tarayıcı çevrimiçi. Çevrim dışı olunca açık
    // soket hemen kapanmayabilir (kanal durumu değişmez); bu yüzden ikisi ayrı tutulur.
    let channelUp = false
    let online = navigator.onLine
    const update = () => {
      const connected = channelUp && online
      setConnectedTopic(connected ? topic : null)
      syncRef.current?.setConnected(connected)
    }
    const handle = openRoomChannel(
      topic,
      (event) => {
        if (event === 'admin' && !isAdminRef.current) return
        syncRef.current?.signal()
      },
      (up) => {
        channelUp = up
        update()
      },
    )
    const onOffline = () => {
      online = false
      update()
    }
    const onOnline = () => {
      online = true
      update()
    }
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
      handle.close()
      setConnectedTopic(null)
      syncRef.current?.setConnected(false)
    }
  }, [topic, session])

  const problem = screen.kind === 'member' && (connectedTopic !== topic || netError)
  useEffect(() => {
    if (!problem) return
    const t = setTimeout(() => setBadgeDelayPassed(true), RECONNECT_BADGE_DELAY_MS)
    return () => {
      clearTimeout(t)
      setBadgeDelayPassed(false)
    }
  }, [problem])
  const showBadge = problem && badgeDelayPassed

  const refresh = useCallback(() => syncRef.current?.refresh(), [])
  const adopt = useCallback(
    (s: RoomSession) => {
      useRoomsStore.getState().saveRoom({ code: s.code, session: s.session, playerId: s.playerId })
      removedRef.current = false
      setScreen({ kind: 'loading' })
      setSession(s)
    },
    [],
  )

  return { screen, reconnecting: showBadge, refresh, adopt, forget }
}

/** Sürüm aynı olsa da çevrimiçi bilgisi değişmiş olabilir (sürüm yalnızca odadaki değişiklikte artar). */
function samePlayers(a: MemberView, b: MemberView): boolean {
  if (a.players.length !== b.players.length || a.me.isAdmin !== b.me.isAdmin) return false
  return a.players.every((p, i) => {
    const q = b.players[i]!
    return p.id === q.id && p.online === q.online && p.isAdmin === q.isAdmin
  })
}
