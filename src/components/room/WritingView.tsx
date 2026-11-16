import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  CircleNotch,
  CloudCheck,
  DiceFive,
  PencilSimple,
  StopCircle,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BULLET_MAX, ROOM_SAVE_DEBOUNCE_MS } from '../../constants'
import { DEFAULT_THEME } from '../../data/themes'
import { bulletKey, pickBullets } from '../../lib/bulletPool'
import { DraftSaver, draftKey, type SaveStatus } from '../../lib/draftSaver'
import { clampBullet } from '../../lib/limits'
import {
  roomAdmin,
  roomErrorCode,
  roomErrorMessage,
  saveItems,
  type ItemDraft,
  type MemberView,
  type RoomPlayer,
  type RoomSession,
  type WritingState,
} from '../../lib/roomApi'
import { useUiStore } from '../../store/uiStore'
import type { MenuItem } from '../ActionMenu'
import { CharCounter } from '../CharCounter'
import { Modal } from '../Modal'
import { useFrameBox } from '../../hooks/useFrameBox'
import { useServerNow } from '../../hooks/useServerNow'
import { Countdown } from './Countdown'
import { RoomFrame } from './RoomFrame'

/** Bu hatalardan sonra taslak kaydı durur; ekran sunucudan yeniden çekilir. */
const FATAL = new Set(['not_writing', 'time_up', 'not_found', 'not_member'])
const RETRY_MS = 3_000
/** Süre bitmeden bu kadar önce bekleyen taslak gönderilir. */
const FINAL_FLUSH_LEAD_MS = 800

type Texts = Record<string, string>
type Confirm = 'ready-empty' | 'end' | 'delete'

const initialTexts = (w: WritingState): Texts => {
  const out: Texts = {}
  for (const a of w.assignments) a.texts.forEach((t, slot) => (out[draftKey(a.targetId, slot)] = t))
  return out
}

const toDrafts = (texts: Texts): ItemDraft[] =>
  Object.entries(texts).map(([key, text]) => {
    const i = key.lastIndexOf(':')
    return { target: key.slice(0, i), slot: Number(key.slice(i + 1)), text }
  })

/**
 * YAZMA: hedefin adı ve fotoğrafı büyük; Klasik'te 3 hedef arasında "1/3" ile geçiş,
 * Hızlı'da tek hedefe 3 madde. Taslak 1,5 sn duraklamada, odak kaybında ve süre
 * sonunda kaydedilir (sinyalsiz). "Hazırım"dan sonra süre bitene kadar düzenlemeye dönülebilir.
 * Geri sayım üstte, "Hazırım" altta sabit; klavye açıkken hedef fotoğrafı küçülür.
 */
