// Canlı oda yerleşim ölçümü: sahte veriyle, sunucuya hiç dokunmadan.
//
//   pnpm build
//   pnpm room:layout                  # vite preview'ı kendisi açar (4319)
//   ONLY=desktop pnpm room:layout     # yalnızca masaüstü ekranları
//   OUT=klasör pnpm room:layout       # varsayılan: .shots/room-layout
//   BASE_URL=http://localhost:5173 pnpm room:layout   # çalışan bir sunucuya karşı
//
// 3, 6 ve 16 oyunculu odalarda her aşama (lobi, yazma, yazma + klavye, açılış
// tahmin / seçildi / açıldı / admin, sonuç) şu ekranlarda çekilir: 360×640,
// 390×844, 430×932, 375×667 (mobil); 1280×720, 1440×900, 1920×1080 (masaüstü). Supabase uç noktaları Playwright'ta yakalanıp
// sahte MemberView döner; Realtime soketi taklit edilir. Site dışına giden her
// istek engellenir ve rapora yazılır (0 olmalı).
//
// Ölçülen (sabit çerçeveli aşamalarda): sayfa ve ana içerik dikey taşması (0
// olmalı), alt eylem alanının görünür alanda olması, kartın kendi içinde
// taşmaması, en küçük aday düğmesi (≥44 px), yatay taşma. Sonuçta (kayabilir)
// kazanan, pusula ve düğmelerin ilk ekranda olması. Sonuç ekranında ayrıca
// PNG indirilip 1080×1080 olduğu doğrulanır (2×2, 3×3, 4×4).
//
// Masaüstü: başlık ile içerik aynı genişlikte mi (sol/sağ kenar); açılışta iki
// sütunun (sol: kart + panel, sağ: pusula) üst ve alt kenarları aynı pikselde mi;
// tahmin adımındaki "?" yer tutucusu ile açılınca gelen fotoğraf aynı kutuda mı.
//
// Klavye: Playwright gerçek klavye açamaz; visualViewport yüksekliği ekranın
// ~%42'si kadar küçültülerek taklit edilir. iOS Safari'de gerçek cihaz testi gerekir.

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'

const OUT = resolve(process.env.OUT ?? '.shots/room-layout')
const PORT = 4319
let BASE = (process.env.BASE_URL ?? '').replace(/\/+$/, '')
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { id: '360x640', width: 360, height: 640, mobile: true },
  { id: '390x844', width: 390, height: 844, mobile: true },
  { id: '430x932', width: 430, height: 932, mobile: true },
  // Ek: "3 madde ve foto 667 px yükseklikte de sığsın" şartı için.
  { id: '375x667', width: 375, height: 667, mobile: true },
  { id: '1280x720', width: 1280, height: 720, mobile: false },
  { id: '1440x900', width: 1440, height: 900, mobile: false },
  { id: '1920x1080', width: 1920, height: 1080, mobile: false },
]
const COUNTS = [3, 6, 16]
const ONLY = process.env.ONLY ?? ''
const CODE = 'LAYOUTCHECK0001'

// ---------- sahte veri ----------

const NAMES = [
  'Mete', 'Zeynep Su', 'Ahmet Can', 'Elif', 'Kaan', 'Defne Nur', 'Barış', 'Selin',
  'Oğuzhan', 'İrem', 'Mustafa Kemal', 'Ece', 'Çağrı', 'Gülşah Yıldırım', 'Tolga', 'Şebnem',
]
const ITEMS = [
  'Toplantıya hep beş dakika geç kalır',
  'Grubun gayriresmi DJ’i, kimse sormadan',
  'Herkesin doğum gününü ezbere bilir',
  'Kahvesiz konuşulmaz, sabahları hiç',
  'Her tatilde bir şeyini mutlaka unutur',
  'Mesajlara üç gün sonra “aa gördüm” der',
]

const photo = (i) => {
  const hue = (i * 47) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${hue} 70% 72%)"/><circle cx="200" cy="165" r="80" fill="hsl(${hue} 55% 38%)"/><rect x="80" y="265" width="240" height="160" rx="80" fill="hsl(${hue} 55% 38%)"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const gridOf = (n) => (n <= 4 ? 2 : n <= 9 ? 3 : 4)

