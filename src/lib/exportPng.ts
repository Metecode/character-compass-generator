import { domToForeignObjectSvg } from 'modern-screenshot'
import { CANVAS_SIZE } from '../constants'
import { getPhotoUrl } from './photos'

const FONT_WEIGHTS = ['500', '700', '900'] as const
const isEditorOnly = (n: Node) => n instanceof Element && n.classList.contains('editor-only')

/** Pusulada kullanılan tüm font ağırlıklarının (Türkçe glifler dahil) yüklenmesini bekler. */
async function waitForFonts(): Promise<void> {
  if (!document.fonts) return
  await Promise.all(
    FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 24px Archivo`, 'AaĞğŞşİıÖöÜüÇç')),
  )
  await document.fonts.ready
}

/**
 * Foto URL'leri asenkron yüklendiği için önce beklenen sayıda <img> düğümün
 * DOM'a girmesini, sonra hepsinin decode edilmesini bekler.
 */
async function waitForPhotos(node: HTMLElement, expected: number, timeoutMs = 8000) {
  const start = performance.now()
  const imgs = () => Array.from(node.querySelectorAll<HTMLImageElement>('img[data-cell-photo]'))
  while (imgs().length < expected) {
    if (performance.now() - start > timeoutMs) throw new Error('Fotoğraflar yüklenemedi')
    await new Promise((r) => setTimeout(r, 50))
  }
  await Promise.all(imgs().map((img) => img.decode().catch(() => undefined)))
}

/**
 * 1080x1080 pusula düğümünü PNG'ye çevirir. Ekrandaki scale ebeveyndedir;
 * düğümün kendisi her zaman CANVAS_SIZE boyutundadır.
 */
export async function renderCompassPng(node: HTMLElement, photoIds: string[]): Promise<Blob> {
  await waitForFonts()
  // Yalnızca IndexedDB'de gerçekten bulunan fotolar ekrana gelir.
  const urls = await Promise.all(photoIds.map((id) => getPhotoUrl(id).catch(() => null)))
  await waitForPhotos(node, urls.filter(Boolean).length)
  const svg = await domToForeignObjectSvg(node, {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    filter: (n) => !isEditorOnly(n),
    font: { cssText: await embeddedFontCss() },
  })
  const canvas = await drawUntilStable(svg)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG oluşturulamadı'))), 'image/png'),
  )
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

let fontCss: Promise<string> | null = null

/**
 * Archivo'nun tüm @font-face kurallarını woff2 data URL'leriyle yeniden yazar.
 * modern-screenshot'ın otomatik gömmesi her çalıştırmada farklı subset'leri
 * atlayabiliyordu (ör. 700 ağırlığı hiç gömülmüyor, maddeler yedek fontla
 * çıkıyordu). Kendi CSS'imizi vermek bunu deterministik yapar. Sonuç önbelleklenir.
 */
function embeddedFontCss(): Promise<string> {
  fontCss ??= (async () => {
    const rules: CSSFontFaceRule[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSFontFaceRule && /archivo/i.test(rule.style.getPropertyValue('font-family')))
            rules.push(rule)
        }
      } catch {
        // Başka origin'den gelen stil sayfası okunamaz; bizimkiler aynı origin.
      }
    }
    const faces = await Promise.all(
      rules.map(async (rule) => {
        const s = rule.style
        const url = s.getPropertyValue('src').match(/url\(\s*["']?([^"')]+\.woff2[^"')]*)["']?\s*\)/)?.[1]
        if (!url) return ''
        const abs = new URL(url, rule.parentStyleSheet?.href ?? location.href).href
        const res = await fetch(abs)
        if (!res.ok) throw new Error(`Font alınamadı: ${abs}`)
        const data = await blobToDataUrl(await res.blob())
        const range = s.getPropertyValue('unicode-range')
        return `@font-face{font-family:'Archivo';font-style:${s.getPropertyValue('font-style') || 'normal'};font-weight:${s.getPropertyValue('font-weight') || '400'};${range ? `unicode-range:${range};` : ''}src:url(${data}) format('woff2');}`
      }),
    )
    const css = faces.filter(Boolean).join('\n')
    if (!css) throw new Error('Gömülecek font bulunamadı')
    return css
  })().catch((e: unknown) => {
    fontCss = null // bir sonraki denemede yeniden dene
    throw e
  })
  return fontCss
}

/** Hızlı piksel özeti (FNV-1a, her 7. piksel). */
function pixelHash(c2d: CanvasRenderingContext2D): number {
  const px = new Uint32Array(c2d.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data.buffer)
  let h = 0x811c9dc5
  for (let i = 0; i < px.length; i += 7) h = Math.imul(h ^ px[i]!, 0x01000193)
  return h >>> 0
}

/**
 * SVG'yi (foreignObject) canvas'a çizer. Chrome, SVG görseli içindeki gömülü
 * fontları görsel "yüklendi" dedikten sonra decode edebiliyor; ilk çizimde yedek
 * font görünebiliyor (fotolu, büyük SVG'lerde belirgin). Bu yüzden belirli
 * aralıklarla yeniden çizip, en az MIN_MS geçtikten sonra iki ardışık çizim
 * piksel olarak aynıysa dururuz.
 */
async function drawUntilStable(svg: SVGElement): Promise<HTMLCanvasElement> {
  const MIN_MS = 300
  const MAX_MS = 2500
  const STEP_MS = 120
  const xml = new XMLSerializer().serializeToString(svg)
  const img = new Image()
  img.decoding = 'sync'
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
  await img.decode()

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = CANVAS_SIZE
  const c2d = canvas.getContext('2d', { willReadFrequently: true })
  if (!c2d) throw new Error('Canvas desteklenmiyor')

  const start = performance.now()
  let prev: number | null = null
  for (;;) {
    c2d.fillStyle = '#121212'
    c2d.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    c2d.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
    const h = pixelHash(c2d)
    const elapsed = performance.now() - start
    if ((h === prev && elapsed >= MIN_MS) || elapsed >= MAX_MS) return canvas
    prev = h
    await sleep(STEP_MS)
  }
}

/** Başlıktan güvenli bir dosya adı üretir (Türkçe karakterler sadeleştirilir). */
export function fileNameFor(title: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u' }
  const slug = title
    .toLocaleLowerCase('tr')
    .replace(/[çğıiöşü]/g, (c) => map[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${slug || 'character-compass'}.png`
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    const probe = new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}