export function WritingView({
  data,
  session,
  clockOffset,
  onChanged,
  onDeleted,
}: {
  data: MemberView
  session: RoomSession
  clockOffset: number
  onChanged: () => void
  onDeleted: () => void
}) {
  const writing = data.writing!
  const showToast = useUiStore((s) => s.showToast)
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])
  const [texts, setTexts] = useState<Texts>(() => initialTexts(writing))
  const textsRef = useRef(texts)
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set())
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [page, setPage] = useState(0)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)
  const lastRolled = useRef(new Map<string, string>())
  const saverRef = useRef<DraftSaver | null>(null)
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  })

  const now = useServerNow(clockOffset)
  const timeUp = now >= writing.endsAt
  const classic = data.settings.mode === 'classic'
  const assignments = writing.assignments
  const { keyboard } = useFrameBox()
  // Klavye açılınca/kapanınca çerçeve küçülür: odaktaki alan görünür kalsın.
  useEffect(() => {
    const el = document.activeElement
    if (el instanceof HTMLInputElement) requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }))
  }, [keyboard])

  // Taslak kaydedici: oturum boyunca bir tane; sayfa gizlenince/kapanınca bekleyen gönderilir.
  useEffect(() => {
    const saver = new DraftSaver(
      {
        save: (items, opts) => saveItems(session, items, opts),
        debounceMs: ROOM_SAVE_DEBOUNCE_MS,
        retryMs: RETRY_MS,
        onStatus: setStatus,
        onResult: (r) => {
          setFlagged(new Set(r.flagged.map((f) => draftKey(f.target, f.slot))))
          if (r.advanced) onChangedRef.current()
        },
        isFatal: (e) => {
          const fatal = FATAL.has(roomErrorCode(e) ?? '')
          if (fatal) onChangedRef.current()
          return fatal
        },
      },
      toDrafts(textsRef.current),
    )
    saverRef.current = saver
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush({ keepalive: true })
    }
    const onPageHide = () => void saver.flush({ keepalive: true })
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      void saver.flush()
      if (saverRef.current === saver) saverRef.current = null
    }
  }, [session])

  // Süre bitmeden hemen önce bekleyen taslağı gönder (admin erken bitirdiyse hemen).
  useEffect(() => {
    const wait = writing.endsAt - (Date.now() + clockOffset) - FINAL_FLUSH_LEAD_MS
    const t = setTimeout(() => void saverRef.current?.flush(), Math.max(0, wait))
    return () => clearTimeout(t)
  }, [writing.endsAt, clockOffset])

  const change = (target: string, slot: number, value: string) => {
    const key = draftKey(target, slot)
    const text = clampBullet(value)
    const next = { ...textsRef.current, [key]: text }
    textsRef.current = next
    setTexts(next)
    if (flagged.has(key)) {
      const f = new Set(flagged)
      f.delete(key)
      setFlagged(f)
    }
    saverRef.current?.update(target, slot, text)
  }

  const roll = (target: string, slot: number) => {
    const key = draftKey(target, slot)
    const used = new Set(Object.values(textsRef.current).filter((t) => t.trim()).map(bulletKey))
    const last = lastRolled.current.get(key)
    const pick = pickBullets(DEFAULT_THEME.pool, used, 1, { avoid: last ? [last] : [] })[0]
    if (!pick) {
      showToast('Havuzda kullanılmamış madde kalmadı.')
      return
    }
    lastRolled.current.set(key, pick)
    change(target, slot, pick)
  }

  const setReady = async (ready: boolean) => {
    const saver = saverRef.current
    if (!saver || busy) return
    setBusy(true)
    try {
      const r = await saver.setReady(ready)
      setConfirm(null)
      if (ready && r.flagged.length > 0) {
        showToast('Bir madde argo süzgecine takıldı ve boş kaydedildi. Düzenleyip değiştirebilirsin.', 'error')
      }
      onChanged()
    } catch (e) {
      showToast(roomErrorMessage(e, 'Kaydedilemedi. Tekrar dener misin?'), 'error')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const runAdmin = async (kind: 'end' | 'delete') => {
    if (busy) return
    setBusy(true)
    try {
      if (kind === 'end') {
        await saverRef.current?.flush()
        await roomAdmin(session, { action: 'end-writing' })
        setConfirm(null)
        onChanged()
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

  const emptyCount = Object.values(texts).filter((t) => t.trim() === '').length
  const readyLabel = `${writing.readyCount}/${writing.total} hazır`

  let body
  let footer = null
  if (timeUp) {
    body = (
      <section className="rounded-2xl border-[3px] border-ink bg-surface p-6 text-center shadow-brutal-lg" role="status">
        <CircleNotch size={32} weight="bold" className="mx-auto animate-spin" aria-hidden />
        <h1 className="mt-3 text-2xl font-black tracking-tight">Süre doldu, maddeler toplanıyor…</h1>
        <p className="mt-2">Açılış birazdan başlıyor.</p>
      </section>
    )
  } else if (writing.meReady) {
    body = (
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-brutal-lg">
        <div className="shrink-0 text-center">
          <CheckCircle size={40} weight="fill" className="mx-auto" aria-hidden />
          <h1 className="mt-1 text-2xl font-black tracking-tight">Hazırsın</h1>
          <p className="mt-0.5 text-[15px]">Diğerleri bekleniyor · {readyLabel}</p>
        </div>
        <ul data-room-scroll="mine" className="mt-3 flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain">
          {assignments.map((a) => {
            const p = players.get(a.targetId)
            return (
              <li key={a.targetId} className="flex gap-3 rounded-xl border-2 border-ink bg-paper p-2">
                {p && <img src={p.photo} alt="" className="size-12 shrink-0 rounded-lg border-2 border-ink object-cover" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black">{p?.name ?? 'Oyuncu'}</p>
                  {a.texts.map((_, slot) => {
                    const key = draftKey(a.targetId, slot)
                    const t = flagged.has(key) ? '' : (texts[key] ?? '')
                    return (
                      <p key={slot} className={`text-sm wrap-break-word ${t ? '' : 'text-muted italic'}`}>
                        {t || (flagged.has(key) ? 'boş (argo süzgeci)' : 'boş')}
                      </p>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    )
    footer = (
      <button type="button" className="btn min-h-12 w-full text-base" onClick={() => setReady(false)} disabled={busy}>
        {busy ? (
          <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
        ) : (
          <PencilSimple size={20} weight="bold" aria-hidden />
        )}
        Maddelerimi düzenle
      </button>
    )
  } else {
    const current = classic ? assignments.slice(page, page + 1) : assignments
    body = (
        <section
          data-room-scroll="writing"
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-2xl border-[3px] border-ink bg-surface p-3 shadow-brutal-lg sm:p-4"
          aria-labelledby="target-name"
        >
          <div className={`flex min-h-11 shrink-0 items-center justify-between gap-2 ${keyboard ? 'hidden' : ''}`}>
            <p className="text-sm font-black tracking-wide text-muted uppercase">
              {classic ? (
                <>
                  Kime yazıyorsun · <span className="text-ink">{page + 1}/{assignments.length}</span>
                </>
              ) : (
                'Kime yazıyorsun'
              )}
            </p>
            {classic && assignments.length > 1 && !keyboard && (
              <PageNav page={page} count={assignments.length} onPage={setPage} />
            )}
          </div>
          {current.map((a) => (
            <TargetEditor
              key={a.targetId}
              target={players.get(a.targetId)}
              slots={a.texts.length}
              texts={texts}
              flagged={flagged}
              targetId={a.targetId}
              compact={keyboard}
              nav={
                classic && assignments.length > 1 ? (
                  <PageNav page={page} count={assignments.length} onPage={setPage} />
                ) : null
              }
              onChange={change}
              onRoll={roll}
              onBlur={() => void saverRef.current?.flush()}
              onLastEnter={() => {
                if (classic && page < assignments.length - 1) setPage(page + 1)
              }}
            />
          ))}
          {classic && assignments.length > 1 && !keyboard && (
            <div className="mt-auto flex shrink-0 justify-center gap-2 pt-3" role="group" aria-label="Kişiler">
              {assignments.map((a, i) => {
                const p = players.get(a.targetId)
                const filled = (texts[draftKey(a.targetId, 0)] ?? '').trim() !== ''
                return (
                  <button
                    key={a.targetId}
                    type="button"
                    onClick={() => setPage(i)}
                    aria-current={i === page ? 'step' : undefined}
                    aria-label={`${i + 1}. kişi: ${p?.name ?? 'Oyuncu'}${filled ? ', yazıldı' : ', boş'}`}
                    className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border-2 border-ink px-3 text-sm font-black ${
                      i === page ? 'bg-ink text-surface' : filled ? 'bg-accent' : 'bg-surface'
                    }`}
                  >
                    {filled ? <CheckCircle size={16} weight="fill" aria-hidden /> : null}
                    {i + 1}
                  </button>
                )
              })}
            </div>
          )}
        </section>
    )
    footer = (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          className="btn btn-primary min-h-12 w-full text-base"
          onClick={() => (emptyCount > 0 ? setConfirm('ready-empty') : setReady(true))}
          disabled={busy}
        >
          {busy ? (
            <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
          ) : (
            <CheckCircle size={20} weight="fill" aria-hidden />
          )}
          Hazırım
        </button>
        <SaveStatusLine status={status} />
      </div>
    )
  }

  const menu: MenuItem[] = data.me.isAdmin
    ? [
        ...(!timeUp
          ? [
              {
                id: 'end',
                label: 'Yazmayı bitir',
                description: 'Herkes için yazma süresi biter',
                icon: <StopCircle size={20} weight="bold" />,
                onSelect: () => setConfirm('end'),
              },
            ]
          : []),
        {
          id: 'delete',
          label: 'Odayı sil',
          icon: <Trash size={20} weight="bold" />,
          danger: true,
          onSelect: () => setConfirm('delete'),
        },
      ]
    : []

  return (
    <RoomFrame title="Yazma" menu={menu} footer={footer}>
      <div className="shrink-0">
        <Countdown endsAt={writing.endsAt} now={now} right={readyLabel} />
      </div>
      {body}

      {confirm && (
        <Modal
          size="sm"
          title={
            confirm === 'ready-empty'
              ? emptyCount === 1
                ? '1 madde boş'
                : `${emptyCount} madde boş`
              : confirm === 'end'
                ? 'Yazma bitirilsin mi?'
                : 'Oda silinsin mi?'
          }
          onClose={() => !busy && setConfirm(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={busy}>
                {confirm === 'ready-empty' ? 'Yazmaya dön' : 'Vazgeç'}
              </button>
              <button
                type="button"
                className={confirm === 'delete' ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={() => (confirm === 'ready-empty' ? setReady(true) : runAdmin(confirm))}
                disabled={busy}
                data-autofocus
              >
                {busy && <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden />}
                {confirm === 'ready-empty' ? 'Yine de hazırım' : confirm === 'end' ? 'Bitir' : 'Sil'}
              </button>
            </>
          }
        >
          <p className="text-[15px]">
            {confirm === 'ready-empty'
              ? 'Boş maddeler açılışta boş görünür. Süre bitene kadar geri dönüp yazabilirsin.'
              : confirm === 'end'
                ? `Herkes için yazma süresi biter (${readyLabel}). O ana kadar yazılanlar kaydedilir; boş kalan maddeler boş kalır.`
                : 'Oda, herkesin fotoğrafı, adı ve maddeleriyle birlikte hemen silinir. Geri alınamaz.'}
          </p>
        </Modal>
      )}
    </RoomFrame>
  )
}

function TargetEditor({
  target,
  targetId,
  compact,
  nav,
  slots,
  texts,
  flagged,
  onChange,
  onRoll,
  onBlur,
  onLastEnter,
}: {
  target: RoomPlayer | undefined
  targetId: string
  /** Klavye açık: foto küçük, adın yanında; açıklama gizli. */
  compact: boolean
  /** Klavye açıkken adın yanında gösterilen önceki/sonraki düğmeleri. */
  nav: React.ReactNode
  slots: number
  texts: Record<string, string>
  flagged: ReadonlySet<string>
  onChange: (target: string, slot: number, value: string) => void
  onRoll: (target: string, slot: number) => void
  onBlur: () => void
  onLastEnter: () => void
}) {
  const uid = useId()
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const name = target?.name ?? 'Oyuncu'
  // Klavye açıkken kişi değişince yazmaya yeni kişinin ilk alanından devam edilir.
  const compactAtMount = useRef(compact)
  useEffect(() => {
    if (compactAtMount.current) inputs.current[0]?.focus({ preventScroll: true })
  }, [])
  return (
    <div>
      {compact ? (
        <div className="mt-1 flex items-center gap-3">
          {target && (
            <img
              src={target.photo}
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-xl border-2 border-ink object-cover"
            />
          )}
          <h1 id="target-name" className="min-w-0 flex-1 truncate text-2xl leading-tight font-black tracking-tight">
            {name}
          </h1>
          {nav}
        </div>
      ) : (
        <div className="mt-1 flex flex-col items-center text-center">
          {target && (
            <img
              src={target.photo}
              alt=""
              width={176}
              height={176}
              className="size-[clamp(72px,calc(100dvh-500px),176px)] rounded-2xl border-[3px] border-ink object-cover shadow-brutal"
            />
          )}
          <h1 id="target-name" className="mt-2 max-w-full text-3xl leading-tight font-black tracking-tight wrap-break-word">
            {name}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {slots > 1 ? `${name} için ${slots} madde yaz.` : `${name} için bir madde yaz.`}
          </p>
        </div>
      )}
      <ul className={`flex flex-col ${compact ? 'mt-2 gap-2' : 'mt-3 gap-3'}`}>
        {Array.from({ length: slots }, (_, slot) => {
          const key = draftKey(targetId, slot)
          const value = texts[key] ?? ''
          const id = `${uid}-${slot}`
          const isFlagged = flagged.has(key)
          return (
            <li key={slot}>
              <label htmlFor={id} className="sr-only">
                {slots > 1 ? `${name} için ${slot + 1}. madde` : `${name} için madde`}
              </label>
              <div className="flex items-center gap-1.5">
                <div className="relative min-w-0 flex-1">
                  <input
                    id={id}
                    ref={(el) => {
                      inputs.current[slot] = el
                    }}
                    className="field pr-14"
                    value={value}
                    placeholder={slots > 1 ? `${slot + 1}. madde` : 'Bir madde yaz'}
                    autoComplete="off"
                    enterKeyHint={slot < slots - 1 ? 'next' : 'done'}
                    aria-invalid={isFlagged || undefined}
                    aria-describedby={`${id}-count${isFlagged ? ` ${id}-err` : ''}`}
                    onChange={(e) => onChange(targetId, slot, e.target.value)}
                    onBlur={onBlur}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      e.preventDefault()
                      if (slot < slots - 1) inputs.current[slot + 1]?.focus()
                      else {
                        e.currentTarget.blur()
                        onLastEnter()
                      }
                    }}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] leading-none">
                    <CharCounter id={`${id}-count`} value={value} max={BULLET_MAX} />
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-icon shrink-0"
                  aria-label={slots > 1 ? `${slot + 1}. madde için zar at` : 'Zar at'}
                  title="Zar at: havuzdan rastgele madde"
                  onClick={() => onRoll(targetId, slot)}
                >
                  <DiceFive size={20} weight="bold" aria-hidden />
                </button>
              </div>
              {isFlagged && (
                <p id={`${id}-err`} className="mt-1 flex items-center gap-1 text-sm font-bold text-danger">
                  <WarningCircle size={16} weight="bold" aria-hidden />
                  Bu odada argo kapalı; bu madde kaydedilmedi.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Önceki/sonraki kişi. Klavye açıkken dokunuş odağı alandan almaz (klavye kapanmasın). */
function PageNav({ page, count, onPage }: { page: number; count: number; onPage: (p: number) => void }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        className="btn btn-icon"
        aria-label="Önceki kişi"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onPage(Math.max(0, page - 1))}
        disabled={page === 0}
      >
        <CaretLeft size={20} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className="btn btn-icon"
        aria-label="Sonraki kişi"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => onPage(Math.min(count - 1, page + 1))}
        disabled={page === count - 1}
      >
        <CaretRight size={20} weight="bold" aria-hidden />
      </button>
    </div>
  )
}

function SaveStatusLine({ status }: { status: SaveStatus }) {
  const text =
    status === 'saving'
      ? 'Kaydediliyor…'
      : status === 'saved'
        ? 'Kaydedildi'
        : status === 'error'
          ? 'Kaydedilemedi, yeniden denenecek'
          : ''
  return (
    <p
      className={`flex min-h-5 items-center justify-center gap-1 text-sm ${status === 'error' ? 'font-bold text-danger' : 'text-muted'}`}
      role="status"
    >
      {status === 'saved' && <CloudCheck size={16} weight="bold" aria-hidden />}
      {text}
    </p>
  )
}
