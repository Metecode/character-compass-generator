// Canlı oda / B: yazma aşaması, çok bağlamlı gerçek deneme (Playwright, elle çalıştırılır).
//
//   pnpm dev                              # ayrı terminalde
//   pnpm room:e2e:write                   # varsayılan http://localhost:5173
//   SHOTS=klasör pnpm room:e2e:write      # ekran görüntüleri
//
// Senaryo (yaklaşık 3 dakika; yazma süresi 2 dk tam bekleniyor):
//   1. Admin (masaüstü) Klasik, 2 dk oda kurar; Ayşe, Burak, Ceren (390 px) linkten katılır.
//   2. Admin başlatır: herkes geri sayımı, hedefin adını/fotoğrafını ve "1/3"ü görür.
//   3. Ayşe yazar (debounce ile kaydedilir), zar atar, kişiler arasında geçer.
//   4. Burak'ın bağlantısı koparken yazar: "Kaydedilemedi"; bağlantı dönünce kaydedilir;
//      sayfayı yenileyince yazdıkları geri gelir.
//   5. Ceren boş maddeyle "Hazırım" der (onay), herkes "1/4 hazır" görür; düzenlemeye döner.
//   6. Son 30 saniyede geri sayım kırmızıya döner. Admin son saniyelerde yazar.
//   7. Süre dolunca kimse bir şey yapmadan aşama ilerler (ilk istek ilerletir, sinyal yayılır).
//   8. Sunucuda kaydedilen madde sayısı denetlenir (salt okuma SQL), oda silinir.

import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'
import { chromium } from 'playwright'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const SHOTS = process.env.SHOTS ?? null
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
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 860 } },
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
const timerText = (page) => page.getByRole('timer').innerText()
const status = (page) => page.getByRole('status').filter({ hasText: /Kayded/ }).first()

