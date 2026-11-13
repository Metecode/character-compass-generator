import { CircleNotch, Crown, DownloadSimple, PencilSimpleLine, Trash, Trophy } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useServerNow } from '../../hooks/useServerNow'
import { downloadBlob, renderNodePng } from '../../lib/exportPng'
import { roomAdmin, roomErrorMessage, type MemberView, type RoomSession } from '../../lib/roomApi'
import { deletesInText, ranksOf, roomCompass, winnersOf } from '../../lib/roomResult'
import { useUiStore } from '../../store/uiStore'
import { Modal } from '../Modal'
import { RoomBoard, RoomBoardArt } from './RoomBoard'

type Confirm = 'import' | 'delete'

/** Fotoğrafları bir kez indirir (PNG ve düzenleyiciye aktarma için). Başarısız olan atlanır. */
async function fetchPhotos(players: MemberView['players'], ids: readonly string[]): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>()
  await Promise.all(
    ids.map(async (id) => {
      const p = players.find((x) => x.id === id)
      if (!p) return
      try {
        const res = await fetch(p.photo)
        if (res.ok) out.set(id, await res.blob())
      } catch {
        // foto olmadan devam
      }
    }),
  )
  return out
}

async function waitForImages(node: HTMLElement, expected: number, timeoutMs = 8000): Promise<void> {
  const start = performance.now()
  const imgs = () => Array.from(node.querySelectorAll<HTMLImageElement>('img[data-cell-photo]'))
  while (imgs().length < expected && performance.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 50))
  }
  await Promise.all(imgs().map((img) => img.decode().catch(() => undefined)))
}

/**
 * BITTI: kazanan, tam skor tablosu, dolu pusula. Herkes PNG indirebilir ve pusulayı
 * kendi düzenleyicisine aktarabilir; admin odayı hemen silebilir. Oda kendiliğinden
 * ROOM_DONE_TTL_SECONDS sonra silinir.
 */
