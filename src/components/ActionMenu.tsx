import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '../hooks/useMediaQuery'
import { menuPosition } from '../lib/menuPosition'
import { Modal } from './Modal'

export interface MenuItem {
  id: string
  label: string
  icon: ReactNode
  onSelect: () => void
  /** Altında küçük açıklama (ör. neden kullanılamadığı). */
  description?: string
  /** Kırmızı, ayrı bölümde (ör. "Sıfırla"). */
  danger?: boolean
  /** Tıklanabilir kalır ama pasif görünür (nedeni açıklamada). */
  inactive?: boolean
}

interface Props {
  /** Menü başlığı; mobil alt sayfanın başlığı ve erişilebilir ad. */
  title: string
  items: readonly MenuItem[]
  /** Tetikleyici düğme. `props` düğmeye yayılmalı. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>
    onClick: () => void
    'aria-haspopup': 'menu' | 'dialog'
    'aria-expanded': boolean
    'aria-controls'?: string
  }) => ReactNode
}

function ItemButton({
  item,
  onPick,
  role,
  itemRef,
  large,
}: {
  item: MenuItem
  onPick: (item: MenuItem) => void
  role?: 'menuitem'
  itemRef?: (el: HTMLButtonElement | null) => void
  large?: boolean
}) {
  return (
    <button
      ref={itemRef}
      type="button"
      role={role}
      aria-disabled={item.inactive || undefined}
      onClick={() => onPick(item)}
      className={`flex w-full items-center gap-3 rounded-lg px-3 text-left font-bold hover:bg-paper focus-visible:bg-paper ${
        large ? 'min-h-12 text-base' : 'min-h-11 text-sm'
      } ${item.danger ? 'text-danger' : ''} ${item.inactive ? 'opacity-60' : ''}`}
    >
      <span className="shrink-0" aria-hidden>
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        {item.label}
        {item.description && <span className="block text-xs font-medium text-muted">{item.description}</span>}
      </span>
    </button>
  )
}

/** Mobilde alt sayfa, masaüstünde açılır menü. Dışarı dokununca ve Esc ile kapanır. */
export function ActionMenu({ title, items, trigger }: Props) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    setPos(null)
    if (restoreFocus) requestAnimationFrame(() => buttonRef.current?.focus())
  }, [])

  const pick = (item: MenuItem) => {
    // Odak, açılacak pencereye geçebilsin diye düğmeye geri verilmez.
    close(false)
    item.onSelect()
  }

  // Masaüstü: konum hesapla (ekran kenarına göre), yeniden boyutlanınca tekrar.
  useLayoutEffect(() => {
    if (!open || isMobile) return
    const place = () => {
      const b = buttonRef.current?.getBoundingClientRect()
      const m = menuRef.current
      if (!b || !m) return
      setPos(
        menuPosition(
          b,
          { width: m.offsetWidth, height: m.offsetHeight },
          {
            width: document.documentElement.clientWidth,
            height: window.innerHeight,
          },
        ),
      )
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, isMobile])

  // Masaüstü: konum hesaplanıp menü görünür olunca ilk öğeye odaklan.
  const placed = pos !== null
  useEffect(() => {
    if (open && !isMobile && placed) itemRefs.current[0]?.focus()
  }, [open, isMobile, placed])

  // Masaüstü: dışarı tıklayınca ve (odak nerede olursa olsun) Esc ile kapan.
  useEffect(() => {
    if (!open || isMobile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open, isMobile, close])

  const onMenuKey = (e: React.KeyboardEvent) => {
    const list = itemRefs.current.filter((x): x is HTMLButtonElement => x !== null)
    const i = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      list[(i + 1) % list.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      list[(i - 1 + list.length) % list.length]?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      list[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      list.at(-1)?.focus()
    } else if (e.key === 'Tab') {
      close(false)
    }
  }

  const normal = items.filter((i) => !i.danger)
  const danger = items.filter((i) => i.danger)

  return (
    <>
      {trigger({
        ref: buttonRef,
        onClick: () => (open ? close() : setOpen(true)),
        'aria-haspopup': isMobile ? 'dialog' : 'menu',
        'aria-expanded': open,
        'aria-controls': open && !isMobile ? menuId : undefined,
      })}

      {open &&
        isMobile &&
        // Mobil: alt sayfa. Modal; Esc, dışarı dokunma, odak tuzağı ve odağın
        // geri dönüşünü zaten yönetir. Portal: tetikleyici gizlenen bir çubukta
        // olsa bile (mobil alt çubuk alt sayfa açılınca gizlenir) sayfa görünür.
        createPortal(
          <Modal title={title} onClose={() => close()}>
            <div className="flex flex-col gap-1">
              {normal.map((item) => (
                <ItemButton key={item.id} item={item} onPick={pick} large />
              ))}
              {danger.length > 0 && (
                <div className="mt-2 border-t-2 border-ink/10 pt-2">
                  {danger.map((item) => (
                    <ItemButton key={item.id} item={item} onPick={pick} large />
                  ))}
                </div>
              )}
            </div>
          </Modal>,
          document.body,
        )}

      {open &&
        !isMobile &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={title}
            onKeyDown={onMenuKey}
            className="fixed z-50 w-72 max-w-[calc(100vw-16px)] rounded-lg border-2 border-ink bg-surface p-1 shadow-brutal"
            // İlk ölçümden önce görünmez; konum hesaplanınca yerine oturur.
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            {normal.map((item, i) => (
              <ItemButton
                key={item.id}
                item={item}
                onPick={pick}
                role="menuitem"
                itemRef={(el) => {
                  itemRefs.current[i] = el
                }}
              />
            ))}
            {danger.length > 0 && <div className="my-1 border-t-2 border-ink/10" role="separator" />}
            {danger.map((item, j) => (
              <ItemButton
                key={item.id}
                item={item}
                onPick={pick}
                role="menuitem"
                itemRef={(el) => {
                  itemRefs.current[normal.length + j] = el
                }}
              />
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
