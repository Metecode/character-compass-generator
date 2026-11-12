/** Tüm limitler ve sabit ölçüler tek yerde. */

// --- İçerik limitleri ---
export const NAME_MAX = 20
export const BULLET_MAX = 40
export const BULLETS_MAX = 3

export const TITLE_MAX = 40
export const LABEL_MAX = 24

// --- İmza ---
// TODO: Yayından önce değiştir. Bu alan adı bize ait değil, yer tutucu.
/** PNG'nin sağ alt köşesindeki site adresi. */
export const SITE_URL = 'karakterpusulasi.app'
/** Izgaranın altındaki imza şeridinin yüksekliği (px, 1080 içinde). */
export const SIGNATURE_BAND = 30

// --- Tuval ---
/** Pusula her zaman bu boyutta (px) çizilir ve export edilir. */
export const CANVAS_SIZE = 1080
/** Bölge etiketi bandının yüksekliği (sadece etiket varsa). */
export const LABEL_BAND = 56
export const CELL_PADDING = 12
export const CELL_PHOTO = 116
export const CELL_GAP = 8
export const LINE_THIN = 2
export const LINE_THICK = 5

// --- Otomatik font küçültme (px) ---
export const NAME_FONT_MAX = 34
export const NAME_FONT_MIN = 14
export const BULLET_FONT_MAX = 24
export const BULLET_FONT_MIN = 12

// --- Foto ---
export const PHOTO_SIZE = 400
export const PHOTO_QUALITY = 0.85

// --- Izgara ---
export const GRID_SIZES = [2, 3, 4] as const
/** Yeni pusulalar bu boyutla başlar. */
export const DEFAULT_GRID_SIZE = 3
/**
 * Hücre içi ölçülerin (foto, font, boşluk) 4x4'e göre çarpanı. Hücre büyüdükçe
 * içerik de büyür; 2x2'de tam 2 kat yerine biraz daha az, nefes payı kalsın.
 */
export const CELL_SCALE = { 2: 1.8, 3: 1.33, 4: 1 } as const
/** 3x3 bant etiket kutusunun genişliği (dikey yazı). */
export const BAND_LABEL_WIDTH = 72
export const DEFAULT_THEME_ID = 'genel'

/** Pastel: kırmızı, mavi, yeşil, sarı (sol üst, sağ üst, sol alt, sağ alt). */
export const DEFAULT_QUADRANT_COLORS = ['#FFADAD', '#A0C4FF', '#CAFFBF', '#FDFFB6'] as const
/** 3x3 satır bantları: üst, orta, alt. */
export const DEFAULT_BAND_COLORS = ['#CAFFBF', '#FDFFB6', '#FFADAD'] as const

export const HISTORY_LIMIT = 50
export const STORAGE_KEY = 'karakter-pusulasi'
