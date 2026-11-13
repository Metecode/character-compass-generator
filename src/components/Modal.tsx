import { X } from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { useOverlay } from '../hooks/useOverlay'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
}

/** Basit erişilebilir modal: Escape ile kapanır, açılınca odak içeri, kapanınca geri döner. */
export function Modal({ title, onClose, children, footer, size = 'md' }: Props) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlay()
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const first = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]')
    ;(first ?? panelRef.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
      if (e.key === 'Tab' && panelRef.current) {
        // Odak tuzağı
        const f = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select, [tabindex]:not([tabindex="-1"])',
        )
        const a = f[0]
        const z = f[f.length - 1]
        if (!a || !z) return
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      prev?.focus?.()
    }
  }, [])

  return (
    <div
      data-modal-open
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[90dvh] w-full flex-col rounded-t-2xl border-[3px] border-ink bg-surface shadow-brutal-lg outline-none sm:rounded-2xl ${
          size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg'
        }`}
      >
        <div className="flex items-center justify-between gap-2 p-4 pb-2 sm:p-5 sm:pb-2">
          <h2 id={titleId} className="text-lg font-black tracking-tight">
            {title}
          </h2>
          <button type="button" className="btn btn-icon" aria-label="Kapat" onClick={onClose}>
            <X size={20} weight="bold" aria-hidden />
          </button>
        </div>
        <div className={`overflow-y-auto px-4 sm:px-5 ${footer ? 'pb-4' : 'pb-[max(16px,env(safe-area-inset-bottom))]'}`}>{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t-2 border-ink/10 p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
