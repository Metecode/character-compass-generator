import { CircleNotch } from '@phosphor-icons/react'

/**
 * Soket kopukken ekranın altında küçük gösterge; oyun yoklamayla sürer.
 * Altta durur: üstteki yapışkan geri sayımı kapatmasın.
 */
export function ConnectionBadge({ visible }: { visible: boolean }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
    >
      {visible && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-full border-2 border-ink bg-accent px-3 py-1 text-sm font-bold shadow-brutal-sm"
        >
          <CircleNotch size={16} weight="bold" className="animate-spin" aria-hidden />
          Bağlantı yeniden kuruluyor
        </p>
      )}
    </div>
  )
}
