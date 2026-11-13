// Canlı oda / B: başlatma ve yazma aşaması API denetimi (canlı Supabase'e karşı, elle çalıştırılır).
//
//   pnpm room:check:write
//
// Denetlenenler:
//   - başlatma yalnızca admin ve mod alt sınırıyla; başladıktan sonra katılma/çıkarma/çıkma yok
//   - halka: herkes 3 madde yazar ve 3 madde alır, kimse kendine yazmaz
//   - taslak kaydı sinyalsiz; hazır olma sinyalli; argo süzgeci; atanmamış hedef reddedilir
//   - kimse başkasının yazdığını, halkayı ya da kimin hazır olduğunu görmez
//   - admin erken bitirince kayıt payı içinde taslak kabul edilir, sonra aşama ilerler
//   - herkes hazırsa aşama hemen ilerler
// Sonunda odalar silinir. rate_limits temizliği: docs/supabase.md.

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
const GRACE_MS = 5000

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

async function makeRoom(settings, names) {
  const created = await call('create-room', form({ ...settings, name: names[0] }))
  if (created.status !== 201) throw new Error(`create-room ${created.status}`)
  const code = created.json.code
  const players = [{ name: names[0], session: created.json.session, id: created.json.playerId }]
  for (const name of names.slice(1)) {
    const r = await call('join-room', form({ code, name }))
    if (r.status !== 201) throw new Error(`join ${name} ${r.status}`)
    players.push({ name, session: r.json.session, id: r.json.playerId })
  }
  return { code, players }
}
const state = (code, p) => call('get-room-state', { code, session: p.session })
const act = (code, p, body) => call('room-action', { code, session: p.session, ...body })
const admin = (code, p, body) => call('room-admin', { code, session: p.session, ...body })

async function listen(topic) {
  const received = []
  const rt = new RealtimeClient(`${URL_}/realtime/v1`, { params: { apikey: PK } })
  const channel = rt.channel(topic, { config: { broadcast: { self: false } } })
  channel.on('broadcast', { event: '*' }, (msg) => received.push(msg))
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('subscribe timeout')), 10000)
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        clearTimeout(t)
        resolve()
      }
    })
  })
  return { received, close: () => rt.disconnect() }
}

