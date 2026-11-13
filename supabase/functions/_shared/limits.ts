/**
 * Sunucu tarafı limitler. Edge Function'lar ön yüz kodunu (src/) içe aktarmaz;
 * ortak değerler burada kopya olarak durur ve `limits.test.ts`, src/constants.ts
 * ile aynı kaldıklarını denetler.
 */

export const NAME_MAX = 20
export const BULLET_MAX = 40
export const BULLETS_MAX = 3
export const LABEL_MAX = 24
/** Oyunu kuranın adı (isteğe bağlı; oyuncu adıyla aynı kurallar). */
export const CREATOR_NAME_MAX = NAME_MAX
/** Oyun başlığı (ön yüzdeki TITLE_MAX'tan geniş; sunucu üst sınırı). */
export const GAME_TITLE_MAX = 60

export const GRID_SIZES = [2, 3, 4] as const
export type GridSize = (typeof GRID_SIZES)[number]

/** Oyun oluşturmak için gereken, isim ve en az bir maddesi olan hücre sayısı. */
export const MIN_PLAYABLE_CELLS = 4

export const PHOTO_SIZE = 400
export const PHOTO_MAX_BYTES = 150 * 1024
export const PHOTOS_MAX = 16

/** create-game isteğinin gövde üst sınırı (16 × (150 KB + 5 KB bulanık) + JSON + multipart payı). */
export const MAX_BODY_BYTES = 3 * 1024 * 1024
/** delete-game gibi JSON uç noktaları için. */
export const MAX_JSON_BODY_BYTES = 4 * 1024

/** Saat cinsinden izin verilen süreler; başka değer kabul edilmez. */
export const DURATIONS_HOURS = [1, 24, 72] as const
export type DurationHours = (typeof DURATIONS_HOURS)[number]
export const DEFAULT_DURATION_HOURS: DurationHours = 24

/** Oyun kodu uzunluğu (base62, ~95 bit). */
export const GAME_CODE_LENGTH = 16

/** İpucu için oyunu kuran tarayıcının ürettiği bulanık sürüm. */
export const BLUR_SIZE = 32
export const BLUR_MAX_BYTES = 5 * 1024

/** Tahmin oyunu: oyuncu adı en fazla bu kadar karakter (isimle aynı). */
export const PLAYER_NAME_MAX = NAME_MAX
/** Oyun başına en fazla tahmin. */
export const GUESSES_MAX = 200
/** Net fotoğrafların imzalı adres ömrü (saniye). */
export const SIGNED_URL_SECONDS = 600

/**
 * create-game: IP başına birden çok pencere; istek hepsine sığmalıysa kabul edilir
 * (reddedilen istek hiçbir pencereden düşmez). `key`, rate_limits anahtarının
 * işlem kısmıdır. Pencere en fazla 1 gün (rate_limit_take ve purge-rate-limits).
 */
export const CREATE_GAME_LIMITS = [
  { key: 'create-game', max: 15, windowSeconds: 3600 },
  { key: 'create-game-day', max: 40, windowSeconds: 86400 },
] as const

/** Sistemde aynı anda en fazla bu kadar süresi dolmamış oyun olabilir. */
export const MAX_ACTIVE_GAMES = 1000

export const RATE_LIMITS = {
  'delete-game': { max: 30, windowSeconds: 3600 },
  'get-game': { max: 120, windowSeconds: 3600 },
  'use-hint': { max: 120, windowSeconds: 3600 },
  'submit-guess': { max: 30, windowSeconds: 3600 },
  'game-stats': { max: 60, windowSeconds: 3600 },
  'start-game': { max: 120, windowSeconds: 3600 },
} as const
export type RateLimitedAction = keyof typeof RATE_LIMITS

// ---------------------------------------------------------------------------
// Canlı oda (Aşama 4)
// ---------------------------------------------------------------------------

export const ROOM_MODES = ['classic', 'quick'] as const
export type RoomMode = (typeof ROOM_MODES)[number]
/** Başlatmak için gereken en az oyuncu (sunucuda doğrulanır). */
export const ROOM_MIN_PLAYERS: Record<RoomMode, number> = { classic: 4, quick: 3 }
export const ROOM_MAX_PLAYERS = 16
/** Yazma süresi seçenekleri (saniye). */
export const ROOM_WRITE_SECONDS = [120, 180, 300] as const
export type RoomWriteSeconds = (typeof ROOM_WRITE_SECONDS)[number]
export const ROOM_DEFAULT_WRITE_SECONDS: RoomWriteSeconds = 180