let admin
let code
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
  const startBtn = admin.page.getByRole('button', { name: 'Oyunu başlat' })
  check(await startBtn.isDisabled(), 'tek kişiyken "Oyunu başlat" pasif')

  const players = []
  const colors = [[160, 196, 255], [202, 255, 191], [253, 255, 182]]
  for (const [i, name] of ['Ayşe', 'Burak', 'Ceren'].entries()) {
    const p = await newPlayer(name, true)
    await p.page.goto(roomUrl)
    await p.page.getByLabel('Adın').fill(name)
    await pickPhoto(p.page, colors[i])
    await p.page.getByRole('button', { name: 'Odaya gir' }).click()
    await p.page.getByRole('heading', { name: /Katılanlar/ }).waitFor({ timeout: 20000 })
    players.push(p)
  }
  const [ayse, burak, ceren] = players
  await admin.page.getByText('Başlatınca yeni kimse katılamaz').waitFor({ timeout: 15000 })
  check(await startBtn.isEnabled(), '4 kişiyle "Oyunu başlat" etkin')
  check((await ayse.page.getByRole('button', { name: 'Oyunu başlat' }).count()) === 0, 'oyuncuda başlat düğmesi yok')
  await shot(admin, 'b01-lobi-admin-baslat')

  console.log('== Başlatma')
  const t0 = Date.now()
  await startBtn.click()
  const everyone = [admin, ...players]
  await Promise.all(everyone.map((p) => p.page.getByRole('timer').waitFor({ timeout: 15000 })))
  check(true, 'herkes yazma ekranında', `${Date.now() - t0} ms`)
  const timers = await Promise.all(everyone.map((p) => timerText(p.page)))
  check(timers.every((t) => /^[12]:\d\d$/.test(t)), 'geri sayım 2 dakikadan', timers.join(' '))
  const heads = await Promise.all(everyone.map((p) => p.page.getByText(/Kime yazıyorsun/).innerText()))
  check(heads.every((h) => /1\/3/.test(h)), 'Klasik: "1/3" görünür')
  const targetNames = await Promise.all(everyone.map((p) => p.page.locator('#target-name').innerText()))
  check(targetNames.every((n, i) => n !== ['Mete', 'Ayşe', 'Burak', 'Ceren'][i]), 'kimse kendine yazmıyor', targetNames.join(', '))
  const photoBox = await ayse.page.locator('#target-name').locator('xpath=preceding-sibling::img').boundingBox()
  check(photoBox && photoBox.width >= 140, 'hedef fotoğrafı büyük (mobil)', `${Math.round(photoBox?.width ?? 0)} px`)
  check((await ayse.page.getByRole('button', { name: 'Yazmayı bitir' }).count()) === 0, 'oyuncuda "Yazmayı bitir" yok')
  await shot(ayse, 'b02-yazma-mobil')
  await shot(admin, 'b03-yazma-admin')

  console.log('== Ayşe yazar, zar atar, kişiler arasında geçer')
  const aInput = ayse.page.locator('input.field').first()
  await aInput.pressSequentially('Hep geç kalır', { delay: 40 })
  await status(ayse.page).filter({ hasText: 'Kaydedildi' }).waitFor({ timeout: 6000 })
  check(true, 'ara verince taslak kaydedildi')
  await ayse.page.getByRole('button', { name: 'Sonraki kişi' }).click()
  check(/2\/3/.test(await ayse.page.getByText(/Kime yazıyorsun/).innerText()), 'sonraki kişi: 2/3')
  await ayse.page.getByRole('button', { name: 'Zar at' }).click()
  const rolled = await ayse.page.locator('input.field').first().inputValue()
  check(rolled.length > 0 && rolled.length <= 40, 'zar havuzdan madde getirdi', rolled)
  await ayse.page.getByRole('button', { name: /^3\. kişi/ }).click()
  check(/3\/3/.test(await ayse.page.getByText(/Kime yazıyorsun/).innerText()), 'nokta ile 3/3')
  await ayse.page.getByRole('button', { name: /^1\. kişi/ }).click()
  check((await ayse.page.locator('input.field').first().inputValue()) === 'Hep geç kalır', 'geri dönünce yazdığı duruyor')
  check(/yazıldı/.test((await ayse.page.getByRole('button', { name: /^2\. kişi/ }).getAttribute('aria-label')) ?? ''), 'nokta dolu gösterir')
  await status(ayse.page).filter({ hasText: 'Kaydedildi' }).waitFor({ timeout: 6000 })
  await shot(ayse, 'b04-yazma-dolu-mobil')

  console.log('== Burak bağlantısı koparken yazar')
  await burak.context.setOffline(true)
  await burak.page.locator('input.field').first().fill('Çevrimdışı yazdı')
  await status(burak.page).filter({ hasText: 'Kaydedilemedi' }).waitFor({ timeout: 8000 })
  check(true, 'bağlantı yokken "Kaydedilemedi"')
  await burak.page.getByText('Bağlantı yeniden kuruluyor').waitFor({ timeout: 10000 }).catch(() => {})
  check(await burak.page.getByText('Bağlantı yeniden kuruluyor').isVisible(), 'bağlantı göstergesi görünür')
  await shot(burak, 'b05-kopuk-mobil')
  await burak.context.setOffline(false)
  await status(burak.page).filter({ hasText: 'Kaydedildi' }).waitFor({ timeout: 10000 })
  check(true, 'bağlantı dönünce kaydedildi')
  await burak.page.reload()
  await burak.page.getByRole('timer').waitFor({ timeout: 15000 })
  check((await burak.page.locator('input.field').first().inputValue()) === 'Çevrimdışı yazdı', 'yenileyince yazdığı geri geldi')

  console.log('== Ceren hazır olur, düzenlemeye döner')
  await ceren.page.locator('input.field').first().fill('Kahvesiz konuşmaz')
  await ceren.page.getByRole('button', { name: 'Hazırım' }).click()
  const confirm = ceren.page.getByRole('dialog', { name: '2 madde boş' })
  await confirm.waitFor()
  check(true, 'boş madde varken onay sorulur')
  await confirm.getByRole('button', { name: 'Yine de hazırım' }).click()
  await ceren.page.getByRole('heading', { name: 'Hazırsın' }).waitFor({ timeout: 10000 })
  check((await ceren.page.getByText('Kahvesiz konuşmaz').count()) === 1, 'hazır ekranında yazdıkları listelenir')
  const tReady = Date.now()
  await admin.page.getByText('1/4 hazır').first().waitFor({ timeout: 10000 })
  check(true, 'admin "1/4 hazır" görür', `${Date.now() - tReady} ms`)
  await shot(ceren, 'b06-hazir-mobil')
  await ceren.page.getByRole('button', { name: 'Maddelerimi düzenle' }).click()
  await ceren.page.getByRole('button', { name: 'Hazırım' }).waitFor({ timeout: 10000 })
  check((await ceren.page.locator('input.field').first().inputValue()) === 'Kahvesiz konuşmaz', 'düzenlemeye dönünce yazdığı duruyor')
  await admin.page.getByText('0/4 hazır').first().waitFor({ timeout: 10000 })
  check(true, 'admin "0/4 hazır" görür')

  console.log('== Son 30 saniye')
  for (;;) {
    const t = await timerText(ayse.page)
    const [m, s] = t.split(':').map(Number)
    if (m * 60 + s <= 28) break
    await ayse.page.waitForTimeout(1000)
  }
  const bar = await ayse.page.locator('.sticky').first().getAttribute('class')
  check(bar.includes('bg-danger'), 'son 30 saniyede geri sayım kırmızı')
  await shot(ayse, 'b07-son-30-mobil')

  // Admin son saniyelerde yazar ve hiçbir şeye basmaz: süre sonu kaydı göndermeli.
  for (;;) {
    const t = await timerText(admin.page)
    const [m, s] = t.split(':').map(Number)
    if (m * 60 + s <= 2) break
    await admin.page.waitForTimeout(250)
  }
  await admin.page.locator('input.field').first().fill('Son saniye maddesi')

  console.log('== Süre doluyor')
  const tEnd = Date.now()
  await Promise.all(everyone.map((p) => p.page.getByText('Maddeler yazıldı').waitFor({ timeout: 25000 })))
  check(true, 'süre dolunca herkes açılış ekranına geçti', `${Math.round((Date.now() - tEnd) / 1000)} sn`)
  await shot(ayse, 'b08-acilis-bekleme-mobil')

  console.log('== Sunucuda kaydedilenler')
  // Kabuk (Windows'ta cmd) için SQL'de < > | & ^ " kullanılmaz; tek komut dizesi, SQL çift tırnakta.
  const sql = `select count(*) filter (where nullif(text, '') is not null) as dolu, count(*) as toplam, string_agg(nullif(text, ''), ' / ' order by text) as metinler from public.room_items where room_code = '${code}';`
  const out = execSync(`npx supabase db query --remote --read-only "${sql}"`, { encoding: 'utf8' })
  const row = JSON.parse(out.slice(out.indexOf('{'))).rows[0]
  check(Number(row.toplam) === 12, '12 madde satırı (4 × 3)', String(row.toplam))
  check(Number(row.dolu) === 5, '5 dolu madde (Ayşe 2, Burak 1, Ceren 1, Admin 1)', String(row.dolu))
  check(row.metinler.includes('Son saniye maddesi'), 'son saniyede yazılan kaydedildi')
  check(row.metinler.includes('Çevrimdışı yazdı') && row.metinler.includes(rolled), 'çevrimdışı ve zarla yazılan kaydedildi')
} finally {
  if (admin && code) {
    await admin.page.goto(`${BASE}/r/${code}`).catch(() => {})
    const session = await admin.page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('compass-rooms') ?? '{}')
      return raw.state?.rooms?.[0]?.session ?? null
    })
    if (session) {
      const res = await fetch(`${env.VITE_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/room-admin`, {
        method: 'POST',
        headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
        body: JSON.stringify({ code, session, action: 'delete' }),
      })
      console.log(`oda silindi: ${res.status}`)
    }
  }
  console.log('\nFonksiyon çağrıları (bağlam başına):')
  for (const [label, counts] of calls) console.log(`  ${label}: ${JSON.stringify(counts)}`)
  await browser.close()
}

console.log(failures === 0 ? '\nHepsi geçti.' : `\n${failures} denetim başarısız.`)
process.exit(failures === 0 ? 0 : 1)
