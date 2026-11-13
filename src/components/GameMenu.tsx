import {
  CaretDown,
  DotsThree,
  GameController,
  LinkSimple,
  ListBullets,
  Palette,
  Swatches,
  ArrowCounterClockwise,
} from '@phosphor-icons/react'
import { gameBlockReason } from '../lib/gamePayload'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'
import { ActionMenu } from './ActionMenu'
import { preloadQuadrants, preloadTheme } from './lazyDialogs'

/**
 * "Oyun" menüsü: "Oyun linki oluştur" ve "Oyunlarım". Mobilde alt sayfa,
 * masaüstünde açılır menü. Ağ isteği atmaz; yalnızca pencereleri açar.
 */
export function GameMenu({ variant = 'toolbar' }: { variant?: 'toolbar' | 'bar' }) {
  const gameBlocked = useCompassStore((s) => gameBlockReason(s.compass.cells))
  const setGameDialog = useUiStore((s) => s.setGameDialog)
  const showToast = useUiStore((s) => s.showToast)

  return (
    <ActionMenu
      title="Oyun"
      items={[
        {
          id: 'create',
          label: 'Oyun linki oluştur',
          icon: <LinkSimple size={20} weight="bold" />,
          description: gameBlocked ?? undefined,
          inactive: Boolean(gameBlocked),
          onSelect: () => (gameBlocked ? showToast(gameBlocked) : setGameDialog('create')),
        },
        {
          id: 'mine',
          label: 'Oyunlarım',
          icon: <ListBullets size={20} weight="bold" />,
          onSelect: () => setGameDialog('mine'),
        },
      ]}
      trigger={(props) => (
        <button type="button" className={variant === 'bar' ? 'btn px-3' : 'btn'} aria-label="Oyun" {...props}>
          <GameController size={20} weight="bold" aria-hidden />
          {variant === 'bar' ? (
            <span>Oyun</span>
          ) : (
            <>
              <span className="hidden md:inline">Oyun</span>
              <CaretDown size={14} weight="bold" aria-hidden />
            </>
          )}
        </button>
      )}
    />
  )
}

/** Mobil "⋯" menüsü: Bölgeler/Bantlar, Tema, Sıfırla (kırmızı, en altta). */
export function MoreMenu() {
  const isBands = useCompassStore((s) => s.compass.gridSize === 3)
  const setDialog = useUiStore((s) => s.setCompassDialog)

  return (
    <ActionMenu
      title="Diğer"
      items={[
        {
          id: 'quadrants',
          label: isBands ? 'Bantlar' : 'Bölgeler',
          description: isBands ? 'Bant renkleri ve etiketleri' : 'Bölge renkleri ve etiketleri',
          icon: <Palette size={20} weight="bold" />,
          onSelect: () => setDialog('quadrants'),
        },
        {
          id: 'theme',
          label: 'Tema',
          icon: <Swatches size={20} weight="bold" />,
          onSelect: () => setDialog('theme'),
        },
        {
          id: 'reset',
          label: 'Sıfırla',
          icon: <ArrowCounterClockwise size={20} weight="bold" />,
          danger: true,
          onSelect: () => setDialog('reset'),
        },
      ]}
      trigger={(props) => (
        <button
          type="button"
          className="btn btn-icon"
          aria-label="Diğer seçenekler"
          {...props}
          onPointerDown={() => {
            // Menü açılırken pencereleri önceden iste: seçince beklenmesin.
            preloadQuadrants()
            preloadTheme()
          }}
        >
          <DotsThree size={24} weight="bold" aria-hidden />
        </button>
      )}
    />
  )
}
