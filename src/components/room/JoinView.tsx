import { CircleNotch, SignIn, WarningCircle } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { PLAYER_NAME_MAX } from '../../constants'
import { cleanPlayerName } from '../../lib/play'
import { joinRoom, roomErrorCode, roomErrorMessage, type OutsiderView, type RoomSession } from '../../lib/roomApi'
import { CharCounter } from '../CharCounter'
import { RoomPhotoField } from './RoomPhotoField'

const LAST_NAME_KEY = 'compass-player-name'

function lastName(): string {
  try {
    return localStorage.getItem(LAST_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Katılmamış ziyaretçi: yalnızca kurucu adı ve kaç kişinin katıldığı görünür.
 * Ad + kendi fotoğrafı → "Odaya gir".
 */
export function JoinView({
  code,
  data,
  removed,
  onJoined,
}: {
  code: string
  data: OutsiderView
  removed: boolean
  onJoined: (s: RoomSession) => void
}) {
  const id = useId()
  const [name, setName] = useState(lastName)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const clean = cleanPlayerName(name)
  const nameInvalid = (touched && clean === null) || nameError !== null

  const submit = async () => {
    setTouched(true)
    setError(null)
    setNameError(null)
    if (!clean || !photo || busy) return
    setBusy(true)
    try {
      const s = await joinRoom(code, clean, photo)
      try {
        localStorage.setItem(LAST_NAME_KEY, clean)
      } catch {
        // yok say
      }
      onJoined(s)
    } catch (e) {
      const errCode = roomErrorCode(e)
      const message = roomErrorMessage(e, 'Odaya girilemedi. Tekrar dener misin?')
      if (errCode === 'name_taken' || errCode === 'invalid_name') setNameError(message)
      else setError(message)
      setBusy(false)
    }
  }

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-4 rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      noValidate
    >
      <div>
        {removed && (
          <p className="mb-3 rounded-lg border-2 border-ink bg-accent/40 p-2 text-sm font-bold">
            Odadan çıktın ya da çıkarıldın. İstersen yeniden katılabilirsin.
          </p>
        )}
        <h1 className="text-2xl leading-tight font-black tracking-tight text-balance">
          <span className="bg-accent px-1">{data.creatorName}</span> seni canlı pusula oyununa çağırıyor
        </h1>
        <p className="mt-2">
          Herkes birbirine esprili maddeler yazar, sonra maddelerden kimin kim olduğunu tahmin edersiniz.
        </p>
        <p className="mt-3 text-sm font-bold text-muted">
          {data.players === 0 ? 'Henüz kimse yok' : `${data.players} kişi katıldı`} · en fazla {data.maxPlayers}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={id} className="text-sm font-bold">
            Adın
          </label>
          <CharCounter id={`${id}-count`} value={name} max={PLAYER_NAME_MAX} />
        </div>
        <input
          id={id}
          className="field"
          value={name}
          autoComplete="nickname"
          enterKeyHint="go"
          aria-invalid={nameInvalid || undefined}
          aria-describedby={`${id}-help ${id}-count`}
          onChange={(e) => {
            setName(Array.from(e.target.value).slice(0, PLAYER_NAME_MAX).join(''))
            setNameError(null)
          }}
          onBlur={() => setTouched(true)}
        />
        <p id={`${id}-help`} className={`text-xs ${nameInvalid ? 'font-bold text-danger' : 'text-muted'}`}>
          {nameError ?? (nameInvalid ? 'Bir ad yaz (en fazla 20 karakter).' : 'Arkadaşlarının seni tanıdığı ad.')}
        </p>
      </div>

      <RoomPhotoField value={photo} onChange={setPhoto} invalid={touched && !photo} />

      {error && (
        <p role="alert" className="flex gap-2 rounded-lg border-2 border-danger bg-[#ffe3e3] p-2 text-sm font-bold text-danger">
          <WarningCircle size={20} weight="bold" className="shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary self-stretch sm:self-start" disabled={busy} aria-busy={busy}>
        {busy ? (
          <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
        ) : (
          <SignIn size={20} weight="bold" aria-hidden />
        )}
        {busy ? 'Giriliyor…' : 'Odaya gir'}
      </button>
      <p className="text-xs text-muted">
        Adın ve fotoğrafın yalnızca bu oyun için tutulur; oyun bitince, en geç 2 saat içinde silinir.{' '}
        <a href="/gizlilik" target="_blank" rel="noopener" className="underline">
          Gizlilik
        </a>
      </p>
    </form>
  )
}
