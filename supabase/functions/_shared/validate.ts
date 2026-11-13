/**
 * create-game gövdesinin doğrulaması. Saf TS: Deno'ya ya da ağa bağımlı değil,
 * vitest ile doğrudan test edilir.
 *
 * İstek (multipart/form-data):
 *   data     → JSON (aşağıdaki GamePayload)
 *   photo_N  → N. fotoğrafın JPEG baytları (N, hücrelerdeki `photo` alanının değeri)
 *   blur_N   → isteğe bağlı: N. fotoğrafın ipucu için bulanık sürümü (32×32 JPEG, ≤ 5 KB).
 *              Yalnızca photo_N varsa kabul edilir; hiç gönderilmezse oyunda ipucu olmaz.
 *
 * GamePayload:
 *   { title?: string, gridSize: 2|3|4, duration?: 1|24|72, creatorName?: string,
 *     regions: [{ color: '#RRGGBB', label?: string }],
 *     cells: [{ name: string, bullets: string[], photo?: number | null }] }
 */

import { inspectJpeg } from './jpeg.ts'
import {
  BLUR_MAX_BYTES,
  BLUR_SIZE,
  BULLET_MAX,
  BULLETS_MAX,
  CREATOR_NAME_MAX,
  DEFAULT_DURATION_HOURS,
  DURATIONS_HOURS,
  GAME_TITLE_MAX,
  GRID_SIZES,
  LABEL_MAX,
  MIN_PLAYABLE_CELLS,
  NAME_MAX,
  PHOTO_MAX_BYTES,
  PHOTO_SIZE,
  PHOTOS_MAX,
  type DurationHours,
  type GridSize,
} from './limits.ts'

export type ValidationError =
  | 'invalid_payload'
  | 'invalid_title'
  | 'invalid_creator'
  | 'invalid_grid'
  | 'invalid_duration'
  | 'invalid_regions'
  | 'invalid_cells'
  | 'name_too_long'
  | 'bullet_too_long'
  | 'too_many_bullets'
  | 'not_enough_cells'
  | 'too_many_photos'
  | 'invalid_photo_field'
  | 'missing_photo'
  | 'unused_photo'
  | 'duplicate_photo'
  | 'blur_invalid'
  | 'photo_too_large'
  | 'photo_not_jpeg'
  | 'photo_wrong_size'

export interface ValidRegion {
  color: string
  label?: string
}

export interface ValidCell {
  name: string
  bullets: string[]
  /** photo_N alanındaki N; foto yoksa null. */
  photo: number | null
}

export interface ValidGame {
  title: string
  /** Oyunu kuranın adı; verilmediyse (eski istemciler) null. */
  creatorName: string | null
  gridSize: GridSize
  durationHours: DurationHours
  regions: ValidRegion[]
  cells: ValidCell[]
  /** Hücrelerin işaret ettiği fotolar (N → JPEG baytları). */
  photos: Map<number, Uint8Array>
  /** İpucu için bulanık sürümler (N → JPEG baytları); her biri bir photo_N'ye ait. */
  blurs: Map<number, Uint8Array>
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ValidationError }

const fail = (error: ValidationError): { ok: false; error: ValidationError } => ({ ok: false, error })

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Emoji gibi birleşik karakterleri tek sayar; ön yüzdeki textLength ile aynı ölçü. */
export const textLength = (s: string): number => Array.from(s).length

// Satır sonu, sekme ve diğer kontrol karakterleri hücre metinlerinde yer almaz.
// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const isCleanText = (v: unknown): v is string => typeof v === 'string' && !CONTROL_CHARS.test(v)

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function parseDuration(v: unknown): Result<DurationHours> {
  if (v === undefined) return { ok: true, value: DEFAULT_DURATION_HOURS }
  if (typeof v === 'number' && (DURATIONS_HOURS as readonly number[]).includes(v)) {
    return { ok: true, value: v as DurationHours }
  }
  return fail('invalid_duration')
}

/**
 * Kurucu adı: isteğe bağlı. Oyuncu adıyla aynı kurallar (kontrol karakteri yok,
 * boşluklar sadeleşir, en fazla 20 karakter). Boş ya da yalnızca boşluk → null.
 */
export function parseCreatorName(v: unknown): Result<string | null> {
  if (v === undefined || v === null) return { ok: true, value: null }
  if (!isCleanText(v)) return fail('invalid_creator')
  const name = v.trim().replace(/\s+/g, ' ')
  if (name === '') return { ok: true, value: null }
  if (textLength(name) > CREATOR_NAME_MAX) return fail('invalid_creator')
  return { ok: true, value: name }
}

/** "photo_0" … "photo_15" → 0 … 15. Başka alan adı null döner. */
export function photoFieldIndex(field: string): number | null {
  const m = /^photo_(0|[1-9][0-9]?)$/.exec(field)
  if (!m) return null
  const n = Number(m[1])
  return n < PHOTOS_MAX ? n : null
}

/** "blur_0" … "blur_15" → 0 … 15. Başka alan adı null döner. */
export function blurFieldIndex(field: string): number | null {
  const m = /^blur_(0|[1-9][0-9]?)$/.exec(field)
  if (!m) return null
  const n = Number(m[1])
  return n < PHOTOS_MAX ? n : null
}

/** Bulanık ipucu dosyası: JPEG, tam 32×32, en fazla 5 KB. */
export function validateBlur(bytes: Uint8Array): ValidationError | null {
  if (bytes.length > BLUR_MAX_BYTES) return 'blur_invalid'
  const jpeg = inspectJpeg(bytes)
  if (!jpeg.ok || jpeg.width !== BLUR_SIZE || jpeg.height !== BLUR_SIZE) return 'blur_invalid'
  return null
}

