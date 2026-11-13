/**
 * Canlı oda gizli girişi (geçici; Aşama 4'ün C parçası bitince kaldırılacak).
 *
 * "Canlı oda kur" menü öğesi yalnızca cihazda bu bayrak varsa görünür.
 * `/?oda=1` bayrağı yazar, `/?oda=0` siler; parametre adresten temizlenir.
 * `/r/{kod}` sayfaları bayraktan bağımsızdır (davet edilenler katılabilir).
 */

export const ROOM_FLAG_KEY = 'compass-room-entry'
const PARAM = 'oda'

/** Adresteki `oda` parametresini uygular ve adresten siler. Açılışta bir kez çağrılır. */
export function applyRoomFlagFromUrl(location: Location = window.location, history: History = window.history) {
  const params = new URLSearchParams(location.search)
  const value = params.get(PARAM)
  if (value === null) return
  try {
    if (value === '1') localStorage.setItem(ROOM_FLAG_KEY, '1')
    else if (value === '0') localStorage.removeItem(ROOM_FLAG_KEY)
  } catch {
    // Depolama kapalıysa bayrak yok sayılır.
  }
  params.delete(PARAM)
  const query = params.toString()
  history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
}

export function roomEntryEnabled(): boolean {
  try {
    return localStorage.getItem(ROOM_FLAG_KEY) === '1'
  } catch {
    return false
  }
}
