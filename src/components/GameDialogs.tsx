import { useUiStore } from '../store/uiStore'
import { GameLinkDialog } from './GameLinkDialog'
import { MyGamesDialog } from './MyGamesDialog'
import { RoomCreateDialog } from './room/RoomCreateDialog'

/** "Oyun linki oluştur", "Oyunlarım" ve "Canlı oda kur" pencereleri (uiStore.gameDialog). */
export function GameDialogs() {
  const dialog = useUiStore((s) => s.gameDialog)
  const setDialog = useUiStore((s) => s.setGameDialog)
  const close = () => setDialog(null)

  if (dialog === 'create') {
    return <GameLinkDialog onClose={close} onOpenMyGames={() => setDialog('mine')} />
  }
  if (dialog === 'mine') return <MyGamesDialog onClose={close} />
  if (dialog === 'room') return <RoomCreateDialog onClose={close} />
  return null
}
