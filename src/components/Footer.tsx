import { useGamesStore } from '../store/gamesStore'
import { useUiStore } from '../store/uiStore'

/** İnce alt bilgi: gizlilik sayfası ve (varsa) bu cihazın oyun linkleri. */
export function Footer() {
  const count = useGamesStore((s) => s.games.length)
  const setGameDialog = useUiStore((s) => s.setGameDialog)

  return (
    <footer className="flex items-center justify-end gap-4 border-t-2 border-ink/10 px-3 pt-1 pb-[max(4px,env(safe-area-inset-bottom))] text-xs font-bold sm:px-4">
      {count > 0 && (
        <button
          type="button"
          className="min-h-8 underline-offset-2 hover:underline"
          onClick={() => setGameDialog('mine')}
        >
          Oyunlarım ({count})
        </button>
      )}
      <a href="/gizlilik" className="inline-flex min-h-8 items-center underline-offset-2 hover:underline">
        Gizlilik
      </a>
    </footer>
  )
}
