import { User } from '@phosphor-icons/react'
import { usePhotoUrl } from '../hooks/usePhotoUrl'
import { useCompassStore } from '../store/compassStore'
import type { Cell } from '../types'

/** Sürükleme sırasında imlecin altında görünen küçük önizleme kartı. */
export function DragCard({ cell }: { cell: Cell }) {
  const url = usePhotoUrl(cell.photoId)
  const uppercase = useCompassStore((s) => s.compass.uppercaseNames)
  return (
    <div className="pointer-events-none flex w-max max-w-56 -rotate-3 cursor-grabbing items-center gap-2 rounded-xl border-[3px] border-ink bg-surface p-2 pr-3 shadow-brutal-lg">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-ink bg-paper">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <User size={24} weight="bold" aria-hidden />
        )}
      </div>
      <span className={`truncate text-base font-black ${uppercase ? 'uppercase' : ''}`}>{cell.name || 'İsimsiz'}</span>
    </div>
  )
}
