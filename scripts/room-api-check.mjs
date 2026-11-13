// Canlı oda: API ve güvenlik denetimi (canlı Supabase'e karşı, elle çalıştırılır).
//
//   node scripts/room-api-check.mjs
//
// .env.local'dan VITE_SUPABASE_URL ve VITE_SUPABASE_PUBLISHABLE_KEY okunur (ekrana basılmaz).
// Oda kurar, oyuncu katar, kanalı dinler, eylemleri ve yetkileri dener; sonunda odayı siler.
// Denetlenenler:
//   - publishable anahtarla oda tablolarına, SQL fonksiyonlarına ve kovaya erişilemiyor
//   - kanalı dinleyen biri yalnızca içi boş sinyal görüyor
//   - katılmamış ziyaretçiye ad/foto/kanal dönmüyor; üyenin yanıtında oturum/yazar/yol yok
//   - aynı ad, yetkisiz kick, beyaz liste dışı eylem reddediliyor; admin devri ve silme çalışıyor
// Not: rate_limits'e join-room / room-preview / create-room satırları düşer;
// temizlik komutu docs/supabase.md'de.

import { RealtimeClient } from '@supabase/realtime-js'
import { readFileSync } from 'node:fs'

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

/** create-room / join-room için en küçük geçerli 400×400 JPEG yapısı. */
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
    headers: { apikey: PK, Origin: ORIGIN, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
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

const form = (data) => {
  const f = new FormData()
  f.append('data', JSON.stringify(data))
  f.append('photo', new Blob([fakeJpeg()], { type: 'image/jpeg' }), 'p.jpg')
  return f
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------

console.log('== Doğrudan erişim (publishable anahtar)')
for (const t of ['rooms', 'room_players', 'room_items', 'room_guesses']) {
  const res = await fetch(`${URL_}/rest/v1/${t}?select=*`, { headers: { apikey: PK } })
  const text = await res.text()
  check(res.status >= 400 && !text.includes('session_hash'), `tablo ${t} kapalı`, String(res.status))
}
for (const fn of [
  'room_join',
  'room_remove_player',
  'room_handover_admin',
  'room_start',
  'room_save_items',
  'room_end_writing',
  'room_finish_writing',
  'room_enter_reveal',
]) {
  const res = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: PK, 'Content-Type': 'application/json' },
    body: '{}',
  })
  check(res.status >= 400, `rpc ${fn} kapalı`, String(res.status))
}
{
  const res = await fetch(`${URL_}/storage/v1/object/list/room-photos`, {
    method: 'POST',
    headers: { apikey: PK, Authorization: `Bearer ${PK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '' }),
  })
  const text = await res.text()
  check(res.status >= 400 || text === '[]', 'kova listesi boş/kapalı', `${res.status} ${text.slice(0, 40)}`)
}

console.log('== Oda kurma')
const created = await call('create-room', form({ mode: 'classic', writeSeconds: 120, name: 'Test Admin' }))
check(created.status === 201 && typeof created.json?.session === 'string', 'create-room 201', String(created.status))
const code = created.json.code
const admin = { session: created.json.session, id: created.json.playerId }

const bad = await call('create-room', form({ mode: 'yayinci', name: 'X' }))
check(bad.status === 400 && bad.json?.error === 'invalid_mode', 'geçersiz mod 400', JSON.stringify(bad.json))

console.log('== Katılmamış ziyaretçi')
const outsider = await call('get-room-state', { code })
check(outsider.status === 200, 'outsider 200')
check(
  JSON.stringify(Object.keys(outsider.json).sort()) ===
    JSON.stringify(['closedReason', 'creatorName', 'joinable', 'maxPlayers', 'players', 'sessionValid', 'view']),
  'outsider yalnızca izinli alanlar',
  Object.keys(outsider.json).join(','),
)
check(!/room-|sign|Test Admin/.test(JSON.stringify(outsider.json).replace('"creatorName":"Test Admin"', '')), 'outsider yanıtında ad/foto/kanal yok')
const missing = await call('get-room-state', { code: 'Zz' + code.slice(2) })
check(missing.status === 404, 'olmayan oda 404')

console.log('== Kanal dinleme')
const adminState = await call('get-room-state', { code, session: admin.session })
check(adminState.json?.me?.isAdmin === true, 'kurucu admin')
const topic = adminState.json.channel
const received = []
const rt = new RealtimeClient(`${URL_}/realtime/v1`, { params: { apikey: PK } })
const channel = rt.channel(topic, { config: { broadcast: { self: false } } })
channel.on('broadcast', { event: '*' }, (msg) => received.push(msg))
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('subscribe timeout')), 10000)
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      clearTimeout(t)
      resolve()
    }
  })
})
check(true, 'kanala abone olundu')

console.log('== Katılma')
const players = []
for (const name of ['Ayşe', 'Burak', 'Ceren']) {
  const r = await call('join-room', form({ code, name }))
  check(r.status === 201, `join ${name}`, String(r.status))
  players.push({ name, session: r.json.session, id: r.json.playerId })
}
const dup = await call('join-room', form({ code, name: 'AYŞE' }))
check(dup.status === 409 && dup.json?.error === 'name_taken', 'aynı ad (tr büyük harf) reddedilir', JSON.stringify(dup.json))

await sleep(1500)
check(received.length >= 3, 'katılma sinyalleri geldi', String(received.length))
check(
  received.every((m) => m.event === 'changed' && JSON.stringify(m.payload ?? {}) === '{}'),
  'sinyaller içi boş',
  JSON.stringify(received.slice(0, 2)),
)

console.log('== Üye görünümü')
const bState = await call('get-room-state', { code, session: players[1].session })
const text = JSON.stringify(bState.json)
check(bState.json?.players?.length === 4, 'lobi 4 oyuncu')
check(!/session|author|photo_path|seq|last_seen|target/.test(text), 'üye yanıtında oturum/yazar/yol yok')
check(!text.includes(admin.session) && !text.includes(players[0].session), 'başkasının oturum anahtarı yok')

console.log('== Yetki ve beyaz liste')
const notAdmin = await call('room-admin', { code, session: players[0].session, action: 'kick', playerId: players[2].id })
check(notAdmin.status === 403 && notAdmin.json?.error === 'not_admin', 'admin olmayan kick 403')
const badAction = await call('room-action', { code, session: players[0].session, action: 'start' })
check(badAction.status === 400 && badAction.json?.error === 'invalid_action', 'beyaz liste dışı eylem 400')
const selfKick = await call('room-admin', { code, session: admin.session, action: 'kick', playerId: admin.id })
check(selfKick.status === 403, 'admin kendini çıkaramaz')

const kick = await call('room-admin', { code, session: admin.session, action: 'kick', playerId: players[2].id })
check(kick.status === 200, 'admin kick 200')
const kicked = await call('get-room-state', { code, session: players[2].session })
check(kicked.json?.view === 'outsider' && kicked.json?.sessionValid === false, 'çıkarılan oyuncu dışarıda, oturumu geçersiz')

console.log('== Çıkış ve admin devri')
const adminLeave = await call('room-action', { code, session: admin.session, action: 'leave' })
check(adminLeave.status === 200, 'admin lobiden çıktı')
const aState = await call('get-room-state', { code, session: players[0].session })
check(aState.json?.me?.isAdmin === true, 'admin en eski oyuncuya (Ayşe) geçti')

console.log('== Silme')
const del = await call('room-admin', { code, session: players[0].session, action: 'delete' })
check(del.status === 200, 'admin odayı sildi')
const after = await call('get-room-state', { code, session: players[0].session })
check(after.status === 404, 'silinen oda 404')

console.log('== Son oyuncu çıkınca oda silinir')
const solo = await call('create-room', form({ mode: 'quick', name: 'Yalnız' }))
const soloLeave = await call('room-action', { code: solo.json.code, session: solo.json.session, action: 'leave' })
check(soloLeave.status === 200, 'tek oyuncu çıktı')
check((await call('get-room-state', { code: solo.json.code })).status === 404, 'boş oda silindi')

await sleep(500)
check(
  received.every((m) => JSON.stringify(m.payload ?? {}) === '{}'),
  `dinleyici toplam ${received.length} sinyal aldı, hepsi boş`,
)
await rt.removeAllChannels()
rt.disconnect()

console.log(failures === 0 ? '\nHepsi geçti.' : `\n${failures} denetim başarısız.`)
process.exit(failures === 0 ? 0 : 1)
