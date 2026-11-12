import { useUiStore } from '../store/uiStore'
import { GameLinkDialog } from './GameLinkDialog'
import { MyGamesDialog } from './MyGamesDialog'

/** "Oyun linki oluştur" ve "Oyunlarım" pencereleri (uiStore.gameDialog). */
export function GameDialogs() {
  const dialog = useUiStore((s) => s.gameDialog)
  const setDialog = useUiStore((s) => s.setGameDialog)
  const close = () => setDialog(null)

  if (dialog === 'create') {
    return <GameLinkDialog onClose={close} onOpenMyGames={() => setDialog('mine')} />
  }
  if (dialog === 'mine') return <MyGamesDialog onClose={close} />
  return null
}
