import { CheckCircle, Info, WarningCircle, X } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { useUiStore } from '../store/uiStore'

const ICONS = { info: Info, error: WarningCircle, success: CheckCircle } as const

export function ToastHost() {
  const toast = useUiStore((s) => s.toast)
  const dismiss = useUiStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(dismiss, 4000)
    return () => window.clearTimeout(t)
  }, [toast, dismiss])

  const Icon = toast ? ICONS[toast.tone] : null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-20 z-[60] flex justify-center px-4"
    >
      {toast && Icon && (
        <div
          key={toast.id}
          className={`animate-pop-in pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border-2 border-ink px-3 py-2 text-sm font-bold shadow-brutal ${
            toast.tone === 'error' ? 'bg-[#ffe3e3]' : toast.tone === 'success' ? 'bg-[#e3ffe8]' : 'bg-surface'
          }`}
        >
          <Icon size={20} weight="bold" className="shrink-0" aria-hidden />
          <span>{toast.message}</span>
          <button
            type="button"
            className="-mr-1 ml-1 flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-ink/10"
            aria-label="Bildirimi kapat"
            onClick={dismiss}
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}
