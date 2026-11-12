/**
 * Sunucu tarafı limitler. Edge Function'lar ön yüz kodunu (src/) içe aktarmaz;
 * ortak değerler burada kopya olarak durur ve `limits.test.ts`, src/constants.ts
 * ile aynı kaldıklarını denetler.
 */

export const NAME_MAX = 20
export const BULLET_MAX = 40
export const BULLETS_MAX = 3
export const LABEL_MAX = 24
/** Oyun başlığı (ön yüzdeki TITLE_MAX'tan geniş; sunucu üst sınırı). */
export const GAME_TITLE_MAX = 60

export const GRID_SIZES = [2, 3, 4] as const
export type GridSize = (typeof GRID_SIZES)[number]

/** Oyun oluşturmak için gereken, isim ve en az bir maddesi olan hücre sayısı. */
export const MIN_PLAYABLE_CELLS = 4

export const PHOTO_SIZE = 400
export const PHOTO_MAX_BYTES = 150 * 1024
export const PHOTOS_MAX = 16

/** create-game isteğinin gövde üst sınırı (16 × 150 KB + JSON + multipart payı). */
export const MAX_BODY_BYTES = 3 * 1024 * 1024
/** delete-game gibi JSON uç noktaları için. */
export const MAX_JSON_BODY_BYTES = 4 * 1024

/** Saat cinsinden izin verilen süreler; başka değer kabul edilmez. */
export const DURATIONS_HOURS = [1, 24, 72] as const
export type DurationHours = (typeof DURATIONS_HOURS)[number]
export const DEFAULT_DURATION_HOURS: DurationHours = 24

/** Oyun kodu uzunluğu (base62, ~95 bit). */
export const GAME_CODE_LENGTH = 16

export const RATE_LIMITS = {
  'create-game': { max: 5, windowSeconds: 3600 },
  'delete-game': { max: 30, windowSeconds: 3600 },
} as const
export type RateLimitedAction = keyof typeof RATE_LIMITS
