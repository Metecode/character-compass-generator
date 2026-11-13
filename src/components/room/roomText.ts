import type { RoomMode } from '../../lib/roomApi'

export const MODE_LABELS: Record<RoomMode, { title: string; description: string }> = {
  classic: { title: 'Klasik', description: 'Herkes 3 kişiye birer madde yazar. En az 4 kişi.' },
  quick: { title: 'Hızlı', description: 'Herkes 1 kişiye 3 madde yazar. En az 3 kişi.' },
}

/** 120 → "2 dk" */
export const writeTimeLabel = (seconds: number): string => `${Math.round(seconds / 60)} dk`
