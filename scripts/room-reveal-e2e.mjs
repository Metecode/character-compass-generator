// Canlı oda / C: tam oyun, çok bağlamlı gerçek deneme (Playwright, elle çalıştırılır).
//
//   pnpm dev                              # ayrı terminalde
//   pnpm room:e2e:reveal                  # varsayılan http://localhost:5173
//   SHOTS=klasör pnpm room:e2e:reveal     # ekran görüntüleri ve indirilen PNG
//   HANDOVER=1 pnpm room:e2e:reveal       # + admin açılışta kopar, 5 dk sonra devir (≈ 6 dk ek)
//
// Senaryo: Admin (masaüstü) + 5 oyuncu (390 px), Klasik.
//   1. Herkes 3 maddesini yazıp "Hazırım" der; son hazırda aşama hemen AÇILIŞ'a geçer.
//   2. Her hücrede tahmin edebilenler bir aday seçer (biri seçimini değiştirir); admin "x/y" görür.
//   3. İlk hücrede admin bir maddeyi gizler: herkesin ekranından kalkar.
//   4. Admin "Aç": kart döner, sahibi ve bilenler görünür; "Sıradaki".
//   5. Bir oyuncunun bağlantısı açılışta kopar ve döner: kaldığı yerden devam eder.
//   6. (HANDOVER=1) Admin sekmesi kapanır; 5 dk sonra en eski çevrimiçi oyuncu admin olur ve devam eder.
//   7. BITTI: skor tablosu, pusula, "Bu oda 30 dakika sonra silinir", PNG indir (1080×1080),
//      Düzenleyiciye aktar (ana sayfada adlar görünür), admin "Odayı şimdi sil" → herkes "Bu oda artık yok".
//   Sonda: bağlam başına ve toplam Edge Function çağrı sayısı.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { chromium } from 'playwright'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const SHOTS = process.env.SHOTS ?? null
const HANDOVER = process.env.HANDOVER === '1'
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let failures = 0
const check = (ok, label, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`)
}

function png(w, h, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.alloc(1 + w * 3)
  for (let x = 0; x < w; x++) row.set([r, g, b], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED ? false : true })
const calls = new Map()

async function newPlayer(label, mobile) {
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true }
      : { viewport: { width: 1280, height: 900 }, acceptDownloads: true },
  )
  const page = await context.newPage()
  const counts = {}
  calls.set(label, counts)
  page.on('request', (req) => {
    const m = /\/functions\/v1\/([a-z-]+)/.exec(req.url())
    if (m && req.method() === 'POST') counts[m[1]] = (counts[m[1]] ?? 0) + 1
  })
  page.on('pageerror', (e) => console.log(`[${label}] sayfa hatası: ${e.message}`))
  return { label, context, page }
}
const shot = async (p, name) => {
  if (SHOTS) await p.page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true })
}
async function pickPhoto(page, color) {
  await page.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png(600, 500, color) })
  await page.getByRole('dialog', { name: 'Fotoğrafı kırp' }).getByRole('button', { name: 'Kaydet' }).click()
  await page.getByRole('dialog', { name: 'Fotoğrafı kırp' }).waitFor({ state: 'detached' })
}
const pngSize = (buf) => ({ sig: buf.subarray(1, 4).toString(), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })

let admin
let code
let everyone = []
const NAMES = ['Ayşe', 'Burak', 'Ceren', 'Deniz', 'Emre']
const COLORS = [[160, 196, 255], [202, 255, 191], [253, 255, 182], [255, 214, 165], [189, 178, 255]]
try {
  console.log('== Kurulum')
  admin = await newPlayer('Admin', false)
  await admin.page.goto(`${BASE}/?oda=1`)
  await admin.page.getByRole('button', { name: 'Oyun', exact: true }).filter({ visible: true }).first().click()
  await admin.page.getByRole('menuitem', { name: /Canlı oda kur/ }).click()
  const dialog = admin.page.getByRole('dialog', { name: 'Canlı oda kur' })
  await dialog.getByText('2 dk', { exact: true }).click()
  await dialog.getByLabel('Adın').fill('Mete')
  await pickPhoto(admin.page, [255, 173, 173])
  await dialog.getByRole('button', { name: 'Odayı kur' }).click()
  await admin.page.waitForURL(/\/r\/[A-Za-z0-9]+$/, { timeout: 20000 })
  const roomUrl = admin.page.url()
  code = roomUrl.split('/r/')[1]

  const players = []
  for (const [i, name] of NAMES.entries()) {
    const p = await newPlayer(name, true)
    await p.page.goto(roomUrl)
    await p.page.getByLabel('Adın').fill(name)
    await pickPhoto(p.page, COLORS[i])
    await p.page.getByRole('button', { name: 'Odaya gir' }).click()
    await p.page.getByRole('heading', { name: /Katılanlar/ }).waitFor({ timeout: 20000 })
    players.push(p)
  }
  everyone = [admin, ...players]
  await admin.page.getByText('Başlatınca yeni kimse katılamaz').waitFor({ timeout: 15000 })
  await admin.page.getByRole('button', { name: 'Oyunu başlat' }).click()
  await Promise.all(everyone.map((p) => p.page.getByRole('timer').waitFor({ timeout: 15000 })))

  console.log('== Yazma: herkes 3 madde + Hazırım')
  for (const p of everyone) {
    for (let k = 0; k < 3; k++) {
      await p.page.locator('input.field').first().fill(`${p.label} maddesi ${k + 1}`)
      if (k < 2) await p.page.getByRole('button', { name: 'Sonraki kişi' }).click()
    }
    await p.page.getByRole('status').filter({ hasText: 'Kaydedildi' }).first().waitFor({ timeout: 8000 })
  }
  const tReady = Date.now()
  for (const p of everyone) await p.page.getByRole('button', { name: 'Hazırım' }).click()
  await Promise.all(everyone.map((p) => p.page.getByRole('heading', { name: 'Bu kim?' }).waitFor({ timeout: 20000 })))
  check(true, 'son "Hazırım"dan sonra herkes açılışta', `${Date.now() - tReady} ms`)
  await shot(players[0], 'c01-tahmin-mobil')
  await shot(admin, 'c02-tahmin-admin')

  let current = admin // o anki admin bağlamı
  const total = 6
  for (let pos = 0; pos < total; pos++) {
    console.log(`== Hücre ${pos + 1}`)
    const header = await players[0].page.getByText(/^Açılış · /).innerText()
    check(header.includes(`${pos + 1}/6`), `sıra ${pos + 1}/6`, header)

    // Tahmin edebilenler bir aday seçer; ilk oyuncu seçimini bir kez değiştirir.
    let guessed = 0
    for (const p of everyone) {
      if (p.closed) continue
      const sec = p.page.getByRole('region', { name: 'Tahminin' })
      if ((await sec.count()) === 0) continue
      const options = sec.getByRole('button')
      const n = await options.count()
      const pick = options.nth((pos + guessed) % n)
      await pick.click()
      await pick.waitFor()
      check((await pick.getAttribute('aria-pressed')) === 'true', `${p.label}: seçim hemen işaretli`)
      if (pos === 0 && guessed === 0 && n > 1) {
        const other = options.nth((pos + guessed + 1) % n)
        await other.click()
        check((await pick.getAttribute('aria-pressed')) === 'false' && (await other.getAttribute('aria-pressed')) === 'true', `${p.label}: seçim değişti`)
      }
      guessed++
    }
    const countText = current.page.getByText(/\d+\/\d+ tahmin etti/)
    await current.page.getByText(new RegExp(`^${guessed}/\\d+ tahmin etti$`)).waitFor({ timeout: 10000 })
    check(true, `admin "${await countText.innerText()}" görür`)
    check((await players[1].page.getByText(/tahmin etti$/).count()) === 0, 'oyuncu sayıyı görmez')

    if (pos === 0) {
      console.log('   gizle')
      const items = current.page.getByRole('button', { name: /^Maddeyi gizle: / })
      const label = await items.first().getAttribute('aria-label')
      const text = label.replace('Maddeyi gizle: ', '')
      await items.first().click()
      const hide = current.page.getByRole('dialog', { name: 'Madde gizlensin mi?' })
      await hide.getByRole('button', { name: 'Gizle' }).click()
      await players[2].page.getByText(text, { exact: true }).waitFor({ state: 'detached', timeout: 10000 })
      check(true, 'gizlenen madde oyuncunun ekranından kalktı', text)
      everyone.hiddenText = text
    }

    if (pos === 1) {
      console.log('   bağlantı kopar / döner')
      const b = players[1]
      await b.context.setOffline(true)
      await b.page.getByText('Bağlantı yeniden kuruluyor').waitFor({ timeout: 15000 }).catch(() => {})
      check(await b.page.getByText('Bağlantı yeniden kuruluyor').isVisible(), 'kopan oyuncuda bağlantı göstergesi')
      b.offline = true
    }

    const tOpen = Date.now()
    await current.page.getByRole('button', { name: 'Aç', exact: true }).click()
    await Promise.all(
      everyone.filter((p) => !p.closed && !p.offline).map((p) => p.page.getByText(/^Bilenler · \d+$|^Kimse bilemedi$/).first().waitFor({ timeout: 10000 })),
    )
    check(true, 'açılınca herkes sahibi ve bilenleri görür', `${Date.now() - tOpen} ms`)
    if (pos === 0) {
      await shot(players[0], 'c03-acildi-mobil')
      await shot(admin, 'c04-acildi-admin')
    }

    if (pos === 1) {
      const b = players[1]
      await b.context.setOffline(false)
      await b.page.getByText(/^Bilenler · \d+$|^Kimse bilemedi$/).first().waitFor({ timeout: 15000 })
      check(true, 'bağlantı dönünce kaldığı yerden (açılmış hücre) devam')
      b.offline = false
    }

    if (HANDOVER && pos === 2) {
      console.log('   admin kopar, devir bekleniyor (≈ 5 dk)')
      await admin.context.close()
      admin.closed = true
      const t0 = Date.now()
      const next = await Promise.any(
        players.map(async (p) => {
          await p.page.getByRole('button', { name: /^(Sıradaki|Sonuçları göster)$/ }).waitFor({ timeout: 8 * 60_000 })
          return p
        }),
      )
      check(true, `adminlik ${next.label}'e geçti, kaldığı hücreden devam`, `${Math.round((Date.now() - t0) / 1000)} sn`)
      await shot(next, 'c05-devir-mobil')
      current = next
    }

    const last = pos === total - 1
    await current.page.getByRole('button', { name: last ? 'Sonuçları göster' : 'Sıradaki', exact: true }).click()
    if (!last) {
      await players[0].page.getByText(new RegExp(`^Açılış · ${pos + 2}/6$`)).waitFor({ timeout: 10000 })
    }
  }

  console.log('== BITTI')
  const live = everyone.filter((p) => !p.closed)
  await Promise.all(live.map((p) => p.page.getByRole('heading', { name: 'Skor tablosu' }).waitFor({ timeout: 15000 })))
  check(true, 'herkes sonuç ekranında')
  const note = await players[0].page.getByText(/Bu oda \d+ dakika sonra silinir\./).innerText()
  check(/Bu oda (30|29) dakika sonra silinir\./.test(note), 'silinme notu', note.slice(0, 40))
  const rows = await players[0].page.getByRole('region', { name: 'Skor tablosu' }).getByRole('listitem').count()
  check(rows === 6, 'skor tablosunda 6 satır', String(rows))
  check((await players[0].page.getByText(everyone.hiddenText, { exact: true }).count()) === 0, 'gizlenen madde sonuç pusulasında yok')
  check((await players[0].page.getByRole('button', { name: 'Odayı şimdi sil' }).count()) === 0, 'oyuncuda "Odayı şimdi sil" yok')
  await shot(players[0], 'c06-sonuc-mobil')
  await shot(current, 'c07-sonuc-admin')

  console.log('   PNG indir')
  const [download] = await Promise.all([
    players[0].page.waitForEvent('download', { timeout: 30000 }),
    players[0].page.getByRole('button', { name: 'PNG indir' }).click(),
  ])
  const buf = readFileSync(await download.path())
  const size = pngSize(buf)
  check(size.sig === 'PNG' && size.w === 1080 && size.h === 1080, 'PNG 1080×1080', `${size.w}×${size.h}, ${Math.round(buf.length / 1024)} KB`)
  check(buf.length > 60_000, 'PNG fotoğrafları içeriyor (boyut)', `${Math.round(buf.length / 1024)} KB`)
  if (SHOTS) writeFileSync(join(SHOTS, 'c08-canli-oda.png'), buf)

  console.log('   Düzenleyiciye aktar')
  const imp = players[3]
  await imp.page.getByRole('button', { name: 'Düzenleyiciye aktar' }).click()
  await imp.page.getByRole('dialog', { name: 'Düzenleyiciye aktarılsın mı?' }).getByRole('button', { name: 'Aktar' }).click()
  await imp.page.waitForURL(`${BASE}/`, { timeout: 20000 })
  await imp.page.waitForTimeout(1500)
  const art = await imp.page.locator('body').innerText()
  const shownNames = ['Mete', ...NAMES].filter((n) => art.includes(n))
  check(shownNames.length === 6, 'düzenleyicide 6 ad', shownNames.join(', '))
  const photos = await imp.page.locator('img[data-cell-photo]').count()
  check(photos >= 6, 'düzenleyicide fotoğraflar', String(photos))
  await shot(imp, 'c09-duzenleyici-mobil')

  console.log('   Odayı şimdi sil')
  await current.page.getByRole('button', { name: 'Odayı şimdi sil' }).click()
  await current.page.getByRole('dialog', { name: 'Oda şimdi silinsin mi?' }).getByRole('button', { name: 'Sil' }).click()
  await current.page.getByRole('heading', { name: 'Oda silindi' }).waitFor({ timeout: 10000 })
  await players[0].page.getByRole('heading', { name: 'Bu oda artık yok' }).waitFor({ timeout: 15000 })
  check(true, 'oda silindi; diğerleri "Bu oda artık yok" görür')
  code = null
} finally {
  if (code) {
    for (const p of everyone.filter((x) => !x.closed)) {
      const s = await p.page
        .evaluate(() => JSON.parse(localStorage.getItem('compass-rooms') ?? '{}').state?.rooms?.[0]?.session ?? null)
        .catch(() => null)
      if (!s) continue
      const res = await fetch(`${env.VITE_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/room-admin`, {
        method: 'POST',
        headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ code, session: s, action: 'delete' }),
      })
      if (res.ok) {
        console.log('oda temizlendi')
        break
      }
    }
  }
  console.log('\nFonksiyon çağrıları (bağlam başına):')
  const totals = {}
  for (const [label, counts] of calls) {
    console.log(`  ${label}: ${JSON.stringify(counts)}`)
    for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + v
  }
  const sum = Object.values(totals).reduce((a, b) => a + b, 0)
  console.log(`  TOPLAM: ${JSON.stringify(totals)} = ${sum}`)
  await browser.close()
}

console.log(failures === 0 ? '\nHepsi geçti.' : `\n${failures} denetim başarısız.`)
process.exit(failures === 0 ? 0 : 1)