function room(n, { phase, meIndex = 1, adminIndex = 0 }) {
  const mode = n === 3 ? 'quick' : 'classic'
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    name: NAMES[i],
    photo: photo(i),
    isAdmin: i === adminIndex,
    online: i !== n - 1,
  }))
  return {
    view: 'member',
    phase,
    version: 1,
    serverNow: Date.now(),
    channel: 'room-layoutcheck',
    me: { id: players[meIndex].id, isAdmin: meIndex === adminIndex },
    settings: {
      mode,
      writeSeconds: 180,
      allowProfanity: false,
      minPlayers: mode === 'quick' ? 3 : 4,
      maxPlayers: 16,
    },
    creatorName: players[adminIndex].name,
    expiresAt: new Date(Date.now() + 7200_000).toISOString(),
    guessing: true,
    players,
  }
}

const itemsFor = (i, count = 3) =>
  Array.from({ length: count }, (_, k) => ({ key: k, text: ITEMS[(i + k) % ITEMS.length] }))

function writingView(n, opts = {}) {
  const v = room(n, { phase: 'writing', ...opts })
  const me = Number(v.me.id.slice(1)) - 1
  const quick = v.settings.mode === 'quick'
  const targets = quick ? [(me + 1) % n] : [1, 2, 3].map((d) => (me + d) % n)
  v.writing = {
    endsAt: Date.now() + 150_000,
    readyCount: Math.floor(n / 2),
    total: n,
    meReady: false,
    assignments: targets.map((t, k) => ({
      targetId: `p${t + 1}`,
      texts: quick ? [ITEMS[0], '', ''] : [k === 0 ? ITEMS[1] : ''],
    })),
  }
  return v
}

function revealView(n, { step, picked = false, admin = false, many = true }) {
  const v = room(n, { phase: 'reveal', meIndex: admin ? 0 : 1 })
  const position = Math.min(n - 2, Math.floor(n / 2))
  const shown = step === 'shown'
  const opened = Array.from({ length: shown ? position + 1 : position }, (_, i) => ({
    cell: i,
    playerId: `p${i + 1}`,
    items: itemsFor(i),
  }))
  const scores = v.players
    .map((p, i) => ({ playerId: p.id, score: Math.max(0, position - (i % 4)) }))
    .sort((a, b) => b.score - a.score)
  const target = `p${position + 1}`
  // Kalabalıkta bilenler çok olsun (yatay satırı zorlar).
  const correct = v.players.filter((_, i) => i !== position && (many ? i % 3 !== 2 : i < 2)).map((p) => p.id)
  v.reveal = {
    gridSize: gridOf(n),
    position,
    total: n,
    step,
    cellGuessing: true,
    cell: position,
    items: itemsFor(position),
    candidates: shown ? [] : v.players.slice(position).map((p) => p.id),
    canGuess: true,
    myGuess: picked || shown ? (shown ? target : `p${n}`) : null,
    opened,
    scores,
    ...(admin ? { guessed: Math.floor(n / 2), eligible: n - 1 } : {}),
    ...(shown ? { target, correct } : {}),
  }
  return v
}

function doneView(n, opts = {}) {
  const v = room(n, { phase: 'done', ...opts })
  v.result = {
    gridSize: gridOf(n),
    cells: v.players.map((p, i) => ({ cell: i, playerId: p.id, items: itemsFor(i) })),
    scores: v.players.map((p, i) => ({ playerId: p.id, score: n - i })),
    deletesAt: Date.now() + 1500_000,
  }
  return v
}

