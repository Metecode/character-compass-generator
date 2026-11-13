import { ArrowClockwise, CircleNotch, Ghost, Play } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useState } from 'react'
import { PLAYER_NAME_MAX } from '../constants'
import { PlayView } from '../components/play/PlayView'
import { ResultView } from '../components/play/ResultView'
import { gameUrl } from '../lib/gameLink'
import { classifyPlayError, cleanPlayerName, deviceId, loadDraft, saveDraft } from '../lib/play'
import { GameApiError, getGame, type OpenGame, type PlayedResult } from '../lib/playApi'
import { PageShell } from './PageShell'

const CODE = /^[A-Za-z0-9]{12,64}$/
const LAST_NAME_KEY = 'compass-player-name'

type View =
  | { kind: 'loading' }
  | { kind: 'gone' }
  | { kind: 'error'; message: string; retry: boolean }
  | { kind: 'open'; game: OpenGame; hints: Record<number, string>; players: number | null }
  | { kind: 'played'; result: PlayedResult; animate: boolean }

const codeFromPath = (path: string) => /^\/g\/([^/]+)\/?$/.exec(path)?.[1] ?? ''

function lastName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Sunucudan oyun durumunu alıp ekran durumuna çevirir (hata da bir ekran durumu). */
async function fetchView(code: string): Promise<View> {
  try {
    const state = await getGame(code, deviceId())
    return state.status === 'played'
      ? { kind: 'played', result: state.result, animate: false }
      : { kind: 'open', game: state.game, hints: state.hints, players: state.players ?? null }
  } catch (e) {
    const { kind, message } = classifyPlayError(e instanceof GameApiError ? e.code : undefined)
    return kind === 'gone' ? { kind: 'gone' } : { kind: 'error', message, retry: true }
  }
}

/** /g/{code} — "Bu kim?" tahmin oyunu. */
export default function GamePage() {
  const [code] = useState(() => codeFromPath(window.location.pathname))
  const [view, setView] = useState<View>(() => (CODE.test(code) ? { kind: 'loading' } : { kind: 'gone' }))
  const [player, setPlayer] = useState<string | null>(() => loadDraft(code)?.name || null)
  const [editingName, setEditingName] = useState(false)

  const load = useCallback(() => {
    if (!CODE.test(code)) return setView({ kind: 'gone' })
    setView({ kind: 'loading' })
    void fetchView(code).then(setView)
  }, [code])

  // İlk açılış: durum zaten "yükleniyor" (ya da geçersiz kodda "yok").
  useEffect(() => {
    if (!CODE.test(code)) return
    let cancelled = false
    void fetchView(code).then((v) => {
      if (!cancelled) setView(v)
    })
    return () => {
      cancelled = true
    }
  }, [code])

  const title =
    view.kind === 'open' ? view.game.title : view.kind === 'played' ? view.result.title : ''
  const wide = view.kind === 'open' || view.kind === 'played'

  return (
    <PageShell title={title ? `${title} · Bu kim?` : 'Bu kim?'} noindex wide={wide}>
      {view.kind === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-24 font-bold" role="status">
          <CircleNotch size={24} weight="bold" className="animate-spin" aria-hidden />
          Oyun yükleniyor…
        </div>
      )}

      {view.kind === 'gone' && <GoneCard />}

      {view.kind === 'error' && (
        <div role="alert" className="rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg">
          <h1 className="text-2xl font-black tracking-tight">Oyun açılamadı</h1>
          <p className="mt-2">{view.message}</p>
          <button type="button" className="btn btn-primary mt-5" onClick={load}>
            <ArrowClockwise size={20} weight="bold" aria-hidden />
            Tekrar dene
          </button>
        </div>
      )}

      {view.kind === 'open' &&
        (player === null || editingName ? (
          <NameStep
            title={view.game.title}
            creatorName={view.game.creatorName ?? null}
            people={view.game.names.length}
            players={view.players}
            initial={player ?? lastName()}
            onDone={(name) => {
              setPlayer(name)
              setEditingName(false)
              try {
                localStorage.setItem(LAST_NAME_KEY, name)
              } catch {
                // yok say
              }
              const draft = loadDraft(code)
              saveDraft(code, { name, cells: draft?.cells ?? [] })
            }}
          />
        ) : (
          <PlayView
            code={code}
            game={view.game}
            playerName={player}
            initialHints={view.hints}
            savedCells={loadDraft(code)?.cells ?? []}
            onPlayed={(result, animate) => setView({ kind: 'played', result, animate })}
            onAlreadyPlayed={load}
            onChangeName={() => setEditingName(true)}
          />
        ))}

      {view.kind === 'played' && <ResultView result={view.result} animate={view.animate} url={gameUrl(code)} />}
    </PageShell>
  )
}

function GoneCard() {
  return (
    <div className="rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg">
      <span className="flex size-14 items-center justify-center rounded-full border-2 border-ink bg-paper" aria-hidden>
        <Ghost size={30} weight="bold" />
      </span>
      <h1 className="mt-4 text-2xl font-black tracking-tight">Bu oyun artık yok</h1>
      <p className="mt-2">
        Süresi dolmuş, kurucusu silmiş ya da link hatalı olabilir. Oyunlar ve fotoğrafları seçilen süre
        sonunda kendiliğinden silinir.
      </p>
      <a href="/" className="btn btn-primary mt-5">
        Kendi pusulanı yap
      </a>
    </div>
  )
}

function NameStep({
  title,
  creatorName,
  people,
  players,
  initial,
  onDone,
}: {
  title: string
  creatorName: string | null
  people: number
  /** Şimdiye kadar oynayan; eski sunucuda bilinmiyorsa null. */
  players: number | null
  initial: string
  onDone: (name: string) => void
}) {
  const id = useId()
  const [value, setValue] = useState(initial)
  const [touched, setTouched] = useState(false)
  const clean = cleanPlayerName(value)
  const invalid = touched && clean === null

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-4 rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg"
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (clean) onDone(clean)
      }}
    >
      <div>
        <h1 className="text-2xl leading-tight font-black tracking-tight text-balance">
          {creatorName ? (
            <>
              <span className="bg-accent px-1">{creatorName}</span> seni challenge'a davet etti
            </>
          ) : (
            'Bu kim?'
          )}
        </h1>
        <p className="mt-2">Maddelere bak, her hücreye doğru ismi yerleştir. Süre tutuluyor.</p>
        <p className="mt-3 text-sm font-bold text-muted">
          {title || 'Karakter pusulası'} · {people} kişilik pusula
          {players !== null && <> · {players === 0 ? 'henüz kimse oynamadı' : `${players} kişi oynadı`}</>}
        </p>
        <p className="mt-1 text-xs text-muted">Her cihaz bir kez oynayabilir.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-black tracking-wide uppercase">
          Adın
        </label>
        <input
          id={id}
          className="field"
          value={value}
          maxLength={PLAYER_NAME_MAX * 2}
          autoComplete="nickname"
          enterKeyHint="go"
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-help`}
          onChange={(e) => setValue(Array.from(e.target.value).slice(0, PLAYER_NAME_MAX).join(''))}
          onBlur={() => setTouched(true)}
        />
        <p id={`${id}-help`} className={`text-xs ${invalid ? 'font-bold text-danger' : 'text-muted'}`}>
          {invalid ? 'Bir ad yaz (en fazla 20 karakter).' : 'Sıralamada bu ad görünür.'}
        </p>
      </div>
      <button type="submit" className="btn btn-primary self-start">
        <Play size={20} weight="bold" aria-hidden />
        Başla
      </button>
    </form>
  )
}
