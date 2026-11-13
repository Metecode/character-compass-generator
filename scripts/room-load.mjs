// Canlı oda: 16 oyunculu lobide fonksiyon çağrısı ölçümü (elle çalıştırılır).
//
//   pnpm dev                        # ayrı terminalde
//   MINUTES=3 node scripts/room-load.mjs
//
// Oda ve oyuncular API ile kurulur (hızlı); her oyuncunun oturumu kendi tarayıcı
// bağlamının localStorage'ına yazılıp /r/{code} açılır. MINUTES dakika boyunca
// get-room-state çağrıları sayılır (nabız + sinyaller), sonra oda silinir.

import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const BASE = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/+$/, '')
const MINUTES = Number(process.env.MINUTES ?? 3)
const PLAYERS = 16

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL.replace(/\/+$/, '')
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY

function fakeJpeg() {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...sos, 0, 0, 0, 0, 0xff, 0xd9])
}
async function call(fn, body) {
  const isForm = body instanceof FormData
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: PK, Origin: 'http://localhost:5173', ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
    body: isForm ? body : JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const form = (data) => {
  const f = new FormData()
  f.append('data', JSON.stringify(data))
  f.append('photo', new Blob([fakeJpeg()], { type: 'image/jpeg' }), 'p.jpg')
  return f
}

const created = await call('create-room', form({ mode: 'classic', name: 'Oyuncu 1' }))
if (created.status !== 201) throw new Error(`create-room ${created.status}`)
const code = created.json.code
const sessions = [{ session: created.json.session, playerId: created.json.playerId }]

const browser = await chromium.launch({ channel: 'chrome' })
const counts = []
const pages = []
const open = async (s, i) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    ['compass-rooms', JSON.stringify({ state: { rooms: [{ code, ...s, savedAt: Date.now() }] }, version: 1 })],
  )
  const page = await context.newPage()
  counts[i] = 0
  page.on('request', (r) => {
    if (r.url().includes('/functions/v1/get-room-state')) counts[i]++
  })
  await page.goto(`${BASE}/r/${code}`)
  await page.getByRole('heading', { name: /Katılanlar/ }).waitFor({ timeout: 30000 })
  pages.push(page)
}

await open(sessions[0], 0)
const joinStart = Date.now()
for (let i = 2; i <= PLAYERS; i++) {
  const r = await call('join-room', form({ code, name: `Oyuncu ${i}` }))
  if (r.status !== 201) throw new Error(`join ${i}: ${r.status} ${JSON.stringify(r.json)}`)
  const s = { session: r.json.session, playerId: r.json.playerId }
  sessions.push(s)
  await open(s, i - 1)
}
console.log(`${PLAYERS} oyuncu katıldı (${Math.round((Date.now() - joinStart) / 1000)} sn)`)
const joinCalls = counts.reduce((a, b) => a + b, 0)

// Boşta lobi: yalnızca nabız
const before = counts.reduce((a, b) => a + b, 0)
const t0 = Date.now()
await new Promise((r) => setTimeout(r, MINUTES * 60_000))
const idle = counts.reduce((a, b) => a + b, 0) - before
const minutes = (Date.now() - t0) / 60_000

// Tek bir değişiklik (çıkarma) kaç çağrı doğurur?
const beforeKick = counts.reduce((a, b) => a + b, 0)
await call('room-admin', { code, session: sessions[0].session, action: 'kick', playerId: sessions[PLAYERS - 1].playerId })
await new Promise((r) => setTimeout(r, 4000))
const perSignal = counts.reduce((a, b) => a + b, 0) - beforeKick

await call('room-admin', { code, session: sessions[0].session, action: 'delete' })
await browser.close()

console.log(`katılma sırasında get-room-state: ${joinCalls}`)
console.log(`boşta: ${idle} çağrı / ${minutes.toFixed(1)} dk → oyuncu başına dakikada ${(idle / minutes / PLAYERS).toFixed(2)}`)
console.log(`bir sinyal (kick) sonrası 4 sn içinde: ${perSignal} get-room-state`)
