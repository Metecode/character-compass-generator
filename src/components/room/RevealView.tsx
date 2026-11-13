import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Confetti,
  Crown,
  Eye,
  EyeSlash,
  SmileySad,
  Trash,
  Trophy,
} from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { boardCompass } from '../../lib/boardCompass'
import { regionOf, regionsOf } from '../../lib/grid'
import {
  roomAction,
  roomAdmin,
  roomErrorCode,
  roomErrorMessage,
  type MemberView,
  type RoomItem,
  type RoomPlayer,
  type RoomSession,
} from '../../lib/roomApi'
import { useUiStore } from '../../store/uiStore'
import { Modal } from '../Modal'
import { RoomBoard } from './RoomBoard'
import { ScoreStrip } from './ScoreStrip'

/** Bu hatalarda kullanıcıya bir şey söylemeden ekran yenilenir (çift dokunma, iki sekme). */
const SILENT = new Set(['stale', 'not_reveal'])

type Confirm = { kind: 'hide'; item: RoomItem } | { kind: 'delete' }

/**
 * AÇILIŞ: her hücre iki adım. (1) Maddeler açık, herkes "bu kim" tahmin eder;
 * (2) admin "Aç" der, foto ve isim döner, bilenler görünür. Admin "Sıradaki" ile
 * ilerler; son hücreden sonra sonuçlar. Ara skor üstte şeritte.
 */
