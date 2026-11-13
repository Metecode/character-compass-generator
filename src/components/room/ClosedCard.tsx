import { Ghost, HourglassHigh, UsersThree } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

export type ClosedReason = 'started' | 'full' | 'gone' | 'deleted'

const CONTENT: Record<ClosedReason, { icon: ReactNode; title: string; body: string }> = {
  started: {
    icon: <HourglassHigh size={30} weight="bold" />,
    title: 'Oyun başladı',
    body: 'Bu odada oyun başladığı için artık katılınamıyor. Bir sonraki turda seni de çağırsınlar ya da kendi odanı kur.',
  },
  full: {
    icon: <UsersThree size={30} weight="bold" />,
    title: 'Oda dolu',
    body: 'Bir odada en fazla 16 kişi oynayabiliyor. Biri çıkarsa yer açılır; istersen kendi odanı kur.',
  },
  gone: {
    icon: <Ghost size={30} weight="bold" />,
    title: 'Bu oda artık yok',
    body: 'Oyun bitmiş, admin odayı silmiş ya da link hatalı olabilir. Odalar oyun bitince, en geç 2 saat içinde kendiliğinden silinir.',
  },
  deleted: {
    icon: <Ghost size={30} weight="bold" />,
    title: 'Oda silindi',
    body: 'Oda, herkesin adı ve fotoğrafıyla birlikte sunucudan silindi.',
  },
}

/** Katılınamayan oda için anlaşılır sayfa. */
export function ClosedCard({ reason }: { reason: ClosedReason }) {
  const c = CONTENT[reason]
  return (
    <div className="mx-auto max-w-md rounded-2xl border-[3px] border-ink bg-surface p-6 shadow-brutal-lg">
      <span className="flex size-14 items-center justify-center rounded-full border-2 border-ink bg-paper" aria-hidden>
        {c.icon}
      </span>
      <h1 className="mt-4 text-2xl font-black tracking-tight">{c.title}</h1>
      <p className="mt-2">{c.body}</p>
      <a href="/" className="btn btn-primary mt-5">
        Kendi pusulanı yap
      </a>
    </div>
  )
}
