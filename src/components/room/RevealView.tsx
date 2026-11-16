import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  Confetti,
  Crown,
  Eye,
  EyeSlash,
  GridFour,
  Question,
  SmileySad,
  Trash,
  Trophy,
} from '@phosphor-icons/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useElementSize } from '../../hooks/useElementSize'
import { useIsDesktop } from '../../hooks/useMediaQuery'
import { boardCompass } from '../../lib/boardCompass'
import { regionOf, regionsOf } from '../../lib/grid'
import { LEFT_FR, RIGHT_FR, boardEdge } from '../../lib/revealLayout'
import {
  roomAction,
  roomAdmin,
  roomErrorCode,
  roomErrorMessage,
  type MemberView,
  type OpenCell,
  type RoomItem,
  type RoomPlayer,
  type RoomSession,
} from '../../lib/roomApi'
import { useUiStore } from '../../store/uiStore'
import type { MenuItem } from '../ActionMenu'
import { Modal } from '../Modal'
import { RoomBoard } from './RoomBoard'
import { RoomFrame } from './RoomFrame'
import { ScoreStrip } from './ScoreStrip'

/** Bu hatalarda kullanıcıya bir şey söylemeden ekran yenilenir (çift dokunma, iki sekme). */
const SILENT = new Set(['stale', 'not_reveal'])

type Confirm = { kind: 'hide'; item: RoomItem } | { kind: 'delete' }

