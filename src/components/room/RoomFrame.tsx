import { Compass as CompassIcon, DotsThree } from '@phosphor-icons/react'
import { useEffect, type ReactNode } from 'react'
import { useFrameBox } from '../../hooks/useFrameBox'
import { ActionMenu, type MenuItem } from '../ActionMenu'

/** `wide`: masaüstündeki oda ekranlarının ortak en fazla genişliği (başlık da aynı hizada). */
const WIDTHS = { narrow: 'max-w-xl', wide: 'max-w-[1200px]' } as const

/**
 * Canlı odanın ortak çerçevesi: ince başlık, esneyen içerik, altta sabit eylem alanı.
 * Lobi, yazma ve açılış telefonda tek ekrana sığar (100dvh, güvenli alanlar dahil);
 * içerikte kayması gereken yer (liste, aday ızgarası) kendi içinde kayar. Klavye
 * açıkken çerçeve görünür alana oturur. `scroll` yalnızca BITTI içindir: sayfa kayar,
 * sabit alt alan yoktur.
 */
export function RoomFrame({
  title,
  actions,
  menu,
  footer,
  scroll = false,
  width = 'narrow',
  children,
}: {
  /** Başlıktaki kısa aşama adı (ör. "Lobi", "Açılış · 2/6"). */
  title: ReactNode
  /** Başlığın sağında, "Diğer"in solunda (ör. "Pusulayı gör"). */
  actions?: ReactNode
  /** "Diğer" menüsü; boşsa düğme yok. */
  menu?: readonly MenuItem[]
  footer?: ReactNode
  scroll?: boolean
  width?: keyof typeof WIDTHS
  children: ReactNode
}) {
  const box = useFrameBox()
  const max = WIDTHS[width]

  useEffect(() => {
    document.title = 'Canlı oda · Character Compass'
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const header = (
    <header className="shrink-0 border-b-[3px] border-ink bg-surface px-3 pt-[max(6px,env(safe-area-inset-top))] pb-1.5 sm:px-4">
      <div data-room-header-inner className={`mx-auto flex min-h-11 items-center gap-2 ${max}`}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-accent" aria-hidden>
          <CompassIcon size={20} weight="bold" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-black tracking-wide uppercase" data-room-title>
          {title}
        </p>
        {actions}
        {menu && menu.length > 0 && (
          <ActionMenu
            title="Diğer"
            items={menu}
            trigger={(props) => (
              <button type="button" className="btn btn-icon shrink-0" aria-label="Diğer" {...props}>
                <DotsThree size={22} weight="bold" aria-hidden />
              </button>
            )}
          />
        )}
      </div>
    </header>
  )

  if (scroll) {
    return (
      <div className="h-full overflow-y-auto" data-page-scroll data-room-frame="scroll">
        {header}
        <main className="px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div data-room-inner className={`mx-auto w-full ${max}`}>
            {children}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div
      data-room-frame="fixed"
      className={`flex flex-col overflow-hidden ${box.keyboard ? 'fixed inset-x-0' : 'h-full'}`}
      style={box.keyboard ? { top: box.top, height: box.height ?? undefined } : undefined}
    >
      {header}
      <main data-room-content className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3 short:py-2">
        <div data-room-inner className={`mx-auto flex min-h-0 w-full flex-1 flex-col gap-3 short:gap-2 ${max}`}>
          {children}
        </div>
      </main>
      {footer && (
        <div
          data-room-footer
          className={`shrink-0 border-t-[3px] border-ink bg-surface px-4 pt-2.5 ${
            box.keyboard ? 'pb-2.5' : 'pb-[max(10px,env(safe-area-inset-bottom))]'
          }`}
        >
          <div className={`mx-auto ${max}`}>{footer}</div>
        </div>
      )}
    </div>
  )
}
