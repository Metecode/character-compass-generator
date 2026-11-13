// Tahmin oyunu (Aşama 2-3): canlı Supabase'e karşı uçtan uca duman testi.
//
//   node scripts/game-api-check.mjs
//
// Ortak hız limiti kodu (_shared/supabase.ts) değişince eski oyun fonksiyonlarının
// yeniden yayınlandıktan sonra çalıştığını doğrular: health, create-game, get-game,
// start-game, use-hint, submit-guess, game-stats, delete-game, cleanup (yetkisiz).
// .env.local'dan VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY okunur.
// Sonunda oyunu siler. rate_limits temizliği docs/supabase.md'de.

import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL.replace(/\/+$/, '')
const PK = env.VITE_SUPABASE_PUBLISHABLE_KEY
const ORIGIN = 'http://localhost:5173'

let failures = 0
const check = (ok, label, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` — ${extra}` : ''}`)
}

function fakeJpeg() {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...sos, 0, 0, 0, 0, 0xff, 0xd9])
}

async function call(fn, body, headers = {}) {
  const isForm = body instanceof FormData
  const res = await fetch(`${URL_}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { apikey: PK, Origin: ORIGIN, ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...headers },
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

const device = randomBytes(24).toString('base64url')

const h = await fetch(`${URL_}/functions/v1/health`, { headers: { Origin: ORIGIN } })
check(h.status === 204, 'health', String(h.status))

const names = ['Ayşe', 'Burak', 'Cem', 'Deniz']
const payload = {
  title: 'Duman testi',
  gridSize: 2,
  duration: 1,
  creatorName: 'Test',
  regions: [{ color: '#ff0000' }, { color: '#00ff00' }, { color: '#0000ff' }, { color: '#ffff00' }],
  cells: names.map((name, i) => ({ name, bullets: [`madde ${i}`], photo: i === 0 ? 0 : null })),
}
const f = new FormData()
f.append('data', JSON.stringify(payload))
f.append('photo_0', new Blob([fakeJpeg()], { type: 'image/jpeg' }), '0.jpg')
const created = await call('create-game', f)
check(created.status === 201 && typeof created.json?.code === 'string', 'create-game', String(created.status) + ' ' + JSON.stringify(created.json?.error ?? ''))
const code = created.json?.code
const token = created.json?.delete_token

if (code) {
  const g = await call('get-game', { code, device })
  check(g.status === 200 && g.json?.status === 'open', 'get-game (open)', String(g.status))
  check(!JSON.stringify(g.json).includes('photo_path'), 'get-game yanıtında dosya yolu yok')

  const s = await call('start-game', { code, device })
  check(s.status === 200 || s.status === 204, 'start-game', String(s.status))

  const hint = await call('use-hint', { code, device, cell: 0 })
  check(hint.status < 500, 'use-hint 5xx değil (bulanık yok)', `${hint.status} ${hint.json?.error ?? ''}`)

  const sub = await call('submit-guess', { code, device, name: 'Duman', answers: names })
  check(sub.status === 201, 'submit-guess', `${sub.status} ${JSON.stringify(sub.json?.score ?? sub.json?.result?.score ?? sub.json?.error ?? '')}`)
  const again = await call('submit-guess', { code, device, name: 'Duman', answers: names })
  check(again.status === 409, 'aynı cihaz ikinci kez → 409', String(again.status))

  const st = await call('game-stats', { code, delete_token: token })
  check(st.status === 200, 'game-stats', `${st.status}`)
  const bad = await call('game-stats', { code, delete_token: 'x'.repeat(43) })
  check(bad.status === 404, 'game-stats yanlış anahtar → 404', String(bad.status))

  const del = await call('delete-game', { code, delete_token: token })
  check(del.status === 200 || del.status === 204, 'delete-game', String(del.status))
  const gone = await call('get-game', { code, device })
  check(gone.status === 404, 'silinen oyun → 404', String(gone.status))
}

const cl = await call('cleanup', {})
check(cl.status === 404, 'cleanup sırsız → 404', String(cl.status))

console.log(failures ? `\n${failures} denetim başarısız` : '\nHepsi geçti')
process.exit(failures ? 1 : 0)