/**
 * AÇILIŞ: her hücre iki adım. (1) Maddeler açık, herkes "bu kim" tahmin eder;
 * (2) admin "Aç" der, foto ve isim döner, bilenler görünür. Admin "Sıradaki" ile
 * ilerler; son hücreden sonra sonuçlar.
 *
 * Telefonda tek ekran: üstte ilerleme ve skor şeridi, ortada tek kart, altta
 * tahmin ya da admin düğmesi; o ana kadarki pusula "Pusulayı gör" ile alt sayfada.
 * Masaüstünde (lg) üstte tam genişlikte ilerleme + skor satırı, altında iki sütun:
 * solda kart ve panel, sağda kare pusula; iki sütun aynı üst ve alt kenarda (boardEdge).
 * Masaüstünde tahmin adımında fotoğrafın yerinde aynı boyda "?" yer tutucu durur.
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
  const desktop = useIsDesktop()
  // Masaüstü: alan (başlığın altı) ve üst satır ölçülür; kalan yükseklik sütunlara gider,
  // blok (üst satır + sütunlar) alanda dikeyde ortalanır.
  const [areaRef, area] = useElementSize<HTMLDivElement>()
  const [topRef, topRow] = useElementSize<HTMLDivElement>()
  const edge = boardEdge(area.width, area.height - topRow.height - BLOCK_GAP)
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])
  const isAdmin = data.me.isAdmin
  const shown = r.step === 'shown'
  const last = r.position + 1 >= r.total
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)

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
  const guessing = data.guessing
  /** Tahminsiz odanın ilk hücresi: "Aç"a kadar kapalı. */
  const closed = !shown && !r.cellGuessing
  const nextLabel = last ? 'Sonuçları göster' : guessing ? 'Sıradaki' : 'Aç'

  const board = (
    <RoomBoard
      gridSize={r.gridSize}
      cells={r.opened}
      players={players}
      current={shown || closed ? null : { cell: r.cell, items: r.items }}
      maxWidth={520}
      maxSize={desktop ? `${edge}px` : undefined}
    />
  )

  // Kart: tahmin adımında maddeler; açılınca döner, foto ve isim görünür.
  const card = (
    <section
      key={stepKey}
      data-room-card
      aria-labelledby="reveal-title"
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-2xl border-[3px] border-ink p-3 shadow-brutal-lg short:p-2.5 sm:p-4 ${
        shown ? 'motion-safe:animate-flip-in' : 'motion-safe:animate-pop-in'
      }`}
      style={{ background: color }}
    >
      <div className={desktop ? '' : 'my-auto'}>
        {shown && target && desktop ? (
          <div className="flex flex-col items-center text-center">
            <img src={target.photo} alt="" width={160} height={160} data-photo-slot className={`${DESK_PHOTO} object-cover`} />
            <h1 id="reveal-title" className={DESK_TITLE}>
              {target.id === data.me.id ? `${target.name} (sen!)` : target.name}
            </h1>
          </div>
        ) : shown && target ? (
          <div className="flex flex-col items-center text-center short:flex-row short:justify-center short:gap-3 short:text-left">
            <img
              src={target.photo}
              alt=""
              width={160}
              height={160}
              className="size-[clamp(64px,calc(100dvh-560px),160px)] shrink-0 rounded-2xl border-[3px] border-ink object-cover shadow-brutal"
            />
            <h1
              id="reveal-title"
              className="mt-2 max-w-full min-w-0 text-2xl leading-tight font-black tracking-tight wrap-break-word short:mt-0 sm:text-3xl"
            >
              {target.id === data.me.id ? `${target.name} (sen!)` : target.name}
            </h1>
          </div>
        ) : closed ? (
          <div className="py-2 text-center">
            <h1 id="reveal-title" className="text-2xl font-black tracking-tight sm:text-3xl">
              Açılış başlıyor
            </h1>
            <p className="mt-2 text-[15px]">
              Bu odada tahmin yok: {isAdmin ? 'sen' : (admin?.name ?? 'admin')} açtıkça kişiler ve maddeleri tek tek
              görünecek.
            </p>
          </div>
        ) : desktop ? (
          // Fotoğrafın geleceği yerde aynı boyda yer tutucu: açılınca içerik zıplamaz.
          <div className="flex flex-col items-center text-center">
            <div data-photo-slot aria-hidden className={`${DESK_PHOTO} flex items-center justify-center bg-white/70`}>
              <Question size={64} weight="bold" />
            </div>
            <h1 id="reveal-title" className={DESK_TITLE}>
              Bu kim?
            </h1>
          </div>
        ) : (
          <h1 id="reveal-title" className="text-center text-2xl font-black tracking-tight short:text-xl sm:text-3xl">
            Bu kim?
          </h1>
        )}

        {!closed && <ItemList items={r.items} canHide={isAdmin} onHide={(item) => setConfirm({ kind: 'hide', item })} />}

        {shown && r.cellGuessing && <Verdict data={data} players={players} />}
        {shown && last && guessing && (
          <p className="mt-3 text-center text-sm font-bold">Son kişi: tek aday kaldığı için tahmin yok.</p>
        )}
      </div>
    </section>
  )

  const waitingText = adminAway
    ? `${admin.name} bağlı değil. 5 dakika içinde dönmezse adminlik sıradaki oyuncuya geçer.`
    : shown
      ? `${admin?.name ?? 'Admin'} sıradakini açacak.`
      : `${admin?.name ?? 'Admin'} açınca kim olduğu görünecek.`

  const actions = (
    <div className="flex flex-col gap-2" data-room-actions>
      {!shown &&
        r.cellGuessing &&
        (r.canGuess ? (
          <GuessPicker
            key={stepKey}
            candidates={r.candidates}
            players={players}
            meId={data.me.id}
            isAdmin={isAdmin}
            selected={myGuess}
            onPick={(id) => void guess(id)}
          />
        ) : (
          <p className="rounded-xl border-2 border-dashed border-ink bg-paper px-3 py-2 text-center text-sm">
            Bu kişiye sen de madde yazdın, cevabı biliyorsun. Bu hücrede tahmin yok; diğerleri tahmin ediyor.
          </p>
        ))}

      {!isAdmin && (
        <p className="text-center text-sm text-muted" role="status">
          {waitingText}
        </p>
      )}

      {/* Admin için tek ana düğme. */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-sm font-bold" aria-live="polite">
            {!r.cellGuessing
              ? shown && last && guessing
                ? 'Son kişi'
                : 'Tahminsiz açılış'
              : shown
                ? correct.length === 0
                  ? 'Kimse bilemedi'
                  : `${correct.length} kişi bildi`
                : (r.eligible ?? 0) === 0
                  ? 'Bu hücrede tahmin edecek kimse yok'
                  : `${r.guessed ?? 0}/${r.eligible} tahmin etti`}
          </p>
          <button type="button" className="btn btn-primary min-h-12 shrink-0 px-5 text-base" onClick={advance} disabled={busy}>
            {busy ? (
              <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
            ) : !shown || (!last && !guessing) ? (
              <Eye size={20} weight="bold" aria-hidden />
            ) : last ? (
              <Trophy size={20} weight="fill" aria-hidden />
            ) : (
              <ArrowRight size={20} weight="bold" aria-hidden />
            )}
            {!shown ? 'Aç' : nextLabel}
          </button>
        </div>
      )}
    </div>
  )

  const menu: MenuItem[] = isAdmin
    ? [
        {
          id: 'delete',
          label: 'Odayı sil',
          icon: <Trash size={20} weight="bold" />,
          danger: true,
          onSelect: () => setConfirm({ kind: 'delete' }),
        },
      ]
    : []

  const top = (
    <div className="flex shrink-0 flex-col gap-2">
      <RevealProgress opened={r.opened} total={r.total} position={r.position} players={players} />
      {guessing && <ScoreStrip scores={r.scores} players={players} meId={data.me.id} fresh={fresh} />}
    </div>
  )

  return (
    <RoomFrame
      title={
        <>
          Açılış · <span className="tabular-nums">{r.position + 1}/{r.total}</span>
        </>
      }
      actions={
        !desktop && (
          <button type="button" className="btn shrink-0 px-3 text-sm" onClick={() => setBoardOpen(true)}>
            <GridFour size={18} weight="bold" aria-hidden />
            Pusulayı gör
          </button>
        )
      }
      menu={menu}
      footer={desktop ? undefined : actions}
      width={desktop ? 'wide' : 'narrow'}
    >
      {desktop ? (
        <div ref={areaRef} className="flex min-h-0 flex-1 flex-col">
          <div data-room-block className="my-auto flex flex-col gap-3">
            <div ref={topRef} className="flex shrink-0 items-center gap-4" data-reveal-top>
              <div className="shrink-0" style={{ width: r.total * 28 + (r.total - 1) * 4 }}>
                <RevealProgress opened={r.opened} total={r.total} position={r.position} players={players} />
              </div>
              {guessing && (
                <div className="min-w-0 flex-1">
                  <ScoreStrip scores={r.scores} players={players} meId={data.me.id} fresh={fresh} />
                </div>
              )}
            </div>
              <div
                className="grid gap-6"
                style={{
                  height: edge || undefined,
                  gridTemplateColumns: `minmax(0, ${LEFT_FR}fr) minmax(0, ${RIGHT_FR}fr)`,
                }}
              >
                {/* Sol sütun boy kabı: fotoğraf/yer tutucu boyu sütun yüksekliğine göre (cqh). */}
                <div data-reveal-left className="flex min-h-0 flex-col gap-3 [container-type:size]">
                  {card}
                  <div className="shrink-0 rounded-2xl border-[3px] border-ink bg-surface p-3 shadow-brutal">{actions}</div>
                </div>
                <section aria-label="Pusula" className="flex min-h-0 justify-center">
                  <div data-reveal-board style={{ width: edge, height: edge }}>
                    {board}
                  </div>
                </section>
              </div>
          </div>
        </div>
      ) : (
        <>
          {top}
          {card}
        </>
      )}

      <p className="sr-only" aria-live="polite">
        {shown && target
          ? r.cellGuessing
            ? `${target.name}. ${correct.length === 0 ? 'Kimse bilemedi.' : `${correct.length} kişi bildi.`}`
            : target.name
          : closed
            ? 'Açılış başlıyor.'
            : `${r.position + 1}. hücre açıldı, tahmin zamanı.`}
      </p>

      {boardOpen && !desktop && (
        <Modal title={`Pusula · ${r.opened.length}/${r.total} açıldı`} onClose={() => setBoardOpen(false)}>
          <div className="pb-1">{board}</div>
        </Modal>
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
              <p className="mt-2 text-[15px]">Herkesin ekranından ve sonuç pusulasından kalkar. Geri alınamaz.</p>
            </>
          ) : (
            <p className="text-[15px]">Oda, herkesin fotoğrafı, adı ve maddeleriyle birlikte hemen silinir. Geri alınamaz.</p>
          )}
        </Modal>
      )}
    </RoomFrame>
  )
}

/** Masaüstü bloğunda üst satır ile sütunlar arası (px); gap-3 ile aynı. */
const BLOCK_GAP = 12

/** Masaüstü kart başlığı: fotoğraf ve yer tutucusu aynı kutu, ad ve "Bu kim?" aynı satır. */
const DESK_PHOTO =
  'size-[clamp(72px,calc(100cqh-480px),160px)] shrink-0 rounded-2xl border-[3px] border-ink shadow-brutal'
const DESK_TITLE = 'mt-2 max-w-full min-w-0 truncate text-3xl leading-tight font-black tracking-tight'

/** Açılanlar küçük fotoğraflarıyla, sıradaki vurgulu, kalanlar boş halka. */
function RevealProgress({
  opened,
  total,
  position,
  players,
}: {
  opened: readonly OpenCell[]
  total: number
  position: number
  players: ReadonlyMap<string, RoomPlayer>
}) {
  return (
    <div
      role="img"
      aria-label={`${total} kişiden ${opened.length} kişi açıldı`}
      data-room-progress
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 28px))` }}
    >
      {Array.from({ length: total }, (_, i) => {
        const open = opened[i]
        const p = open ? players.get(open.playerId) : undefined
        const current = !open && i === position
        return p ? (
          <img key={i} src={p.photo} alt="" className="aspect-square w-full rounded-full border-2 border-ink object-cover" />
        ) : (
          <span
            key={i}
            className={`aspect-square w-full rounded-full border-2 border-ink ${current ? 'bg-accent' : 'border-dashed bg-surface'}`}
          />
        )
      })}
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
    return <p className="mt-2 text-center text-[15px] italic">Bu kişiye madde yazılmamış.</p>
  }
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {items.map((it) => (
        <li key={it.key} className="flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink bg-white/70 px-3 py-1.5 short:py-0.5">
          <span className="min-w-0 flex-1 text-[clamp(16px,2.5dvh,20px)] leading-snug font-bold wrap-break-word">{it.text}</span>
          {canHide && (
            <button
              type="button"
              className="btn btn-icon -my-1 -mr-2 shrink-0"
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

/**
 * Aday ızgarası (kendi içinde kayar). Seçim yapılınca "Tahminin: X · Değiştir"
 * satırına küçülür; "Değiştir" ızgarayı yeniden açar. Adım değişince sıfırlanır (key).
 */
function GuessPicker({
  candidates,
  players,
  meId,
  isAdmin,
  selected,
  onPick,
}: {
  candidates: readonly string[]
  players: ReadonlyMap<string, RoomPlayer>
  meId: string
  isAdmin: boolean
  selected: string | null
  onPick: (id: string) => void
}) {
  const [changing, setChanging] = useState(false)
  const changeRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLUListElement>(null)
  const picked = selected ? players.get(selected) : undefined

  if (picked && !changing) {
    return (
      <div className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-ink bg-accent py-1 pr-1 pl-1.5" data-guess-summary>
        <img src={picked.photo} alt="" className="size-9 shrink-0 rounded-full border-2 border-ink object-cover" />
        <p className="min-w-0 flex-1 truncate text-[15px] font-black">
          <span className="font-bold">Tahminin: </span>
          {picked.id === meId ? `${picked.name} (sen)` : picked.name}
        </p>
        <button
          ref={changeRef}
          type="button"
          className="btn shrink-0 bg-surface"
          onClick={() => {
            setChanging(true)
            requestAnimationFrame(() =>
              gridRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"], button')?.focus(),
            )
          }}
        >
          Değiştir
        </button>
      </div>
    )
  }

  return (
    <section aria-labelledby="guess-title" className="flex min-h-0 flex-col gap-1.5">
      <h2 id="guess-title" className="flex items-baseline justify-between gap-2 text-[15px] font-black">
        Tahminin
        <span className="text-xs font-bold text-muted">
          {isAdmin ? 'Açmadan önce değiştirebilirsin' : 'Admin açana kadar değiştirebilirsin'}
        </span>
      </h2>
      <ul
        ref={gridRef}
        data-room-scroll="candidates"
        className="-mx-1 grid max-h-[min(30dvh,232px)] grid-cols-4 max-lg:short:max-h-[23dvh] lg:max-h-[124px] gap-2 overflow-y-auto overscroll-contain p-1 sm:grid-cols-6"
      >
        {candidates.map((id) => {
          const p = players.get(id)
          if (!p) return null
          return (
            <li key={id}>
              <CandidateButton
                player={p}
                me={id === meId}
                selected={selected === id}
                onPick={() => {
                  onPick(id)
                  setChanging(false)
                  requestAnimationFrame(() => changeRef.current?.focus())
                }}
              />
            </li>
          )
        })}
      </ul>
    </section>
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
      data-candidate
      className={`relative flex min-h-11 w-full min-w-11 flex-col items-center gap-0.5 rounded-xl border-2 border-ink px-1 py-1.5 text-center transition-[transform,box-shadow,background-color] duration-150 ${
        selected ? 'bg-accent shadow-brutal-sm' : 'bg-paper hover:-translate-y-px hover:shadow-brutal-sm'
      }`}
    >
      <img
        src={player.photo}
        alt=""
        width={44}
        height={44}
        className={`size-10 rounded-full border-2 border-ink object-cover sm:size-11 ${selected ? 'ring-2 ring-ink' : ''}`}
      />
      <span className="w-full truncate text-xs font-black">
        {me ? 'Sen' : player.name}
      </span>
      {selected && (
        <CheckCircle
          size={20}
          weight="fill"
          aria-hidden
          className="absolute top-0.5 right-0.5 rounded-full bg-surface motion-safe:animate-pop-in"
        />
      )}
    </button>
  )
}

/** Gösterme adımında: benim sonucum ve doğru bilenler (tek satır, yatay kayar). */
function Verdict({ data, players }: { data: MemberView; players: ReadonlyMap<string, RoomPlayer> }) {
  const r = data.reveal!
  const correct = r.correct ?? []
  const meId = data.me.id
  const iWasRight = correct.includes(meId)
  const myGuess = r.myGuess ? players.get(r.myGuess) : undefined

  let mine: ReactNode
  if (!r.canGuess) mine = <p className="font-bold">Bu kişiye sen de yazmıştın.</p>
  else if (iWasRight) {
    mine = (
      <p
        data-verdict="right"
        className="inline-flex items-center gap-2 rounded-full border-[3px] border-ink bg-accent px-4 py-1 text-xl font-black shadow-brutal motion-safe:animate-cheer short:py-0.5 short:text-lg"
      >
        <Confetti size={24} weight="fill" aria-hidden />
        Bildin! +1
      </p>
    )
  } else if (myGuess) {
    mine = (
      <p data-verdict="wrong" className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-surface px-3 py-1 font-bold">
        <SmileySad size={20} weight="bold" aria-hidden />
        <span className="font-black">Bilemedin</span> · tahminin {myGuess.id === meId ? 'sendin' : myGuess.name}
      </p>
    )
  } else mine = <p className="font-bold">Bu hücrede tahmin etmedin.</p>

  return (
    <div className="mt-3 flex flex-col items-center gap-2 text-center short:mt-2 short:gap-1.5">
      {mine}
      <div className="w-full rounded-xl border-2 border-ink bg-white/70 px-2 pt-1.5">
        <p className="text-xs font-black tracking-wide uppercase">
          {correct.length === 0 ? 'Kimse bilemedi' : `Bilenler · ${correct.length}`}
        </p>
        {correct.length > 0 ? (
          <ul className="flex justify-center-safe gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-1.5">
            {correct.map((id, i) => {
              const p = players.get(id)
              return (
                <li
                  key={id}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-ink bg-accent py-0.5 pr-2.5 pl-0.5 text-sm font-black motion-safe:animate-cheer"
                  style={{ animationDelay: `${150 + i * 90}ms` }}
                >
                  {p && <img src={p.photo} alt="" className="size-7 rounded-full border border-ink object-cover" />}
                  {id === meId ? 'Sen' : (p?.name ?? 'Oyuncu')}
                  {p?.isAdmin && <Crown size={12} weight="fill" aria-hidden />}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="pb-1.5" />
        )}
      </div>
    </div>
  )
}