export function RevealView({
  data,
  session,
  onChanged,
  onDeleted,
}: {
  data: MemberView
  session: RoomSession
  onChanged: () => void
  onDeleted: () => void
}) {
  const r = data.reveal!
  const showToast = useUiStore((s) => s.showToast)
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])
  const isAdmin = data.me.isAdmin
  const shown = r.step === 'shown'
  const last = r.position + 1 >= r.total
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  // Tahmin: dokununca hemen seçili görünür; istekler sırayla gider, en son seçim kazanır.
  // Bekleyen seçim yalnızca seçildiği hücre/adım için geçerli (adım değişince kendiliğinden düşer).
  const stepKey = `${r.position}:${r.step}`
  const [pending, setPending] = useState<{ key: string; id: string } | null>(null)
  const sending = useRef(false)
  const wanted = useRef<{ key: string; id: string; position: number } | null>(null)
  const myGuess = pending?.key === stepKey ? pending.id : r.myGuess

  const guess = async (playerId: string) => {
    if (!r.canGuess || shown) return
    setPending({ key: stepKey, id: playerId })
    wanted.current = { key: stepKey, id: playerId, position: r.position }
    if (sending.current) return
    sending.current = true
    try {
      let sent: string | null = null
      while (wanted.current && `${wanted.current.key}|${wanted.current.id}` !== sent) {
        const w: { key: string; id: string; position: number } = wanted.current
        sent = `${w.key}|${w.id}`
        await roomAction(session, { action: 'guess', position: w.position, playerId: w.id })
      }
      onChanged()
    } catch (e) {
      setPending(null)
      wanted.current = null
      if (!SILENT.has(roomErrorCode(e) ?? '')) showToast(roomErrorMessage(e, 'Tahmin kaydedilemedi. Tekrar dener misin?'), 'error')
      onChanged()
    } finally {
      sending.current = false
    }
  }

  const advance = async () => {
    if (busy) return
    setBusy(true)
    try {
      await roomAdmin(session, { action: shown ? 'next' : 'reveal', position: r.position })
      onChanged()
    } catch (e) {
      if (!SILENT.has(roomErrorCode(e) ?? '')) showToast(roomErrorMessage(e, 'İşlem yapılamadı. Tekrar dener misin?'), 'error')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const runConfirm = async () => {
    if (!confirm || busy) return
    setBusy(true)
    try {
      if (confirm.kind === 'hide') {
        await roomAdmin(session, { action: 'hide', cell: r.cell, key: confirm.item.key })
        setConfirm(null)
        onChanged()
      } else {
        await roomAdmin(session, { action: 'delete' })
        onDeleted()
      }
    } catch (e) {
      showToast(roomErrorMessage(e, 'İşlem yapılamadı. Tekrar dener misin?'), 'error')
      setConfirm(null)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const color = useMemo(() => {
    const regions = regionsOf(boardCompass(r.gridSize, []))
    return regions[regionOf(r.cell, r.gridSize)]?.color ?? '#ffffff'
  }, [r.gridSize, r.cell])
  const target = r.target ? players.get(r.target) : undefined
  const correct = r.correct ?? []
  const fresh = useMemo(() => new Set(shown ? (r.correct ?? []) : []), [shown, r.correct])
  const admin = data.players.find((p) => p.isAdmin)
  const adminAway = !isAdmin && admin && !admin.online

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black tracking-wide text-muted uppercase">
          Açılış · <span className="text-ink tabular-nums">{r.position + 1}/{r.total}</span>
        </p>
        <p className="text-sm font-bold text-muted">{shown ? 'Açıldı' : 'Bu kim?'}</p>
      </div>
      <ScoreStrip scores={r.scores} players={players} meId={data.me.id} fresh={fresh} />

      {/* Kart: tahmin adımında maddeler; açılınca döner, foto ve isim görünür. */}
      <section
        key={stepKey}
        aria-labelledby="reveal-title"
        className={`rounded-2xl border-[3px] border-ink p-4 shadow-brutal-lg ${
          shown ? 'motion-safe:animate-flip-in' : 'motion-safe:animate-pop-in'
        }`}
        style={{ background: color }}
      >
        {shown && target ? (
          <div className="flex flex-col items-center text-center">
            <img
              src={target.photo}
              alt=""
              width={160}
              height={160}
              className="size-32 rounded-2xl border-[3px] border-ink object-cover shadow-brutal sm:size-40"
            />
            <h1 id="reveal-title" className="mt-3 max-w-full text-3xl leading-tight font-black tracking-tight wrap-break-word">
              {target.id === data.me.id ? `${target.name} (sen!)` : target.name}
            </h1>
          </div>
        ) : (
          <h1 id="reveal-title" className="text-center text-3xl font-black tracking-tight">
            Bu kim?
          </h1>
        )}

        <ItemList
          items={r.items}
          canHide={isAdmin}
          onHide={(item) => setConfirm({ kind: 'hide', item })}
        />

        {shown && <Verdict data={data} players={players} />}
      </section>

      <p className="sr-only" aria-live="polite">
        {shown && target
          ? `${target.name}. ${correct.length === 0 ? 'Kimse bilemedi.' : `${correct.length} kişi bildi.`}`
          : `${r.position + 1}. hücre açıldı, tahmin zamanı.`}
      </p>

      {!shown &&
        (r.canGuess ? (
          <section aria-labelledby="guess-title" className="rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-brutal">
            <h2 id="guess-title" className="text-lg font-black tracking-tight">
              Tahminin
            </h2>
            <p className="text-sm text-muted">Admin açana kadar değiştirebilirsin.</p>
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {r.candidates.map((id) => {
                const p = players.get(id)
                if (!p) return null
                return (
                  <li key={id}>
                    <CandidateButton
                      player={p}
                      me={id === data.me.id}
                      selected={myGuess === id}
                      onPick={() => void guess(id)}
                    />
                  </li>
                )
              })}
            </ul>
          </section>
        ) : (
          <p className="rounded-2xl border-2 border-dashed border-ink bg-surface p-4 text-center text-[15px]">
            Bu kişiye sen de madde yazdın, cevabı biliyorsun. Bu hücrede tahmin yok; diğerleri tahmin ediyor.
          </p>
        ))}

      {!isAdmin && (
        <p className="text-center text-sm text-muted" role="status">
          {adminAway
            ? `${admin.name} bağlı değil. 5 dakika içinde dönmezse adminlik sıradaki oyuncuya geçer.`
            : shown
              ? `${admin?.name ?? 'Admin'} sıradakini açacak.`
              : `${admin?.name ?? 'Admin'} açınca kim olduğu görünecek.`}
        </p>
      )}

      <section aria-label="Pusula" className="flex flex-col gap-2">
        <RoomBoard
          gridSize={r.gridSize}
          cells={r.opened}
          players={players}
          current={shown ? null : { cell: r.cell, items: r.items }}
          maxWidth={520}
        />
      </section>

      {isAdmin && (
        <div className="flex justify-end">
          <button type="button" className="btn btn-danger" onClick={() => setConfirm({ kind: 'delete' })}>
            <Trash size={20} weight="bold" aria-hidden />
            Odayı sil
          </button>
        </div>
      )}

      {/* Admin için tek ana düğme, ekranın altında sabit. */}
      {isAdmin && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <p className="min-w-0 flex-1 text-sm font-bold" aria-live="polite">
              {shown
                ? correct.length === 0
                  ? 'Kimse bilemedi'
                  : `${correct.length} kişi bildi`
                : (r.eligible ?? 0) === 0
                  ? 'Bu hücrede tahmin edecek kimse yok'
                  : `${r.guessed ?? 0}/${r.eligible} tahmin etti`}
            </p>
            <button type="button" className="btn btn-primary min-h-12 px-5 text-base" onClick={advance} disabled={busy}>
              {busy ? (
                <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
              ) : !shown ? (
                <Eye size={20} weight="bold" aria-hidden />
              ) : last ? (
                <Trophy size={20} weight="fill" aria-hidden />
              ) : (
                <ArrowRight size={20} weight="bold" aria-hidden />
              )}
              {!shown ? 'Aç' : last ? 'Sonuçları göster' : 'Sıradaki'}
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <Modal
          size="sm"
          title={confirm.kind === 'hide' ? 'Madde gizlensin mi?' : 'Oda silinsin mi?'}
          onClose={() => !busy && setConfirm(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={busy}>
                Vazgeç
              </button>
              <button type="button" className="btn btn-danger" onClick={runConfirm} disabled={busy} data-autofocus>
                {busy && <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden />}
                {confirm.kind === 'hide' ? 'Gizle' : 'Sil'}
              </button>
            </>
          }
        >
          {confirm.kind === 'hide' ? (
            <>
              <p className="rounded-lg border-2 border-ink bg-paper p-2 font-bold wrap-break-word">{confirm.item.text}</p>
              <p className="mt-2 text-[15px]">
                Herkesin ekranından ve sonuç pusulasından kalkar. Geri alınamaz.
              </p>
            </>
          ) : (
            <p className="text-[15px]">Oda, herkesin fotoğrafı, adı ve maddeleriyle birlikte hemen silinir. Geri alınamaz.</p>
          )}
        </Modal>
      )}
    </div>
  )
}

function ItemList({
  items,
  canHide,
  onHide,
}: {
  items: readonly RoomItem[]
  canHide: boolean
  onHide: (item: RoomItem) => void
}) {
  if (items.length === 0) {
    return <p className="mt-3 text-center text-[15px] italic">Bu kişiye madde yazılmamış.</p>
  }
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-2 rounded-xl border-2 border-ink bg-white/70 px-3 py-2">
          <span className="min-w-0 flex-1 text-xl leading-snug font-bold wrap-break-word">{it.text}</span>
          {canHide && (
            <button
              type="button"
              className="btn btn-icon shrink-0"
              aria-label={`Maddeyi gizle: ${it.text}`}
              title="Gizle"
              onClick={() => onHide(it)}
            >
              <EyeSlash size={18} weight="bold" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

function CandidateButton({
  player,
  me,
  selected,
  onPick,
}: {
  player: RoomPlayer
  me: boolean
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`relative flex w-full flex-col items-center gap-1 rounded-xl border-2 border-ink p-2 text-center transition-[transform,box-shadow,background-color] duration-150 ${
        selected ? 'bg-accent shadow-brutal' : 'bg-paper hover:-translate-y-px hover:shadow-brutal-sm'
      }`}
    >
      <img
        src={player.photo}
        alt=""
        width={64}
        height={64}
        className={`size-14 rounded-full border-2 border-ink object-cover sm:size-16 ${selected ? 'ring-4 ring-ink' : ''}`}
      />
      <span className="w-full truncate text-sm font-black">
        {player.name}
        {me && <span className="font-bold text-muted"> (sen)</span>}
      </span>
      {selected && (
        <CheckCircle
          size={24}
          weight="fill"
          aria-hidden
          className="absolute -top-2 -right-2 rounded-full bg-surface motion-safe:animate-pop-in"
        />
      )}
    </button>
  )
}

/** Gösterme adımında: benim sonucum ve doğru bilenler. */
function Verdict({ data, players }: { data: MemberView; players: ReadonlyMap<string, RoomPlayer> }) {
  const r = data.reveal!
  const correct = r.correct ?? []
  const meId = data.me.id
  const iWasRight = correct.includes(meId)
  const myGuess = r.myGuess ? players.get(r.myGuess) : undefined

  let mine
  if (!r.canGuess) mine = <p className="font-bold">Bu kişiye sen de yazmıştın.</p>
  else if (iWasRight) {
    mine = (
      <p className="inline-flex items-center gap-2 rounded-full border-[3px] border-ink bg-accent px-4 py-1.5 text-xl font-black shadow-brutal motion-safe:animate-cheer">
        <Confetti size={24} weight="fill" aria-hidden />
        Bildin! +1
      </p>
    )
  } else if (myGuess) {
    mine = (
      <p className="inline-flex items-center gap-1.5 font-bold">
        <SmileySad size={20} weight="bold" aria-hidden />
        Bilemedin; tahminin {myGuess.id === meId ? 'sendin' : myGuess.name}.
      </p>
    )
  } else mine = <p className="font-bold">Bu hücrede tahmin etmedin.</p>

  return (
    <div className="mt-4 flex flex-col items-center gap-3 text-center">
      {mine}
      <div className="w-full rounded-xl border-2 border-ink bg-white/70 p-3">
        <p className="text-sm font-black tracking-wide uppercase">
          {correct.length === 0 ? 'Kimse bilemedi' : `Bilenler · ${correct.length}`}
        </p>
        {correct.length > 0 && (
          <ul className="mt-2 flex flex-wrap justify-center gap-1.5">
            {correct.map((id, i) => {
              const p = players.get(id)
              return (
                <li
                  key={id}
                  className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-accent py-0.5 pr-2.5 pl-0.5 text-sm font-black motion-safe:animate-cheer"
                  style={{ animationDelay: `${150 + i * 90}ms` }}
                >
                  {p && <img src={p.photo} alt="" className="size-7 rounded-full border border-ink object-cover" />}
                  {id === meId ? 'Sen' : (p?.name ?? 'Oyuncu')}
                  {p?.isAdmin && <Crown size={12} weight="fill" aria-hidden />}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
