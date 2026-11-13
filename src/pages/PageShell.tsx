import { Compass as CompassIcon } from '@phosphor-icons/react'
import { useEffect, type ReactNode } from 'react'

/**
 * Basit içerik sayfası iskeleti. `noindex` verilirse sayfaya
 * <meta name="robots" content="noindex"> eklenir (Netlify ayrıca X-Robots-Tag gönderir).
 */
export function PageShell({
  title,
  noindex,
  wide,
  children,
}: {
  title: string
  noindex?: boolean
  /** Oyun ekranı gibi geniş içerik için. */
  wide?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} · Character Compass`
    if (!noindex) return
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    // Paylaşılan oyun linkinin kanonik adresi ana sayfa olmasın.
    const canonical = document.querySelector('link[rel="canonical"]')
    canonical?.remove()
    return () => {
      meta.remove()
      if (canonical) document.head.appendChild(canonical)
    }
  }, [title, noindex])

  return (
    <div className="h-full overflow-y-auto" data-page-scroll>
      <header className="border-b-[3px] border-ink bg-surface px-4 py-3">
        <a href="/" className="inline-flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg border-2 border-ink bg-accent" aria-hidden>
            <CompassIcon size={22} weight="bold" />
          </span>
          Character Compass
        </a>
      </header>
      <main className={`mx-auto px-4 py-6 pb-[max(24px,env(safe-area-inset-bottom))] ${wide ? 'max-w-6xl' : 'max-w-2xl'}`}>{children}</main>
    </div>
  )
}
