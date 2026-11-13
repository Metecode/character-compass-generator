// Canlı oda / C: sonuç PNG'si 2×2, 3×3 ve 4×4 (canlı Supabase + yerel ön yüz, elle çalıştırılır).
//
//   pnpm dev                       # ayrı terminalde
//   SHOTS=klasör pnpm room:png     # PNG'ler ve sonuç ekranları klasöre yazılır
//
// Her boyut için oyun API ile oynanır (4, 6 ve 11 oyuncu; Hızlı mod, maddeler dolu),
// sonra bir oyuncunun oturumu tarayıcıya konup sonuç ekranında "PNG indir"e basılır.
// Oda sonunda silinir.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL.replace(/\/+$/, '')
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY
const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const SHOTS = process.env.SHOTS ?? null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

let failures = 0
const check = (ok, label, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`)
}

async function call(fn, body) {
  const isForm = body instanceof FormData
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: PK, Origin: 'http://localhost:5173', ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
    body: isForm ? body : JSON.stringify(body),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    // gövdesiz
  }
  return { status: res.status, json }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
// Gerçek 400×400 JPEG'leri tarayıcı üretir (renkli, oyuncu başına farklı).
const maker = await (await browser.newContext()).newPage()
await maker.goto(`${BASE}/`)
async function jpeg(i) {
  const b64 = await maker.evaluate(async (hue) => {
    const c = document.createElement('canvas')
    c.width = c.height = 400
    const x = c.getContext('2d')
    x.fillStyle = `hsl(${hue} 70% 70%)`
    x.fillRect(0, 0, 400, 400)
    x.fillStyle = `hsl(${hue} 60% 35%)`
    x.beginPath()
    x.arc(200, 170, 90, 0, Math.PI * 2)
    x.fill()
    x.fillRect(80, 290, 240, 110)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8))
    const buf = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (const b of buf) s += String.fromCharCode(b)
    return btoa(s)
  }, (i * 47) % 360)
  return Buffer.from(b64, 'base64')
}
const form = async (data, i) => {
  const f = new FormData()
  f.append('data', JSON.stringify(data))
  f.append('photo', new Blob([await jpeg(i)], { type: 'image/jpeg' }), 'p.jpg')
  return f
}

const NAMES = ['Mete', 'Ayşe', 'Burak', 'Ceren', 'Deniz', 'Emre', 'Feride', 'Gökhan', 'Hülya', 'İlker', 'Jale']
const ITEMS = ['Kahvesiz konuşmaz', 'Hep geç kalır', 'Grup sohbetinin DJ’i', 'Her şeye itiraz eder', 'Planı o yapar', 'Sessiz ama derin']

for (const n of [4, 6, 11]) {
  const grid = n <= 4 ? 2 : n <= 9 ? 3 : 4
  console.log(`== ${grid}×${grid} (${n} oyuncu)`)
  const ps = []
  let code = null
  try {
    const c = await call('create-room', await form({ mode: 'quick', writeSeconds: 120, name: NAMES[0] }, 0))
    code = c.json.code
    ps.push({ session: c.json.session, id: c.json.playerId })
    for (let i = 1; i < n; i++) {
      const j = await call('join-room', await form({ code, name: NAMES[i] }, i))
      ps.push({ session: j.json.session, id: j.json.playerId })
    }
    const st = await call('room-admin', { code, session: ps[0].session, action: 'start' })
    check(st.status === 200, 'başladı', String(st.status))
    for (const [k, p] of ps.entries()) {
      const s = await call('get-room-state', { code, session: p.session })
      const a = s.json.writing.assignments[0]
      const items = [0, 1, 2].map((slot) => ({ target: a.targetId, slot, text: ITEMS[(k + slot) % ITEMS.length] }))
      await call('room-action', { code, session: p.session, action: 'save-items', items, ready: true })
    }
    for (let pos = 0; pos < n; pos++) {
      // Herkes hücre sahibini değil, ilk adayı seçer; puanlar karışık çıkar.
      for (const p of ps.slice(1, 4)) {
        const s = await call('get-room-state', { code, session: p.session })
        const r = s.json.reveal
        if (r.canGuess) await call('room-action', { code, session: p.session, action: 'guess', position: pos, playerId: r.candidates[pos % r.candidates.length] })
      }
      await call('room-admin', { code, session: ps[0].session, action: 'reveal', position: pos })
      await call('room-admin', { code, session: ps[0].session, action: 'next', position: pos })
    }
    const done = await call('get-room-state', { code, session: ps[1].session })
    check(done.json.phase === 'done' && done.json.result.gridSize === grid, `BITTI, ızgara ${grid}`)

    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/`)
    await page.evaluate(
      ({ code, session, playerId }) =>
        localStorage.setItem(
          'compass-rooms',
          JSON.stringify({ state: { rooms: [{ code, session, playerId, savedAt: Date.now() }] }, version: 1 }),
        ),
      { code, session: ps[1].session, playerId: ps[1].id },
    )
    await page.goto(`${BASE}/r/${code}`)
    await page.getByRole('heading', { name: 'Skor tablosu' }).waitFor({ timeout: 20000 })
    if (SHOTS) await page.screenshot({ path: join(SHOTS, `png-${grid}x${grid}-ekran.png`), fullPage: true })
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      page.getByRole('button', { name: 'PNG indir' }).click(),
    ])
    const buf = readFileSync(await dl.path())
    const w = buf.readUInt32BE(16)
    const h = buf.readUInt32BE(20)
    check(w === 1080 && h === 1080, `PNG ${grid}×${grid} 1080×1080`, `${Math.round(buf.length / 1024)} KB`)
    if (SHOTS) writeFileSync(join(SHOTS, `png-${grid}x${grid}.png`), buf)
    await ctx.close()
  } finally {
    if (code) await call('room-admin', { code, session: ps[0].session, action: 'delete' })
  }
}
await browser.close()
console.log(failures === 0 ? '\nHepsi geçti.' : `\n${failures} denetim başarısız.`)
process.exit(failures === 0 ? 0 : 1)