const SCENARIOS = [
  { id: 'lobi-admin', phase: 'lobby', make: (n) => room(n, { phase: 'lobby', meIndex: 0 }) },
  { id: 'lobi-oyuncu', phase: 'lobby', make: (n) => room(n, { phase: 'lobby', meIndex: 1 }) },
  { id: 'yazma', phase: 'writing', make: (n) => writingView(n) },
  { id: 'yazma-klavye', phase: 'writing', make: (n) => writingView(n), keyboard: true },
  { id: 'acilis-tahmin', phase: 'reveal', make: (n) => revealView(n, { step: 'guess' }) },
  { id: 'acilis-secildi', phase: 'reveal', make: (n) => revealView(n, { step: 'guess', picked: true }) },
  { id: 'acilis-acildi', phase: 'reveal', make: (n) => revealView(n, { step: 'shown' }) },
  { id: 'acilis-admin', phase: 'reveal', make: (n) => revealView(n, { step: 'guess', admin: true }) },
  { id: 'sonuc', phase: 'done', make: (n) => doneView(n, { meIndex: 0 }) },
]

// ---------- sunucu ----------

let preview = null
if (!BASE) {
  BASE = `http://localhost:${PORT}`
  preview = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    shell: true,
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {
      // daha açılmadı
    }
    await new Promise((r) => setTimeout(r, 500))
  }
}
const stopPreview = () => {
  if (!preview) return
  if (process.platform === 'win32') spawn('taskkill', ['/pid', String(preview.pid), '/t', '/f'], { stdio: 'ignore' })
  else preview.kill()
}

// ---------- ölçüm ----------

const KEYBOARD_INIT = () => {
  // visualViewport'u sarar: window.__setKb(px) klavye yüksekliği kadar küçültür.
  const real = window.visualViewport
  if (!real) return
  const fake = new EventTarget()
  let kb = 0
  for (const k of ['width', 'offsetLeft', 'pageLeft', 'pageTop']) Object.defineProperty(fake, k, { get: () => real[k] })
  Object.defineProperty(fake, 'height', { get: () => real.height - kb })
  Object.defineProperty(fake, 'offsetTop', { get: () => 0 })
  Object.defineProperty(fake, 'scale', { get: () => 1 })
  real.addEventListener('resize', () => fake.dispatchEvent(new Event('resize')))
  Object.defineProperty(window, 'visualViewport', { get: () => fake, configurable: true })
  window.__setKb = (px) => {
    kb = px
    fake.dispatchEvent(new Event('resize'))
  }
}

