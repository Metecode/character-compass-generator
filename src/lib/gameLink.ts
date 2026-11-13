/** Oyun linki yardımcıları (ağ isteği yok). */

import { formatDuration, scoreLabel } from './play'

export const GAME_WARNING =
  'Pusuladaki fotoğraflar ve maddeler seçtiğin süre boyunca sunucuda tutulur, sonra silinir. Pusuladaki kişilerin haberi olsun.'

export const gameUrl = (code: string): string => `${window.location.origin}/g/${code}`

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Paylaşım metni iki biçimde: `text` linksizdir ve `navigator.share`'in `text`
 * alanına gider (link yalnızca `url` alanında; aksi halde bazı uygulamalar linki
 * iki kez gösterir). `copy` metin + link tek parçadır, panoya kopyalanır.
 */
export interface ShareMessage {
  text: string
  copy: string
}

const withLink = (text: string, url: string): ShareMessage => ({ text, copy: `${text} 👉 ${url}` })

/** Oyun linki daveti; kurucu adı yoksa genel bir davet. */
export function inviteMessage(creatorName: string | null | undefined, url: string): ShareMessage {
  const name = creatorName?.trim()
  return withLink(
    name
      ? `${name} seni challenge'a davet etti! Bakalım kaç saniyede kimin kim olduğunu bileceksin`
      : 'Bu pusuladakileri tanıyabilecek misin? Bakalım kaç saniyede çözeceksin',
    url,
  )
}

/** Skor paylaşımı: "9'da 6 bildim, 1 dk 42 sn. Sen kaç yaparsın?" (süre bilinmiyorsa yazılmaz). */
export function scoreMessage(
  score: { points2: number; total: number; durationSeconds: number | null },
  url: string,
): ShareMessage {
  const time = score.durationSeconds != null ? `, ${formatDuration(score.durationSeconds)}` : ''
  return withLink(`${scoreLabel(score.points2, score.total)} bildim${time}. Sen kaç yaparsın?`, url)
}

/** Tekrar deneme süresi: "5 dakika", "2 saat" (yaklaşık, yukarı yuvarlanır). */
export function retryWaitText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  if (minutes < 90) return `${minutes} dakika`
  return `${Math.ceil(minutes / 60)} saat`
}

/** Oyun linki oluşturma hız limiti; limit sayısı bilerek yazılmaz. */
export function rateLimitMessage(retryAfter: number | null): string {
  return retryAfter
    ? `Bu ağdan çok fazla oyun oluşturuldu. Yaklaşık ${retryWaitText(retryAfter)} sonra tekrar dene.`
    : 'Bu ağdan çok fazla oyun oluşturuldu. Biraz sonra tekrar dene.'
}
