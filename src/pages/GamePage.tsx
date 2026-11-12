import { PageShell } from './PageShell'

/** /g/{code} — Aşama 3'e kadar yer tutucu. Sunucuya istek atmaz. */
export default function GamePage() {
  return (
    <PageShell title="Oyun yakında" noindex>
      <div className="rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg">
        <h1 className="text-2xl font-black tracking-tight">Oyun yakında</h1>
        <p className="mt-2">
          Bu link bir “Bu kim?” tahmin oyununa ait. Oyun ekranı çok yakında burada olacak.
        </p>
        <a href="/" className="btn btn-primary mt-5">
          Kendi pusulanı yap
        </a>
      </div>
    </PageShell>
  )
}
