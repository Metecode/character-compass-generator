import { CircleNotch, WarningCircle } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import {
  CREATOR_NAME_KEY,
  PLAYER_NAME_MAX,
  ROOM_DEFAULT_WRITE_SECONDS,
  ROOM_WRITE_SECONDS,
} from '../../constants'
import { cleanPlayerName } from '../../lib/play'
import type { RoomMode } from '../../lib/roomApi'
import { useRoomsStore } from '../../store/roomsStore'
import { CharCounter } from '../CharCounter'
import { Modal } from '../Modal'
import { RoomPhotoField } from './RoomPhotoField'
import { MODE_LABELS, writeTimeLabel } from './roomText'

function savedName(): string {
  try {
    return localStorage.getItem(CREATOR_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * "Canlı oda kur": mod, yazma süresi, argo izni, ad ve kendi fotoğrafı.
 * Ağ kodu yalnızca "Odayı kur"a basınca yüklenir; oda kurulunca /r/{code}'a geçilir.
 */
export function RoomCreateDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<RoomMode>('classic')
  const [writeSeconds, setWriteSeconds] = useState<number>(ROOM_DEFAULT_WRITE_SECONDS)
  const [allowProfanity, setAllowProfanity] = useState(true)
  const [name, setName] = useState(savedName)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modeId = useId()
  const timeId = useId()
  const nameId = useId()
  const profanityId = useId()
  const clean = cleanPlayerName(name)
  const nameInvalid = touched && clean === null

  const onCreate = async () => {
    setTouched(true)
    if (busy || !clean || !photo) return
    setBusy(true)
    setError(null)
    const api = await import('../../lib/roomApi')
    try {
      const s = await api.createRoom({ mode, writeSeconds, allowProfanity, name: clean }, photo)
      try {
        localStorage.setItem(CREATOR_NAME_KEY, clean)
      } catch {
        // yok say
      }
      useRoomsStore.getState().saveRoom(s)
      window.location.assign(`/r/${s.code}`)
    } catch (e) {
      setError(api.createRoomErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Canlı oda kur"
      onClose={() => !busy && !cropping && onClose()}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button type="button" className="btn btn-primary" onClick={onCreate} disabled={busy} aria-busy={busy}>
            {busy && <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />}
            {busy ? 'Kuruluyor…' : 'Odayı kur'}
          </button>
        </>
      }
    >
      <p className="text-sm">
        Arkadaşların linkle ya da QR ile katılır. Herkes birbirine madde yazar, sonra maddelerden kimin kim
        olduğunu birlikte tahmin edersiniz.
      </p>

      <fieldset className="mt-4">
        <legend id={modeId} className="text-sm font-bold">
          Mod
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-labelledby={modeId}>
          {(Object.keys(MODE_LABELS) as RoomMode[]).map((m, i) => (
            <label
              key={m}
              className={`flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-xl border-2 border-ink p-3 has-[:focus-visible]:border-focus ${
                mode === m ? 'bg-accent shadow-brutal-sm' : 'bg-surface'
              }`}
            >
              <input
                type="radio"
                name={modeId}
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
                className="sr-only"
                data-autofocus={i === 0 ? true : undefined}
              />
              <span className="font-black">{MODE_LABELS[m].title}</span>
              <span className="text-xs">{MODE_LABELS[m].description}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend id={timeId} className="text-sm font-bold">
          Yazma süresi
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby={timeId}>
          {ROOM_WRITE_SECONDS.map((s) => (
            <label
              key={s}
              className={`btn cursor-pointer has-[:focus-visible]:border-focus ${writeSeconds === s ? 'btn-primary' : ''}`}
            >
              <input
                type="radio"
                name={timeId}
                value={s}
                checked={writeSeconds === s}
                onChange={() => setWriteSeconds(s)}
                className="sr-only"
              />
              {writeTimeLabel(s)}
            </label>
          ))}
        </div>
      </fieldset>

      <label htmlFor={profanityId} className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-bold">
        <input
          id={profanityId}
          type="checkbox"
          className="size-5 shrink-0 accent-ink"
          checked={allowProfanity}
          onChange={(e) => setAllowProfanity(e.target.checked)}
        />
        <span>
          Küfür ve argo serbest
          <span className="block text-xs font-normal text-muted">Kapalıysa basit bir kelime süzgeci uygulanır.</span>
        </span>
      </label>

      <div className="mt-4 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={nameId} className="text-sm font-bold">
            Adın
          </label>
          <CharCounter id={`${nameId}-count`} value={name} max={PLAYER_NAME_MAX} />
        </div>
        <input
          id={nameId}
          className="field"
          value={name}
          autoComplete="nickname"
          aria-invalid={nameInvalid || undefined}
          aria-describedby={`${nameId}-help ${nameId}-count`}
          onChange={(e) => setName(Array.from(e.target.value).slice(0, PLAYER_NAME_MAX).join(''))}
          onBlur={() => setTouched(true)}
        />
        <p id={`${nameId}-help`} className={`text-xs ${nameInvalid ? 'font-bold text-danger' : 'text-muted'}`}>
          {nameInvalid
            ? 'Bir ad yaz (en fazla 20 karakter).'
            : `Davette “${clean ?? 'Adın'} seni canlı pusula oyununa çağırıyor” diye görünür. Sen de oyuncusun.`}
        </p>
      </div>

      <div className="mt-4">
        <RoomPhotoField
          value={photo}
          onChange={setPhoto}
          invalid={touched && !photo}
          onCroppingChange={setCropping}
        />
      </div>

      {error && (
        <p role="alert" className="mt-3 flex gap-2 rounded-lg border-2 border-danger bg-[#ffe3e3] p-2 text-sm font-bold text-danger">
          <WarningCircle size={20} weight="bold" className="shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <p className="mt-3 text-xs text-muted">
        Oda ve fotoğraflar oyun bitince, en geç 2 saat içinde silinir.{' '}
        <a href="/gizlilik" target="_blank" rel="noopener" className="underline">
          Gizlilik
        </a>
      </p>
    </Modal>
  )
}