/** Oda kodu (base62, ~95 bit) ve Realtime kanal kimliği (base62, ~131 bit). */
export const ROOM_CODE_LENGTH = 16
export const ROOM_CHANNEL_ID_LENGTH = 22

/** Oda en geç kuruluştan bu kadar sonra silinir. */
export const ROOM_MAX_LIFETIME_SECONDS = 2 * 3600
/** Oyun bittikten sonra oda bu kadar daha durur. */
export const ROOM_DONE_TTL_SECONDS = 30 * 60
/** Admin bu kadar görünmezse en eski çevrimiçi oyuncu admin olur. */
export const ROOM_ADMIN_TIMEOUT_SECONDS = 5 * 60
/** Son bu kadar saniyede durum isteyen oyuncu çevrimiçi sayılır (nabız aralığının 2 katından fazla). */
export const ROOM_ONLINE_SECONDS = 150
/** last_seen_at en fazla bu sıklıkla yazılır (her durum isteğinde değil). */
export const ROOM_SEEN_WRITE_SECONDS = 20

/** create-room / join-room gövdesi: tek foto (≤150 KB) + küçük JSON + multipart payı. */
export const ROOM_MAX_BODY_BYTES = 256 * 1024

/** create-room: IP başına saatlik ve günlük pencere (create-game ile aynı mantık). */
export const CREATE_ROOM_LIMITS = [
  { key: 'create-room', max: 10, windowSeconds: 3600 },
  { key: 'create-room-day', max: 30, windowSeconds: 86400 },
] as const
/** Sistemde aynı anda en fazla bu kadar süresi dolmamış oda. */
export const MAX_ACTIVE_ROOMS = 20
/**
 * Bitmemiş odalardaki toplam oyuncu tavanı. Ücretsiz planda 200 eşzamanlı
 * Realtime bağlantısı var; her oyuncu tek bağlantı açar, pay bırakılır.
 */
export const MAX_ACTIVE_ROOM_PLAYERS = 180

/** IP başına (oturumu olmayan istekler). Aynı Wi-Fi'daki 16 kişi + tekrar denemeler sığar. */
export const ROOM_IP_LIMITS = {
  'join-room': { max: 60, windowSeconds: 3600 },
  'room-preview': { max: 240, windowSeconds: 3600 },
} as const
export type RoomIpAction = keyof typeof ROOM_IP_LIMITS

/**
 * Oturum anahtarı başına (aynı ağdaki oyuncular birbirinin kotasını yemez).
 * room-state: istemci iki istek arasında en az 1 sn bekler (en çok 60/dk); pay bırakılır.
 */
export const ROOM_SESSION_LIMITS = {
  'room-state': { max: 90, windowSeconds: 60 },
  // Taslak kaydı (≈1,5 sn debounce + odak kaybı) 5 dakikalık yazmada 150'ye yaklaşabilir; tahminler de buradan.
  'room-action': { max: 600, windowSeconds: 3600 },
  'room-admin': { max: 300, windowSeconds: 3600 },
} as const
export type RoomSessionAction = keyof typeof ROOM_SESSION_LIMITS

/**
 * Yazma aşaması: Klasik'te herkes sonraki 3 kişiye 1'er madde, Hızlı'da sonraki
 * 1 kişiye 3 madde yazar. Her oyuncu toplam 3 madde alır.
 */
export const ROOM_ASSIGNMENT: Record<RoomMode, { targets: number; slots: number }> = {
  classic: { targets: 3, slots: 1 },
  quick: { targets: 1, slots: 3 },
}
/** Süre bittikten sonra taslak kaydı için pay (son kayıt ve saat kayması). */
export const ROOM_WRITE_GRACE_SECONDS = 5

/** Oyuncu sayısına göre ızgara: 4'e kadar 2×2, 9'a kadar 3×3, üstü 4×4. */
export const roomGridSize = (players: number): 2 | 3 | 4 => (players <= 4 ? 2 : players <= 9 ? 3 : 4)
