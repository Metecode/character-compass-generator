import { Compass as CompassIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { TITLE_MAX } from '../constants'
import { truncate } from '../lib/limits'
import { useCompassStore } from '../store/compassStore'

interface Props {
  actions?: ReactNode
}

export function TopBar({ actions }: Props) {
  const title = useCompassStore((s) => s.compass.title)
  const setTitle = useCompassStore((s) => s.setTitle)

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b-[3px] border-ink bg-surface px-3 py-2 sm:px-4">
      <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-1">
        <span
          className="hidden size-10 shrink-0 items-center justify-center rounded-lg border-2 border-ink bg-accent sm:flex"
          aria-hidden
        >
          <CompassIcon size={24} weight="bold" />
        </span>
        <label htmlFor="compass-title" className="sr-only">
          Pusula başlığı
        </label>
        <input
          id="compass-title"
          value={title}
          onChange={(e) => setTitle(truncate(e.target.value, TITLE_MAX))}
          placeholder="Pusula başlığı"
          className="min-h-11 w-full min-w-0 rounded-lg border-2 border-transparent bg-transparent px-2 text-lg font-black tracking-tight hover:border-ink/30 focus-visible:border-focus focus-visible:shadow-[3px_3px_0_0_var(--color-focus)] focus-visible:outline-none sm:text-xl"
        />
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">{actions}</div>
      )}
    </header>
  )
}