function measure() {
  const vv = window.visualViewport
  const visibleH = vv ? vv.height : window.innerHeight
  const de = document.documentElement
  const q = (s) => document.querySelector(s)
  const frame = q('[data-room-frame]')
  const content = q('[data-room-content]')
  const footer = q('[data-room-footer]')
  const card = q('[data-room-card]')
  const pageScroll = q('[data-page-scroll]')
  const cands = [...document.querySelectorAll('[data-candidate]')].map((b) => b.getBoundingClientRect())
  const r = (el) => (el ? el.getBoundingClientRect() : null)
  const f = r(footer)
  const out = {
    mode: frame?.dataset.roomFrame ?? 'yok',
    pageOverflow: Math.max(0, de.scrollHeight - de.clientHeight, document.body.scrollHeight - de.clientHeight),
    contentOverflow: content ? Math.max(0, content.scrollHeight - content.clientHeight) : null,
    frameBottom: frame ? Math.round(r(frame).bottom) : null,
    footerVisible: f ? f.bottom <= visibleH + 1 && f.top >= 0 : null,
    cardOverflow: card ? Math.max(0, card.scrollHeight - card.clientHeight) : null,
    cardVisible: card ? r(card).bottom <= visibleH + 1 : null,
    minCandidate: cands.length ? Math.round(Math.min(...cands.map((c) => Math.min(c.width, c.height)))) : null,
    hOverflow: Math.max(0, de.scrollWidth - de.clientWidth),
    badge: [...document.querySelectorAll('[role=status]')].some((el) => /yeniden kuruluyor/.test(el.textContent ?? '')),
    visibleH: Math.round(visibleH),
    focusVisible: null,
  }
  const active = document.activeElement
  if (active instanceof HTMLInputElement) {
    const a = active.getBoundingClientRect()
    const scroller = active.closest('[data-room-scroll]')
    const s = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: visibleH }
    out.focusVisible = a.top >= Math.max(0, s.top) - 1 && a.bottom <= Math.min(visibleH, s.bottom) + 1
  }
  const ri = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }
  }
  const head = ri(q('[data-room-header-inner]'))
  const inner = ri(q('[data-room-inner]'))
  out.align = head && inner ? Math.max(Math.abs(head.left - inner.left), Math.abs(head.right - inner.right)) : null
  out.innerWidth = inner ? inner.right - inner.left : null
  const left = q('[data-reveal-left]')
  const boardBox = q('[data-reveal-board]')
  if (left && boardBox) {
    // Görünen kenarlar: kartın üstü, panelin altı; pusulanın kendisi (ölçeklenmiş kutu).
    const l = { top: ri(left.firstElementChild).top, bottom: ri(left.lastElementChild).bottom }
    const visible = boardBox.querySelector('.shadow-brutal-lg') ?? boardBox
    const b = ri(visible)
    out.columns = { leftTop: l.top, leftBottom: l.bottom, boardTop: b.top, boardBottom: b.bottom, edge: b.bottom - b.top, boardWidth: b.right - b.left }
  }
  const slot = ri(q('[data-photo-slot]'))
  out.slot = slot
  if (out.mode === 'scroll') {
    const bottomOf = (s) => (q(s) ? Math.round(r(q(s)).bottom) : null)
    out.winnerBottom = bottomOf('[data-room-winner]')
    out.boardBottom = bottomOf('[data-room-board]')
    out.buttonsBottom = bottomOf('[data-room-buttons]')
    out.firstScreen =
      out.buttonsBottom !== null &&
      out.buttonsBottom <= window.innerHeight &&
      (out.boardBottom ?? 0) <= window.innerHeight &&
      (out.winnerBottom ?? 0) <= window.innerHeight
    out.pageScrollable = pageScroll ? pageScroll.scrollHeight - pageScroll.clientHeight : 0
  }
  return out
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const rows = []
const external = []
let failures = 0
const pngs = []
const smokeRows = []

