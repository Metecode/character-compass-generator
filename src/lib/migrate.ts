/**
 * localStorage kaydının sürüm geçişleri. Her geçiş yalnızca eksik/değişen alanları
 * ekler; geri kalan doğrulamayı sanitizeCompass yapar. Fotolar IndexedDB'de durur,
 * burada hiç dokunulmaz (photoId'ler olduğu gibi taşınır).
 */
export const STORE_VERSION = 2

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

export function migratePersisted(persisted: unknown, fromVersion: number): unknown {
  const state: Record<string, unknown> = isObj(persisted) ? { ...persisted } : {}

  // v1 → v2: ızgara boyutları, 3x3 bantları, tema ve büyük harf ayarı geldi.
  // v1'de her pusula 4x4'tü ve isimler hep büyük harfle çiziliyordu; görünüm
  // değişmesin diye ikisi de korunur. Bantlar ve tema varsayılandan gelir.
  if (fromVersion < 2 && isObj(state.compass)) {
    state.compass = { ...state.compass, gridSize: 4, uppercaseNames: true }
  }

  return state
}
