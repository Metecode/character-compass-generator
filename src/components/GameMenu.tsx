import { CaretDown, GameController, LinkSimple, ListBullets } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState } from 'react'
import { gameBlockReason } from '../lib/gamePayload'
import { useCompassStore } from '../store/compassStore'
import { useUiStore } from '../store/uiStore'

/**
 * "Oyun" menüsü: "Oyun linki oluştur" ve "Oyunlarım". Mobilde araç çubuğunun
 * tek satırda kalması için ikisi tek düğmede toplanır. Ağ isteği atmaz; yalnızca
 * pencereleri açar.
 */
export function GameMenu({ showLabel }: { showLabel: boolean }) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([])
  const gameBlocked = useCompassStore((s) => gameBlockReason(s.compass.cells))
  const setGameDialog = useUiStore((s) => s.setGameDialog)
  const showToast = useUiStore((s) => s.showToast)

  useEffect(() => {
    if (!open) return
    itemsRef.current[0]?.focus()
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const close = (focusButton = true) => {
    setOpen(false)
    if (focusButton) buttonRef.current?.focus()
  }

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = itemsRef.current.filter((x): x is HTMLButtonElement => x !== null)
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(i + 1) % items.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(i - 1 + items.length) % items.length]?.focus()
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  const item =
    'flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-bold hover:bg-paper focus-visible:bg-paper'

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-label="Oyun"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <GameController size={20} weight="bold" aria-hidden />
        {showLabel && <span className="hidden md:inline">Oyun</span>}
        <CaretDown size={14} weight="bold" className="hidden sm:block" aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Oyun"
          onKeyDown={onMenuKey}
          className="animate-pop-in absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-lg border-2 border-ink bg-surface p-1 shadow-brutal"
        >
          <button
            ref={(el) => {
              itemsRef.current[0] = el
            }}
            type="button"
            role="menuitem"
            className={item}
            aria-disabled={gameBlocked ? true : undefined}
            onClick={() => {
              close(false)
              if (gameBlocked) showToast(gameBlocked)
              else setGameDialog('create')
            }}
          >
            <LinkSimple size={18} weight="bold" aria-hidden />
            <span className="flex-1">
              Oyun linki oluştur
              {gameBlocked && <span className="block text-xs font-medium text-muted">{gameBlocked}</span>}
            </span>
          </button>
          <button
            ref={(el) => {
              itemsRef.current[1] = el
            }}
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              close(false)
              setGameDialog('mine')
            }}
          >
            <ListBullets size={18} weight="bold" aria-hidden />
            Oyunlarım
          </button>
        </div>
      )}
    </div>
  )
}