try {
  for (const n of COUNTS) {
    mkdirSync(join(OUT, `${n}p`), { recursive: true })
    for (const sc of SCENARIOS) {
      for (const vp of VIEWPORTS) {
        if (sc.keyboard && !vp.mobile) continue
        if (ONLY === 'desktop' && vp.mobile) continue
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.mobile,
          hasTouch: vp.mobile,
          deviceScaleFactor: vp.mobile ? 2 : 1,
          reducedMotion: 'reduce',
          acceptDownloads: true,
        })
        const view = sc.make(n)
        await ctx.addInitScript(
          ([key, val]) => localStorage.setItem(key, val),
          [
            'compass-rooms',
            JSON.stringify({
              state: { rooms: [{ code: CODE, session: 'sahte-oturum', playerId: view.me.id, savedAt: Date.now() }] },
              version: 1,
            }),
          ],
        )
        await ctx.addInitScript(KEYBOARD_INIT)
        const page = await ctx.newPage()
        page.on('pageerror', (e) => {
          failures++
          console.log(`HATA (${n}p ${sc.id} ${vp.id}): ${e.message}`)
        })
        await page.route(/^https?:\/\//, (route) => {
          const url = route.request().url()
          if (url.startsWith(BASE)) return route.continue()
          if (/\/functions\/v1\/get-room-state/.test(url)) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...view, serverNow: Date.now() }) })
          }
          if (/\/functions\/v1\//.test(url)) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
          }
          external.push(url)
          return route.abort()
        })
        await page.routeWebSocket(/\/realtime\/v1\//, (ws) => {
          ws.onMessage((raw) => {
            let m
            try {
              m = JSON.parse(String(raw))
            } catch {
              return
            }
            if (Array.isArray(m)) {
              const [joinRef, ref, topic] = m
              ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]))
            } else if (m && typeof m === 'object') {
              ws.send(JSON.stringify({ topic: m.topic, event: 'phx_reply', ref: m.ref, payload: { status: 'ok', response: {} } }))
            }
          })
        })

        await page.goto(`${BASE}/r/${CODE}`)
        await page.waitForSelector('[data-room-frame]', { timeout: 15000 })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForFunction(() => [...document.images].every((i) => i.complete))
        if (sc.keyboard) {
          await page.locator('input.field').first().focus()
          await page.evaluate((h) => window.__setKb(Math.round(h * 0.42)), vp.height)
        }
        if (sc.id === 'lobi-admin' && vp.mobile && n === 6 && vp.id === '390x844') {
          // QR tam ekran görüntüsü (bir kez).
          await page.getByRole('button', { name: 'QR göster' }).click()
          await page.waitForSelector('[data-qr-fullscreen]')
          await page.screenshot({ path: join(OUT, `${n}p`, `lobi-qr-${vp.id}.png`) })
          await page.locator('[data-qr-fullscreen]').click({ position: { x: 10, y: 10 } })
          await page.waitForSelector('[data-qr-fullscreen]', { state: 'detached' })
        }
        await page.waitForTimeout(250)
        const m = await page.evaluate(measure)
        const shot = join(OUT, `${n}p`, `${sc.id}-${vp.id}.png`)
        await page.screenshot({ path: shot })

        if (sc.id === 'acilis-tahmin' && vp.id === '390x844') {
          await page.locator('[data-candidate]').first().click()
          await page.waitForSelector('[data-guess-summary]')
          await page.screenshot({ path: join(OUT, `${n}p`, `acilis-sec-sonra-${vp.id}.png`) })
        }
        if (sc.id === 'acilis-tahmin' && vp.mobile && vp.id === '390x844') {
          await page.getByRole('button', { name: 'Pusulayı gör' }).click()
          await page.waitForSelector('[role=dialog]')
          await page.waitForTimeout(200)
          await page.screenshot({ path: join(OUT, `${n}p`, `acilis-pusula-${vp.id}.png`) })
        }
        if (sc.id === 'sonuc' && vp.id === '1440x900') {
          const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.getByRole('button', { name: 'PNG indir' }).click()])
          const file = join(OUT, `${n}p`, `sonuc-${gridOf(n)}x${gridOf(n)}.png`)
          await dl.saveAs(file)
          const dims = await page.evaluate(async (url) => {
            const img = new Image()
            img.src = url
            await img.decode()
            return [img.naturalWidth, img.naturalHeight]
          }, `data:image/png;base64,${(await import('node:fs')).readFileSync(file).toString('base64')}`)
          const ok = dims[0] === 1080 && dims[1] === 1080
          if (!ok) failures++
          pngs.push({ grid: `${gridOf(n)}×${gridOf(n)}`, file, dims, ok })
        }

        const fixed = m.mode === 'fixed'
        const problems = []
        if (fixed) {
          if (m.pageOverflow > 1) problems.push(`sayfa +${m.pageOverflow}px`)
          if ((m.contentOverflow ?? 0) > 1) problems.push(`içerik +${m.contentOverflow}px`)
          if (m.footerVisible === false) problems.push('alt alan görünmüyor')
          if ((m.cardOverflow ?? 0) > 1) problems.push(`kart +${m.cardOverflow}px`)
          if (m.cardVisible === false) problems.push('kart kesik')
          if (sc.keyboard && m.focusVisible !== true) problems.push('odaktaki alan görünmüyor')
        } else if (!m.firstScreen) problems.push('düğmeler ilk ekranda değil')
        if (m.minCandidate !== null && m.minCandidate < 44) problems.push(`aday ${m.minCandidate}px`)
        if (m.hOverflow > 1) problems.push(`yatay +${m.hOverflow}px`)
        if (m.mode === 'yok') problems.push('çerçeve yok')
        if (!vp.mobile && m.align !== null && m.align > 1) problems.push(`başlık hizası ${m.align}px`)
        if (m.columns) {
          const dt = Math.abs(m.columns.leftTop - m.columns.boardTop)
          const db = Math.abs(m.columns.leftBottom - m.columns.boardBottom)
          if (dt > 1) problems.push(`sütun üstü Δ${dt}px`)
          if (db > 1) problems.push(`sütun altı Δ${db}px`)
          if (Math.abs(m.columns.edge - m.columns.boardWidth) > 1) problems.push('pusula kare değil')
        }
        if (problems.length) failures++
        rows.push({ n, sc: sc.id, phase: sc.phase, vp: vp.id, mobile: vp.mobile, m, problems, shot })
        console.log(`${problems.length ? 'FAIL' : 'OK  '} ${n}p ${sc.id.padEnd(15)} ${vp.id.padEnd(8)} ${problems.join(', ')}`)
        await ctx.close()
      }
    }
  }

  // Duman testi: "Diğer" menüsündeki eylemler onay ister (6 oyuncu, 390×844, admin).
  const smoke = [
    { view: room(6, { phase: 'lobby', meIndex: 0 }), item: 'Odayı sil', title: 'Oda silinsin mi?' },
    { view: room(6, { phase: 'lobby', meIndex: 0 }), item: 'Odadan çık', title: 'Odadan çıkılsın mı?' },
    { view: writingView(6, { meIndex: 0 }), item: 'Yazmayı bitir', title: 'Yazma bitirilsin mi?', text: 'Herkes için yazma süresi biter' },
    { view: revealView(6, { step: 'guess', admin: true }), item: 'Odayı sil', title: 'Oda silinsin mi?' },
  ]
  for (const t of smoke) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    await ctx.addInitScript(
      ([key, val]) => localStorage.setItem(key, val),
      ['compass-rooms', JSON.stringify({ state: { rooms: [{ code: CODE, session: 's', playerId: t.view.me.id, savedAt: Date.now() }] }, version: 1 })],
    )
    const page = await ctx.newPage()
    await page.route(/^https?:\/\//, (route) => {
      const url = route.request().url()
      if (url.startsWith(BASE)) return route.continue()
      if (/get-room-state/.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(t.view) })
      if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      external.push(url)
      return route.abort()
    })
    await page.routeWebSocket(/\/realtime\/v1\//, () => {})
    await page.goto(`${BASE}/r/${CODE}`)
    await page.getByRole('button', { name: 'Diğer' }).click()
    await page.getByRole('button', { name: new RegExp(`^${t.item}`) }).click()
    const dialog = page.getByRole('dialog', { name: t.title })
    let ok = await dialog.isVisible().catch(() => false)
    if (ok && t.text) ok = (await dialog.textContent()).includes(t.text)
    if (!ok) failures++
    smokeRows.push(`- ${t.view.phase} · Diğer → ${t.item}: ${ok ? 'onay penceresi açıldı' : 'HATALI'}`)
    console.log(`${ok ? 'OK  ' : 'FAIL'} duman: ${t.view.phase} Diğer → ${t.item}`)
    await ctx.close()
  }
} finally {
  await browser.close()
  stopPreview()
}

