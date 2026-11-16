/**
 * Artık kullanılmayan localStorage anahtarları. Açılışta silinir; yoksa işlem yapılmaz.
 * - `compass-room-entry`: "Canlı oda kur" herkese açılmadan önceki gizli giriş bayrağı.
 */
const LEGACY_KEYS = ['compass-room-entry']

export function removeLegacyStorage(storage?: Storage) {
  try {
    const target = storage ?? window.localStorage
    for (const key of LEGACY_KEYS) target.removeItem(key)
  } catch {
    // Depolama kapalıysa silinecek bir şey de yoktur.
  }
}