export function validatePhoto(bytes: Uint8Array): ValidationError | null {
  if (bytes.length > PHOTO_MAX_BYTES) return 'photo_too_large'
  const jpeg = inspectJpeg(bytes)
  if (!jpeg.ok) return 'photo_not_jpeg'
  if (jpeg.width !== PHOTO_SIZE || jpeg.height !== PHOTO_SIZE) return 'photo_wrong_size'
  return null
}

function validateRegions(v: unknown, gridSize: GridSize): Result<ValidRegion[]> {
  const expected = gridSize === 3 ? 3 : 4
  if (!Array.isArray(v) || v.length !== expected) return fail('invalid_regions')
  const out: ValidRegion[] = []
  for (const r of v) {
    if (!isRecord(r) || typeof r.color !== 'string' || !HEX_COLOR.test(r.color)) {
      return fail('invalid_regions')
    }
    const region: ValidRegion = { color: r.color }
    if (r.label !== undefined && r.label !== null && r.label !== '') {
      if (!isCleanText(r.label) || textLength(r.label) > LABEL_MAX) return fail('invalid_regions')
      region.label = r.label
    }
    out.push(region)
  }
  return { ok: true, value: out }
}

function validateCell(c: unknown): Result<ValidCell> {
  if (!isRecord(c) || !isCleanText(c.name) || !Array.isArray(c.bullets)) {
    return fail('invalid_cells')
  }
  if (textLength(c.name) > NAME_MAX) return fail('name_too_long')
  if (c.bullets.length > BULLETS_MAX) return fail('too_many_bullets')
  const bullets: string[] = []
  for (const b of c.bullets) {
    if (!isCleanText(b)) return fail('invalid_cells')
    if (textLength(b) > BULLET_MAX) return fail('bullet_too_long')
    // Boş satırlar saklanmaz.
    if (b.trim() !== '') bullets.push(b)
  }
  let photo: number | null = null
  if (c.photo !== undefined && c.photo !== null) {
    if (typeof c.photo !== 'number' || !Number.isInteger(c.photo) || c.photo < 0 || c.photo >= PHOTOS_MAX) {
      return fail('invalid_cells')
    }
    photo = c.photo
  }
  return { ok: true, value: { name: c.name, bullets, photo } }
}

/** Tahmin oyununda oynanabilir hücre: ismi ve en az bir maddesi var. */
export const isPlayableCell = (c: { name: string; bullets: readonly string[] }): boolean =>
  c.name.trim() !== '' && c.bullets.some((b) => b.trim() !== '')

/**
 * @param data   `data` alanındaki JSON'un ayrıştırılmış hali
 * @param photos multipart'taki dosya alanları (alan adı → bayt)
 */
export function validateGame(
  data: unknown,
  photos: ReadonlyArray<{ field: string; bytes: Uint8Array }>,
): Result<ValidGame> {
  if (!isRecord(data)) return fail('invalid_payload')

  const title = data.title === undefined ? '' : data.title
  if (!isCleanText(title) || textLength(title) > GAME_TITLE_MAX) return fail('invalid_title')

  const creatorName = parseCreatorName(data.creatorName)
  if (!creatorName.ok) return creatorName

  const gridSize = data.gridSize
  if (typeof gridSize !== 'number' || !(GRID_SIZES as readonly number[]).includes(gridSize)) {
    return fail('invalid_grid')
  }
  const size = gridSize as GridSize

  const duration = parseDuration(data.duration)
  if (!duration.ok) return duration

  const regions = validateRegions(data.regions, size)
  if (!regions.ok) return regions

  if (!Array.isArray(data.cells) || data.cells.length !== size * size) return fail('invalid_cells')
  const cells: ValidCell[] = []
  for (const raw of data.cells) {
    const cell = validateCell(raw)
    if (!cell.ok) return cell
    cells.push(cell.value)
  }
  if (cells.filter(isPlayableCell).length < MIN_PLAYABLE_CELLS) return fail('not_enough_cells')

  // Fotolar: en fazla 16; her hücrenin işaret ettiği foto gelmeli, her gelen foto
  // tam bir hücrede kullanılmalı.
  const blurs = new Map<number, Uint8Array>()
  const photoFields: typeof photos[number][] = []
  for (const p of photos) {
    const b = blurFieldIndex(p.field)
    if (b === null) {
      photoFields.push(p)
      continue
    }
    if (blurs.has(b)) return fail('blur_invalid')
    const err = validateBlur(p.bytes)
    if (err) return fail(err)
    blurs.set(b, p.bytes)
  }
  if (photoFields.length > PHOTOS_MAX) return fail('too_many_photos')
  const byIndex = new Map<number, Uint8Array>()
  for (const p of photoFields) {
    const idx = photoFieldIndex(p.field)
    if (idx === null) return fail('invalid_photo_field')
    if (byIndex.has(idx)) return fail('duplicate_photo')
    const err = validatePhoto(p.bytes)
    if (err) return fail(err)
    byIndex.set(idx, p.bytes)
  }
  const used = new Set<number>()
  for (const c of cells) {
    if (c.photo === null) continue
    if (used.has(c.photo)) return fail('duplicate_photo')
    if (!byIndex.has(c.photo)) return fail('missing_photo')
    used.add(c.photo)
  }
  if (used.size !== byIndex.size) return fail('unused_photo')
  for (const b of blurs.keys()) if (!byIndex.has(b)) return fail('blur_invalid')

  return {
    ok: true,
    value: {
      title: title.trim(),
      creatorName: creatorName.value,
      gridSize: size,
      durationHours: duration.value,
      regions: regions.value,
      cells,
      photos: byIndex,
      blurs,
    },
  }
}
