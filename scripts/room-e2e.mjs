// Canlı oda: çok bağlamlı gerçek deneme (Playwright, elle çalıştırılır; pnpm test'e dahil değil).
//
//   pnpm dev                       # ayrı terminalde (canlı Supabase'e bağlanır, .env.local)
//   pnpm room:e2e                  # varsayılan http://localhost:5173
//   BASE_URL=https://… SHOTS=klasör pnpm room:e2e
//
// Sistemdeki Chrome kullanılır (channel: 'chrome'); Playwright tarayıcı indirmez.
// Senaryo (Parça A):
//   1. Admin editörden "Canlı oda kur" ile odayı kurar (masaüstü).
//   2. Üç oyuncu linkten katılır (390 px mobil); admin listeyi canlı görür (gecikme ölçülür).
//   3. Katılmamış ziyaretçi yalnızca kurucu adını ve sayıyı görür; aynı ad reddedilir.
//   4. Bir oyuncunun bağlantısı kopar: "Bağlantı yeniden kuruluyor" görünür; o sırada admin
//      birini çıkarır; bağlantı dönünce liste kendiliğinden düzelir. Ardından sayfa yenilenir,
//      oyuncu aynı yerine döner.
//   5. Admin odayı siler; diğerleri "Bu oda artık yok" görür.
// Her bağlamın fonksiyon çağrıları sayılır (çağrı kotası tahmini için).

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, crc32 } from 'node:zlib'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const SHOTS = process.env.SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let failures = 0
const check = (ok, label, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`)
}

/** Düz renkli PNG (kırpma akışına verilecek "fotoğraf"). */
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
const calls = new Map() // bağlam → { fn → sayı }

async function newPlayer(label, mobile) {
  const context = await browser.newContext(
    mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } },
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

const lobbyNames = (page) =>
  page.locator('#players-title ~ ul li p.truncate').allInnerTexts().then((t) => t.map((s) => s.replace(' (sen)', '').trim()))

async function waitForNames(page, expected, timeout = 15000) {
  const start = Date.now()
  for (;;) {
    const names = await lobbyNames(page)
    if (JSON.stringify(names) === JSON.stringify(expected)) return Date.now() - start
    if (Date.now() - start > timeout) throw new Error(`liste beklenen değil: ${names.join(', ')}`)
    await page.waitForTimeout(100)
  }
}

try {
  // 1) Admin odayı kurar
  const admin = await newPlayer('Admin', false)
  await admin.page.goto(`${BASE}/`)
  await admin.page.getByRole('button', { name: 'Oyun', exact: true }).filter({ visible: true }).first().click()
  await admin.page.getByRole('menuitem', { name: /Canlı oda kur/ }).click()
  const dialog = admin.page.getByRole('dialog', { name: 'Canlı oda kur' })
  await dialog.getByLabel('Adın').fill('Mete')
  await shot(admin, '01-oda-kur')
  await pickPhoto(admin.page, [255, 173, 173])
  check(await dialog.isVisible(), 'kırpma kapanınca oda kurma penceresi açık kalır')
  await dialog.getByRole('button', { name: 'Odayı kur' }).click()
  await admin.page.waitForURL(/\/r\/[A-Za-z0-9]+$/, { timeout: 20000 })
  const roomUrl = admin.page.url()
  await admin.page.getByText('Arkadaşların gelsin').waitFor()
  check(true, 'oda kuruldu', roomUrl.replace(/\/r\/.*/, '/r/…'))
  await shot(admin, '02-lobi-admin')

  // 2) Oyuncular katılır
  const players = []
  const colors = [[160, 196, 255], [202, 255, 191], [253, 255, 182]]
  for (const [i, name] of ['Ayşe', 'Burak', 'Ceren'].entries()) {
    const p = await newPlayer(name, true)
    await p.page.goto(roomUrl)
    await p.page.getByText('seni canlı pusula oyununa çağırıyor').waitFor()
    if (i === 0) {
      const text = await p.page.locator('main').innerText()
      check(text.includes('Mete') && text.includes('1 kişi katıldı'), 'ziyaretçi kurucu adını ve sayıyı görür')
      await shot(p, '03-katil-mobil')
    }
    await p.page.getByLabel('Adın').fill(name)
    await pickPhoto(p.page, colors[i])
    const t0 = Date.now()
    await p.page.getByRole('button', { name: 'Odaya gir' }).click()
    await p.page.getByRole('heading', { name: /Katılanlar/ }).waitFor({ timeout: 20000 })
    const joinedAt = Date.now()
    const expected = ['Mete', 'Ayşe', 'Burak', 'Ceren'].slice(0, i + 2)
    const lag = await waitForNames(admin.page, expected)
    check(true, `${name} katıldı; admin listede gördü`, `katılma ${joinedAt - t0} ms, admin ekranına ${lag} ms sonra`)
    players.push(p)
  }
  await shot(players[0], '04-lobi-mobil')
  await shot(admin, '05-lobi-admin-4')
  if (SHOTS) {
    await admin.page.setViewportSize({ width: 390, height: 844 })
    await shot(admin, '05b-lobi-admin-mobil')
    await admin.page.setViewportSize({ width: 1280, height: 860 })
  }

  // 3) Ziyaretçi: ad/foto görünmez; aynı ad reddedilir
  const guest = await newPlayer('Ziyaretçi', true)
  await guest.page.goto(roomUrl)
  await guest.page.getByText('4 kişi katıldı').waitFor()
  const guestText = await guest.page.locator('main').innerText()
  check(!/Ayşe|Burak|Ceren/.test(guestText), 'ziyaretçi oyuncu adlarını görmez')
  check((await guest.page.locator('main img').count()) === 0, 'ziyaretçi fotoğraf görmez')
  await guest.page.getByLabel('Adın').fill('BURAK')
  await pickPhoto(guest.page, [200, 200, 200])
  await guest.page.getByRole('button', { name: 'Odaya gir' }).click()
  await guest.page.getByText('Bu ad odada var, başka bir ad yaz.').waitFor({ timeout: 15000 })
  check(true, 'aynı ad (büyük harfle) reddedildi')
  await shot(guest, '06-ayni-ad')

  // 4) Kopma ve geri gelme
  const ceren = players[2]
  await ceren.context.setOffline(true)
  await ceren.page.getByText('Bağlantı yeniden kuruluyor').waitFor({ timeout: 15000 })
  check(true, 'kopunca "Bağlantı yeniden kuruluyor" görünür')
  await shot(ceren, '07-kopuk')
  // Kopukken admin Burak'ı çıkarır
  await admin.page.getByRole('button', { name: 'Burak adlı oyuncuyu çıkar' }).click()
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Çıkar' }).click()
  await waitForNames(admin.page, ['Mete', 'Ayşe', 'Ceren'])
  await players[1].page.getByText('Odadan çıktın ya da çıkarıldın').waitFor({ timeout: 15000 })
  check(true, 'çıkarılan oyuncu katılma ekranına döner')
  const t1 = Date.now()
  await ceren.context.setOffline(false)
  await waitForNames(ceren.page, ['Mete', 'Ayşe', 'Ceren'], 20000)
  check(true, 'bağlantı dönünce liste kendiliğinden düzeldi', `${Date.now() - t1} ms`)
  await ceren.page.getByText('Bağlantı yeniden kuruluyor').waitFor({ state: 'detached', timeout: 20000 })
  check(true, 'gösterge kayboldu')
  await ceren.page.reload()
  await ceren.page.getByRole('heading', { name: /Katılanlar/ }).waitFor({ timeout: 20000 })
  const me = await ceren.page.locator('li', { hasText: '(sen)' }).innerText()
  check(me.includes('Ceren'), 'yenileyince aynı yerine döndü')

  // 5) Silme
  await admin.page.getByRole('button', { name: 'Odayı sil' }).click()
  await admin.page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click()
  await admin.page.getByText('Oda silindi').waitFor()
  await players[0].page.getByText('Bu oda artık yok').waitFor({ timeout: 15000 })
  await ceren.page.getByText('Bu oda artık yok').waitFor({ timeout: 15000 })
  check(true, 'admin sildi; diğerleri "Bu oda artık yok" görür')
  await shot(players[0], '08-oda-yok')
} catch (e) {
  failures++
  console.log(`FAIL senaryo durdu: ${e instanceof Error ? e.message : e}`)
} finally {
  console.log('\nFonksiyon çağrıları (bağlam başına):')
  for (const [label, counts] of calls) console.log(`  ${label}: ${JSON.stringify(counts)}`)
  await browser.close()
}

console.log(failures === 0 ? '\nHepsi geçti.' : `\n${failures} denetim başarısız.`)
process.exit(failures === 0 ? 0 : 1)