export function RoomResultView({
  data,
  session,
  clockOffset,
  onDeleted,
}: {
  data: MemberView
  session: RoomSession
  clockOffset: number
  onDeleted: () => void
}) {
  const res = data.result!
  const showToast = useUiStore((s) => s.showToast)
  const players = useMemo(() => new Map(data.players.map((p) => [p.id, p])), [data.players])
  const winners = winnersOf(res.scores)
  const ranks = ranksOf(res.scores)
  const now = useServerNow(clockOffset, 15_000)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState<null | 'png' | 'import' | 'delete'>(null)

  // PNG: fotoğraflar blob adresine çevrilip ekran dışındaki 1080'lik çizime verilir
  // (çizim yalnızca bu sırada DOM'da durur).
  const [exportPhotos, setExportPhotos] = useState<Map<string, string> | null>(null)
  const artRef = useRef<HTMLDivElement>(null)
  const downloadPng = async () => {
    if (busy) return
    setBusy('png')
    let urls = new Map<string, string>()
    try {
      const blobs = await fetchPhotos(
        data.players,
        res.cells.map((c) => c.playerId),
      )
      urls = new Map([...blobs].map(([id, b]) => [id, URL.createObjectURL(b)]))
      setExportPhotos(urls)
      const start = performance.now()
      while (!artRef.current && performance.now() - start < 3000) await new Promise((r) => requestAnimationFrame(r))
      const node = artRef.current
      if (!node) throw new Error('art')
      await waitForImages(node, urls.size)
      downloadBlob(await renderNodePng(node), 'canli-oda.png')
    } catch {
      showToast('PNG oluşturulamadı. Tekrar dener misin?', 'error')
    } finally {
      setExportPhotos(null)
      for (const url of urls.values()) URL.revokeObjectURL(url)
      setBusy(null)
    }
  }

  const importToEditor = async () => {
    if (busy) return
    setBusy('import')
    try {
      const [{ savePhoto }, { useCompassStore }] = await Promise.all([
        import('../../lib/photos'),
        import('../../store/compassStore'),
      ])
      const blobs = await fetchPhotos(
        data.players,
        res.cells.map((c) => c.playerId),
      )
      const photoIds = new Map<string, string>()
      for (const [id, blob] of blobs) photoIds.set(id, await savePhoto(blob))
      useCompassStore.getState().loadCompass(roomCompass(res.gridSize, res.cells, players, photoIds))
      window.location.assign('/')
    } catch {
      showToast('Pusula aktarılamadı. Tekrar dener misin?', 'error')
      setBusy(null)
      setConfirm(null)
    }
  }

  const deleteRoom = async () => {
    if (busy) return
    setBusy('delete')
    try {
      await roomAdmin(session, { action: 'delete' })
      onDeleted()
    } catch (e) {
      showToast(roomErrorMessage(e, 'Oda silinemedi. Tekrar dener misin?'), 'error')
      setBusy(null)
      setConfirm(null)
    }
  }

  const winnerNames = winners.ids.map((id) => (id === data.me.id ? 'Sen' : (players.get(id)?.name ?? 'Oyuncu')))

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {data.guessing ? (
        <>
          <section className="rounded-2xl border-[3px] border-ink bg-accent p-5 text-center shadow-brutal-lg motion-safe:animate-pop-in">
            <Trophy size={44} weight="fill" className="mx-auto" aria-hidden />
            <p className="mt-1 text-sm font-black tracking-wide uppercase">Oyun bitti</p>
            <h1 className="mt-1 text-3xl leading-tight font-black tracking-tight text-balance">
              {winners.ids.length === 0
                ? 'Bu sefer kimse bilemedi!'
                : winners.ids.length === 1
                  ? `Kazanan: ${winnerNames[0]}`
                  : `Kazananlar: ${winnerNames.join(', ')}`}
            </h1>
            {winners.score > 0 && <p className="mt-1 text-lg font-bold">{winners.score} puan</p>}
          </section>

          <section aria-labelledby="scores-title" className="rounded-2xl border-[3px] border-ink bg-surface p-4 shadow-brutal">
            <h2 id="scores-title" className="text-lg font-black tracking-tight">
              Skor tablosu
            </h2>
            <ol className="mt-2 flex flex-col gap-1.5">
              {res.scores.map((s, i) => {
                const p = players.get(s.playerId)
                const me = s.playerId === data.me.id
                return (
                  <li
                    key={s.playerId}
                    className={`flex items-center gap-2 rounded-xl border-2 border-ink p-1.5 ${me ? 'bg-accent' : 'bg-paper'}`}
                  >
                    <span className="w-7 text-center font-black tabular-nums">{ranks[i]}.</span>
                    {p && <img src={p.photo} alt="" className="size-9 rounded-full border-2 border-ink object-cover" />}
                    <span className="min-w-0 flex-1 truncate font-bold">
                      {p?.name ?? 'Oyuncu'}
                      {me && <span className="text-muted"> (sen)</span>}
                    </span>
                    {ranks[i] === 1 && s.score > 0 && <Crown size={18} weight="fill" aria-label="Birinci" />}
                    <span className="pr-2 text-lg font-black tabular-nums">{s.score}</span>
                  </li>
                )
              })}
            </ol>
          </section>
        </>
      ) : (
        <h1 className="text-2xl font-black tracking-tight">Oyun bitti</h1>
      )}

      <RoomBoard gridSize={res.gridSize} cells={res.cells} players={players} maxWidth={560} />

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={downloadPng} disabled={busy !== null} aria-busy={busy === 'png'}>
          {busy === 'png' ? (
            <CircleNotch size={20} weight="bold" className="animate-spin" aria-hidden />
          ) : (
            <DownloadSimple size={20} weight="bold" aria-hidden />
          )}
          PNG indir
        </button>
        <button type="button" className="btn" onClick={() => setConfirm('import')} disabled={busy !== null}>
          <PencilSimpleLine size={20} weight="bold" aria-hidden />
          Düzenleyiciye aktar
        </button>
        {data.me.isAdmin && (
          <button type="button" className="btn btn-danger ml-auto" onClick={() => setConfirm('delete')} disabled={busy !== null}>
            <Trash size={20} weight="bold" aria-hidden />
            Odayı şimdi sil
          </button>
        )}
      </div>
      <p className="text-sm text-muted">
        {deletesInText(res.deletesAt - now)} Fotoğraflar, adlar ve maddeler sunucudan tamamen kalkar; indirdiğin PNG
        ve düzenleyiciye aktardığın pusula yalnızca bu cihazda kalır.
      </p>

      {confirm && (
        <Modal
          size="sm"
          title={confirm === 'import' ? 'Düzenleyiciye aktarılsın mı?' : 'Oda şimdi silinsin mi?'}
          onClose={() => busy === null && setConfirm(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setConfirm(null)} disabled={busy !== null}>
                Vazgeç
              </button>
              <button
                type="button"
                className={confirm === 'import' ? 'btn btn-primary' : 'btn btn-danger'}
                onClick={confirm === 'import' ? importToEditor : deleteRoom}
                disabled={busy !== null}
                data-autofocus
              >
                {busy !== null && <CircleNotch size={18} weight="bold" className="animate-spin" aria-hidden />}
                {confirm === 'import' ? 'Aktar' : 'Sil'}
              </button>
            </>
          }
        >
          <p className="text-[15px]">
            {confirm === 'import'
              ? 'Bu pusula, fotoğraflarla birlikte bu cihazdaki düzenleyiciye kopyalanır ve oradaki mevcut pusulanın yerine geçer. Mevcut pusulayı tutmak istiyorsan önce PNG olarak indir.'
              : 'Oda, herkesin fotoğrafı, adı ve maddeleriyle birlikte hemen silinir. Diğerlerinin ekranındaki sonuç da kapanır. Geri alınamaz.'}
          </p>
        </Modal>
      )}

      {exportPhotos &&
        createPortal(
          <div aria-hidden className="export-still pointer-events-none fixed top-0 -left-[20000px]">
            <RoomBoardArt
              ref={artRef}
              gridSize={res.gridSize}
              cells={res.cells}
              players={players}
              photoOf={(id) => exportPhotos.get(id) ?? null}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