// ---------- rapor ----------

// "?" yer tutucusu ile açılınca gelen fotoğraf aynı kutuda mı (masaüstü).
const jumps = []
for (const n of COUNTS) {
  for (const vp of VIEWPORTS.filter((v) => !v.mobile)) {
    const a = rows.find((r) => r.n === n && r.vp === vp.id && r.sc === 'acilis-tahmin')?.m.slot
    const b = rows.find((r) => r.n === n && r.vp === vp.id && r.sc === 'acilis-acildi')?.m.slot
    if (!a || !b) continue
    const d = Math.max(...['top', 'bottom', 'left', 'right'].map((k) => Math.abs(a[k] - b[k])))
    if (d > 1) failures++
    jumps.push({ n, vp: vp.id, a, b, d })
  }
}

const cell = (v) => (v === null || v === undefined ? '–' : typeof v === 'boolean' ? (v ? 'evet' : 'HAYIR') : String(v))
const lines = [
  '# Canlı oda yerleşim ölçümü',
  '',
  `Tarih: ${new Date().toISOString()} · Sahte veri, sunucuya istek yok (site dışı istek: ${external.length}).`,
  '',
  'Sütunlar: sayfa ve içerik = dikey taşma (px, 0 olmalı); alt alan = sabit eylem alanı görünür alanda mı;',
  'kart = açılış kartının kendi içindeki taşma (px); aday = en küçük aday düğmesi (px, ≥44);',
  'Odak = klavye açıkken odaktaki alan görünür mü. 375×667 istenen dört ekrana ek (667 px şartı).',
  'Sonuç ekranı kayabilir: orada "ilk ekran" = kazanan, pusula ve düğmeler kaydırmadan görünüyor mu.',
  '',
  '| Oyuncu | Aşama | Ekran | Çerçeve | Sayfa | İçerik | Alt alan | Kart | Aday | Odak | İlk ekran | Sonuç |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map(
    ({ n, sc, vp, m, problems }) =>
      `| ${n} | ${sc} | ${vp}${sc.includes('klavye') ? ` (görünür ${m.visibleH})` : ''} | ${m.mode === 'fixed' ? 'sabit' : m.mode === 'scroll' ? 'kayar' : m.mode} | ${cell(m.pageOverflow)} | ${cell(m.contentOverflow)} | ${cell(m.footerVisible)} | ${cell(m.cardOverflow)} | ${cell(m.minCandidate)} | ${sc.includes('klavye') ? cell(m.focusVisible) : '–'} | ${m.mode === 'scroll' ? cell(m.firstScreen) : '–'} | ${problems.length ? problems.join(', ') : 'OK'} |`,
  ),
  '',
  '## Masaüstü hizası',
  '',
  'Açılışta iki sütun: sol = kartın üstü / panelin altı, sağ = pusulanın kendisi (px, görünür alana göre).',
  'Hiza = başlıktaki logo/Diğer kutusu ile içeriğin sol-sağ kenar farkı (px). İçerik = içerik genişliği (px).',
  '',
  '| Oyuncu | Aşama | Ekran | İçerik | Hiza | Sol üst | Pusula üst | Δ üst | Sol alt | Pusula alt | Δ alt | Pusula kenarı |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows
    .filter((r) => !r.mobile)
    .map(({ n, sc, vp, m }) => {
      const c = m.columns
      return c
        ? `| ${n} | ${sc} | ${vp} | ${cell(m.innerWidth)} | ${cell(m.align)} | ${c.leftTop} | ${c.boardTop} | ${Math.abs(c.leftTop - c.boardTop)} | ${c.leftBottom} | ${c.boardBottom} | ${Math.abs(c.leftBottom - c.boardBottom)} | ${c.edge}×${c.boardWidth} |`
        : `| ${n} | ${sc} | ${vp} | ${cell(m.innerWidth)} | ${cell(m.align)} | – | – | – | – | – | – | – |`
    }),
  '',
  '### Yer tutucu → fotoğraf (zıplama)',
  '',
  ...jumps.map(
    (j) =>
      `- ${j.n} oyuncu, ${j.vp}: "?" ${j.a.right - j.a.left}×${j.a.bottom - j.a.top} @ (${j.a.left}, ${j.a.top}) → foto ${j.b.right - j.b.left}×${j.b.bottom - j.b.top} @ (${j.b.left}, ${j.b.top}) · fark ${j.d}px ${j.d > 1 ? 'HATALI' : 'OK'}`,
  ),
  '',
  '## Diğer menüsü (onaylar)',
  '',
  ...smokeRows,
  '',
  '## PNG',
  '',
  ...pngs.map((p) => `- ${p.grid}: ${p.dims.join('×')} ${p.ok ? 'OK' : 'HATALI'} — \`${p.file}\``),
  '',
  `Site dışı istekler: ${external.length ? external.join(', ') : 'yok'}`,
  '',
]
writeFileSync(join(OUT, 'rapor.md'), lines.join('\n'))
console.log(`\nRapor: ${join(OUT, 'rapor.md')}`)
console.log(`Site dışı istek: ${external.length}`)
console.log(failures ? `${failures} sorun` : 'Hepsi geçti')
process.exitCode = failures ? 1 : 0
