/**
 * Mobil alt sayfanın (bottom sheet) görünür alana göre konumu.
 *
 * iOS Safari'de klavye açılınca "layout viewport" küçülmez; yalnızca
 * visualViewport küçülür (ve kayabilir). `position: fixed; bottom: 0` olan panel
 * bu yüzden klavyenin arkasında kalır. Burada panelin alt kenarını görünür
 * alanın alt kenarına taşıyacak `bottom` değerini ve yüksekliğini hesaplarız.
 */

export interface VisualViewportLike {
  height: number
  offsetTop: number
  scale: number
}

export interface SheetFrame {
  /** Layout viewport'un altından yukarı doğru px (klavye yüksekliği kadar). */
  bottom: number
  /** Panelin en fazla yüksekliği (px). */
  maxHeight: number
  /** Klavye (ya da benzeri) görünür alanı belirgin biçimde daraltıyor mu. */
  keyboard: boolean
}

/** Panelin üstünde her zaman bırakılan boşluk (px). */
export const SHEET_TOP_GAP = 12
/** Bundan büyük daralma klavye sayılır (adres çubuğu oynamaları değil). */
export const KEYBOARD_THRESHOLD = 120

/**
 * Klavye kapalıyken varsayılan yükseklik: ekranın en az %60'ı (düzenlenen hücre
 * başlıktaki canlı önizlemede göründüğü için pusulanın bir kısmı kapanabilir), ama
 * pusulanın (genişlik kadar kare) altında kalan alan daha büyükse o.
 */
export function defaultSheetHeight(layoutWidth: number, layoutHeight: number): number {
  return Math.max(layoutHeight * 0.6, layoutHeight - layoutWidth - 72)
}

export function sheetFrame(
  layoutWidth: number,
  layoutHeight: number,
  vv: VisualViewportLike | null | undefined,
): SheetFrame {
  const base = defaultSheetHeight(layoutWidth, layoutHeight)
  // visualViewport yoksa ya da kullanıcı yakınlaştırmışsa dokunmayız.
  if (!vv || Math.abs(vv.scale - 1) > 0.01) {
    return { bottom: 0, maxHeight: Math.round(base), keyboard: false }
  }
  const visibleBottom = vv.offsetTop + vv.height
  const bottom = Math.max(0, Math.round(layoutHeight - visibleBottom))
  const keyboard = layoutHeight - vv.height > KEYBOARD_THRESHOLD
  const available = Math.max(0, vv.height - SHEET_TOP_GAP)
  // Klavye açıkken görünür alanın tamamını kullanabilir; kapalıyken varsayılan.
  const maxHeight = Math.round(keyboard ? available : Math.min(base, available))
  return { bottom, maxHeight, keyboard }
}

/**
 * Canlı oda çerçevesinin kutusu. Klavye kapalıyken çerçeve sayfayı (100dvh)
 * doldurur: `height` null. Klavye açıkken görünür alana (visualViewport) oturur;
 * böylece alanlar ve alttaki eylem düğmesi klavyenin üstünde kalır.
 */
export interface FrameBox {
  /** Layout viewport'un üstünden aşağı px (iOS görünür alanı kaydırabilir). */
  top: number
  height: number | null
  keyboard: boolean
}

export function roomFrameBox(layoutHeight: number, vv: VisualViewportLike | null | undefined): FrameBox {
  if (!vv || Math.abs(vv.scale - 1) > 0.01) return { top: 0, height: null, keyboard: false }
  if (layoutHeight - vv.height <= KEYBOARD_THRESHOLD) return { top: 0, height: null, keyboard: false }
  return { top: Math.max(0, Math.round(vv.offsetTop)), height: Math.round(vv.height), keyboard: true }
}

/** Düzenleme paneli başlığı: kişinin adı, isim boşsa "Yeni kişi". */
export const panelTitle = (name: string | undefined): string => name?.trim() || 'Yeni kişi'

/**
 * Kaydırılabilir kapsayıcıda bir öğeyi görünür yapmak için gereken scrollTop
 * değişimi. Öğe zaten görünürse 0.
 */
export function revealDelta(
  item: { top: number; bottom: number },
  container: { top: number; bottom: number },
  margin = 12,
): number {
  const viewTop = container.top + margin
  const viewBottom = container.bottom - margin
  if (item.bottom - item.top > viewBottom - viewTop) return item.top - viewTop
  if (item.top < viewTop) return item.top - viewTop
  if (item.bottom > viewBottom) return item.bottom - viewBottom
  return 0
}
