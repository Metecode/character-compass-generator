/** Oyun linki yardımcıları (ağ isteği yok). */

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