const rooms = []
try {
  console.log('== Klasik oda, argo kapalı: başlatma')
  const A = await makeRoom({ mode: 'classic', writeSeconds: 120, allowProfanity: false }, ['Admin', 'Ayşe', 'Burak'])
  rooms.push(A)
  const [ad, ay, bu] = A.players
  const ch = await listen((await state(A.code, ad)).json.channel)

  const few = await admin(A.code, ad, { action: 'start' })
  check(few.status === 409 && few.json?.error === 'too_few' && few.json?.needed === 1, '3 kişiyle Klasik başlamaz (1 kişi daha)', JSON.stringify(few.json))
  const r = await call('join-room', form({ code: A.code, name: 'Ceren' }))
  A.players.push({ name: 'Ceren', session: r.json.session, id: r.json.playerId })
  const ce = A.players[3]
  const notAdmin = await admin(A.code, ay, { action: 'start' })
  check(notAdmin.status === 403 && notAdmin.json?.error === 'not_admin', 'admin olmayan başlatamaz')
  const start = await admin(A.code, ad, { action: 'start' })
  check(start.status === 200, 'admin başlattı', String(start.status))
  const again = await admin(A.code, ad, { action: 'start' })
  check(again.status === 409 && again.json?.error === 'not_lobby', 'ikinci başlatma 409')

  const late = await call('join-room', form({ code: A.code, name: 'Geç' }))
  check(late.status === 409 && late.json?.error === 'closed', 'başladıktan sonra katılma kapalı')
  const kick = await admin(A.code, ad, { action: 'kick', playerId: bu.id })
  check(kick.status === 409 && kick.json?.error === 'not_lobby', 'başladıktan sonra çıkarma yok')
  const leave = await act(A.code, ay, { action: 'leave' })
  check(leave.status === 409, 'başladıktan sonra çıkma yok')

  console.log('== Halka ve görünüm')
  const states = await Promise.all(A.players.map((p) => state(A.code, p)))
  check(states.every((s) => s.json?.phase === 'writing'), 'herkes YAZMA aşamasında')
  const received = new Map()
  let ringOk = true
  for (const [i, s] of states.entries()) {
    const w = s.json.writing
    const targets = w.assignments.map((a) => a.targetId)
    if (targets.length !== 3 || new Set(targets).size !== 3 || targets.includes(A.players[i].id)) ringOk = false
    for (const a of w.assignments) received.set(a.targetId, (received.get(a.targetId) ?? 0) + a.texts.length)
  }
  check(ringOk, 'herkesin 3 farklı hedefi var, kendisi değil')
  check([...received.values()].every((n) => n === 3) && received.size === 4, 'herkes 3 madde alıyor')
  const w0 = states[0].json.writing
  const left = w0.endsAt - states[0].json.serverNow
  check(left > 110_000 && left <= 120_000, 'bitiş 2 dk sonra (sunucu saatiyle)', `${Math.round(left / 1000)} sn`)
  check(w0.readyCount === 0 && w0.total === 4 && w0.meReady === false, 'hazır 0/4')
  const leak = JSON.stringify(states.map((s) => s.json))
  check(!/ring|ready_at|author|session|seq|photo_path/.test(leak), 'yanıtlarda halka/yazar/oturum/yol yok')

  console.log('== Taslak kaydı')
  const myTarget = w0.assignments[0].targetId
  const beforeDraft = ch.received.length
  const save = await act(A.code, ad, { action: 'save-items', items: [{ target: myTarget, slot: 0, text: '  Gizli   madde X1 ' }] })
  check(save.status === 200 && save.json?.flagged?.length === 0, 'taslak kaydedildi', JSON.stringify(save.json))
  await sleep(1500)
  check(ch.received.length === beforeDraft, 'taslak kaydı sinyal göndermez')
  const mine = await state(A.code, ad)
  check(mine.json.writing.assignments[0].texts[0] === 'Gizli madde X1', 'kendi maddesi sadeleşmiş olarak döner')
  const others = await Promise.all([ay, bu, ce].map((p) => state(A.code, p)))
  check(others.every((s) => !JSON.stringify(s.json).includes('Gizli madde')), 'başkası (hedef dahil) maddeyi görmez')

  const prof = await act(A.code, ad, {
    action: 'save-items',
    items: [
      { target: w0.assignments[1].targetId, slot: 0, text: 's1kt1r git' },
      { target: w0.assignments[2].targetId, slot: 0, text: 'Çay sever' },
    ],
  })
  check(
    prof.status === 200 && prof.json.flagged.length === 1 && prof.json.flagged[0].target === w0.assignments[1].targetId,
    'argo kapalı: süzgece takılan bildirilir',
  )
  const afterProf = (await state(A.code, ad)).json.writing.assignments
  check(afterProf[1].texts[0] === '' && afterProf[2].texts[0] === 'Çay sever', 'takılan boş, diğeri kayıtlı')

  const selfTarget = await act(A.code, ad, { action: 'save-items', items: [{ target: ad.id, slot: 0, text: 'x' }] })
  check(selfTarget.status === 400 && selfTarget.json?.error === 'not_assigned', 'atanmamış hedef 400')
  const wrongSlot = await act(A.code, ad, { action: 'save-items', items: [{ target: myTarget, slot: 2, text: 'x' }] })
  check(wrongSlot.status === 400 && wrongSlot.json?.error === 'not_assigned', 'Klasik\'te 2. yuva yok')
  const long = await act(A.code, ad, { action: 'save-items', items: [{ target: myTarget, slot: 0, text: 'x'.repeat(41) }] })
  check(long.status === 400 && long.json?.error === 'item_too_long', '41 karakter 400')

  console.log('== Hazır olma')
  const beforeReady = ch.received.length
  const ready = await act(A.code, ay, { action: 'save-items', ready: true })
  check(ready.status === 200 && ready.json.advanced === false, 'Ayşe hazır')
  await sleep(1500)
  check(ch.received.length > beforeReady, 'hazır olma sinyal gönderir')
  check((await state(A.code, bu)).json.writing.readyCount === 1, 'hazır 1/4 (kim olduğu yok)')
  const unready = await act(A.code, ay, { action: 'save-items', ready: false })
  check(unready.status === 200, 'Ayşe düzenlemeye döndü')
  check((await state(A.code, ay)).json.writing.meReady === false, 'hazır değil')

  console.log('== Admin erken bitirir')
  const notAdminEnd = await admin(A.code, bu, { action: 'end-writing' })
  check(notAdminEnd.status === 403, 'admin olmayan bitiremez')
  const end = await admin(A.code, ad, { action: 'end-writing' })
  check(end.status === 200, 'admin bitirdi')
  const ended = await state(A.code, bu)
  check(ended.json.phase === 'writing' && ended.json.writing.endsAt <= ended.json.serverNow, 'süre bitti, kayıt payı bekleniyor')
  const graceTarget = ended.json.writing.assignments[0].targetId
  const graceSave = await act(A.code, bu, { action: 'save-items', items: [{ target: graceTarget, slot: 0, text: 'Son anda' }] })
  check(graceSave.status === 200, 'kayıt payında taslak kabul edilir')
  const lateReady = await act(A.code, bu, { action: 'save-items', ready: true })
  check(lateReady.status === 200 && lateReady.json.advanced === false, 'süre bittikten sonra hazır olmak aşamayı değiştirmez')
  await sleep(GRACE_MS + 1000)
  const reveal = await state(A.code, ce)
  check(reveal.json.phase === 'reveal' && reveal.json.writing === undefined, 'paydan sonraki istek aşamayı ilerletti')
  const tooLate = await act(A.code, bu, { action: 'save-items', items: [{ target: graceTarget, slot: 0, text: 'Geç' }] })
  check(tooLate.status === 409 && tooLate.json?.error === 'not_writing', 'açılışta kayıt yok')
  const lateEnd = await admin(A.code, ad, { action: 'end-writing' })
  check(lateEnd.status === 409, 'açılışta bitirme yok')

  console.log('== Hızlı oda: herkes hazır olunca hemen ilerler')
  const Q = await makeRoom({ mode: 'quick' }, ['Kurucu', 'Deniz', 'Ece'])
  rooms.push(Q)
  check((await admin(Q.code, Q.players[0], { action: 'start' })).status === 200, '3 kişiyle Hızlı başladı')
  const qs = await Promise.all(Q.players.map((p) => state(Q.code, p)))
  check(
    qs.every((s) => s.json.writing.assignments.length === 1 && s.json.writing.assignments[0].texts.length === 3),
    'Hızlı: 1 hedef, 3 madde',
  )
  const q0 = qs[0].json.writing.assignments[0].targetId
  const triple = await act(Q.code, Q.players[0], {
    action: 'save-items',
    items: [0, 1, 2].map((slot) => ({ target: q0, slot, text: `madde ${slot}` })),
  })
  check(triple.status === 200, 'üç yuva birden kaydedildi')
  await act(Q.code, Q.players[0], { action: 'save-items', ready: true })
  await act(Q.code, Q.players[1], { action: 'save-items', ready: true })
  const last = await act(Q.code, Q.players[2], { action: 'save-items', ready: true })
  check(last.json?.advanced === true, 'son kişi hazır olunca aşama ilerledi')
  check((await state(Q.code, Q.players[1])).json.phase === 'reveal', 'herkes AÇILIŞ\'ı görür')

  await sleep(800)
  check(
    ch.received.every((m) => JSON.stringify(m.payload ?? {}) === '{}'),
    `dinleyici ${ch.received.length} sinyal aldı, hepsi boş`,
  )
  ch.close()
} finally {
  for (const r of rooms) await admin(r.code, r.players[0], { action: 'delete' })
}

console.log(failures === 0 ? '\nHepsi geçti.' : `\n${failures} denetim başarısız.`)
process.exit(failures === 0 ? 0 : 1)
