// Canlı oda / C: açılış, tahmin, gizleme, skor ve BITTI — API ve güvenlik denetimi
// (canlı Supabase'e karşı, tarayıcısız, elle çalıştırılır).
//
//   node scripts/room-reveal-check.mjs
//
// 5 oyunculu Klasik oda kurar, herkes maddelerini yazıp hazır olur (aşama hemen AÇILIŞ'a geçer).
// Denetlenenler:
//   - yanıtlarda yazar kimliği, madde kimliği, açılmamış hücrenin sahibi yok
//   - hücreye yazan tahmin edemez (403); hedef ve diğerleri edebilir; tahmin değiştirilebilir
//   - admin "x/y" sayısını görür, oyuncu görmez; başkasının tahmini kimseye dönmez
//   - oyuncu açamaz/gizleyemez (403); eski `position` 409 stale; açılmış kişi tahmin edilemez
//   - gizlenen madde hem o an hem sonuçta görünmez
//   - puanlar sunucuda; son hücreden sonra BITTI, silinme en geç 30 dk sonra
// Sonunda oda silinir. rate_limits temizliği docs/supabase.md'de.

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

function fakeJpeg() {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x90, 0x01, 0x90, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, ...sos, 0, 0, 0, 0, 0xff, 0xd9])
}

const calls = {}
async function call(fn, body) {
  calls[fn] = (calls[fn] ?? 0) + 1
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

const names = ['Admin', 'Ayşe', 'Burak', 'Ceren', 'Deniz']
const p = [] // { name, session, id }
let code = null

/** API ile oda kurar, herkes yazıp hazır olur (aşama AÇILIŞ'a geçer). Döner: oyuncular. */
async function quickRoom(mode, n) {
  const out = []
  const c = await call('create-room', form({ mode, writeSeconds: 120, name: 'Admin' }))
  const roomCode = c.json.code
  out.push({ session: c.json.session, id: c.json.playerId })
  for (let i = 1; i < n; i++) {
    const j = await call('join-room', form({ code: roomCode, name: `Oyuncu ${i}` }))
    out.push({ session: j.json.session, id: j.json.playerId })
  }
  const g = (pl) => call('get-room-state', { code: roomCode, session: pl.session })
  const lobby = await g(out[0])
  await call('room-admin', { code: roomCode, session: out[0].session, action: 'start' })
  for (const pl of out) {
    const s = await g(pl)
    const items = s.json.writing.assignments.flatMap((a, k) =>
      a.texts.map((_, slot) => ({ target: a.targetId, slot, text: `madde ${k}-${slot}` })),
    )
    await call('room-action', { code: roomCode, session: pl.session, action: 'save-items', items, ready: true })
  }
  return { code: roomCode, players: out, lobby: lobby.json, get: g }
}

const state = (pl) => call('get-room-state', { code, session: pl.session })
const act = (pl, action, extra = {}) => call('room-action', { code, session: pl.session, action, ...extra })
const adm = (pl, action, extra = {}) => call('room-admin', { code, session: pl.session, action, ...extra })

try {
  console.log('== Kurulum')
  const created = await call('create-room', form({ mode: 'classic', writeSeconds: 120, name: names[0] }))
  check(created.status === 201 || created.status === 200, 'oda kuruldu', String(created.status))
  code = created.json.code
  p.push({ name: names[0], session: created.json.session, id: created.json.playerId })
  for (const n of names.slice(1)) {
    const j = await call('join-room', form({ code, name: n }))
    check(j.status === 201 || j.status === 200, `${n} katıldı`, String(j.status))
    p.push({ name: n, session: j.json.session, id: j.json.playerId })
  }
  const [admin, ...others] = p
  const st = await adm(admin, 'start')
  check(st.status === 200, 'başlatıldı', String(st.status))

  console.log('== Yazma (herkes hazır → açılış)')
  const authorOf = new Map() // hedef → yazarlar (test tarafında bilinir, sunucudan değil)
  for (const pl of p) {
    const s = await state(pl)
    const items = s.json.writing.assignments.map((a, k) => {
      if (!authorOf.has(a.targetId)) authorOf.set(a.targetId, new Set())
      authorOf.get(a.targetId).add(pl.id)
      return { target: a.targetId, slot: 0, text: `${pl.name} yazdı ${k + 1}` }
    })
    const r = await act(pl, 'save-items', { items, ready: true })
    check(r.status === 200, `${pl.name} yazdı ve hazır`, String(r.status))
  }

  let s0 = await state(others[0])
  check(s0.json.phase === 'reveal' && s0.json.reveal?.step === 'guess', 'herkes hazır olunca AÇILIŞ, tahmin adımı', s0.json.phase)
  const r0 = s0.json.reveal
  check(r0.total === 5 && r0.position === 0 && r0.gridSize === 3, '5 hücre, 3×3, ilk sıra', `${r0.total} ${r0.gridSize}`)
  check(r0.items.length === 3 && r0.items.every((it) => Object.keys(it).sort().join() === 'key,text'), 'maddeler yalnızca key + metin')
  const raw = JSON.stringify(s0.json)
  check(!/author|cell_index|ring_pos|session_hash|"id":\d/.test(raw), 'yanıtta yazar, halka, oturum ya da madde kimliği yok')
  check(r0.target === undefined && r0.guessed === undefined, 'tahmin adımında sahip ve sayı yok (oyuncu)')
  check(r0.candidates.length === 5, 'adaylar: herkes')

  // Hücrenin sahibini bulmak için: kimin canGuess=false olduğuna bakılır, sahibi yazarlarından çıkarılır.
  const views = await Promise.all(p.map((pl) => state(pl)))
  const blocked = p.filter((pl, i) => !views[i].json.reveal.canGuess).map((pl) => pl.id)
  const targetId = [...authorOf.entries()].find(([, a]) => blocked.length === a.size && blocked.every((x) => a.has(x)))?.[0]
  check(blocked.length === 3 && targetId, 'Klasik: 3 yazar tahmin edemez', String(blocked.length))
  const author = p.find((pl) => pl.id === blocked[0])
  const guessers = p.filter((pl) => !blocked.includes(pl.id))

  console.log('== Tahmin')
  const bad = await act(author, 'guess', { position: 0, playerId: targetId })
  check(bad.status === 403 && bad.json?.error === 'not_allowed', 'yazar tahmin edemez → 403', String(bad.status))
  const wrongPick = p.find((pl) => pl.id !== targetId).id
  const g1 = await act(guessers[0], 'guess', { position: 0, playerId: wrongPick })
  check(g1.status === 200, 'tahmin kaydedildi', String(g1.status))
  const g1b = await act(guessers[0], 'guess', { position: 0, playerId: targetId })
  check(g1b.status === 200, 'tahmin değiştirildi', String(g1b.status))
  const stale = await act(guessers[1], 'guess', { position: 1, playerId: targetId })
  check(stale.status === 409 && stale.json?.error === 'stale', 'yanlış sıra → 409 stale', String(stale.status))
  const g2 = await act(guessers[1], 'guess', { position: 0, playerId: wrongPick })
  check(g2.status === 200, 'ikinci oyuncu tahmin etti')

  const asAdmin = (await state(admin)).json.reveal
  check(asAdmin.guessed === 2 && asAdmin.eligible === 2, 'admin "2/2 tahmin etti" görür', `${asAdmin.guessed}/${asAdmin.eligible}`)
  const g1view = (await state(guessers[0])).json.reveal
  check(g1view.myGuess === targetId && g1view.guessed === undefined, 'oyuncu yalnızca kendi tahminini görür')

  console.log('== Yetki')
  const nr = await adm(others[0], 'reveal', { position: 0 })
  check(nr.status === 403, 'oyuncu açamaz → 403', String(nr.status))
  const nh = await adm(others[0], 'hide', { cell: r0.cell, key: r0.items[0].key })
  check(nh.status === 403, 'oyuncu gizleyemez → 403', String(nh.status))
  const nx = await adm(admin, 'next', { position: 0 })
  check(nx.status === 409, 'tahmin adımında "sıradaki" → 409', String(nx.status))
  const badAction = await act(others[0], 'reveal', { position: 0 })
  check(badAction.status === 400, 'oyuncu eylemlerinde reveal yok → 400', String(badAction.status))

  console.log('== Gizleme')
  const hiddenText = r0.items[0].text
  const hid = await adm(admin, 'hide', { cell: r0.cell, key: r0.items[0].key })
  check(hid.status === 200, 'admin maddeyi gizledi', String(hid.status))
  const afterHide = (await state(others[1])).json.reveal
  check(afterHide.items.length === 2 && !afterHide.items.some((it) => it.key === r0.items[0].key), 'gizlenen madde o an görünmez')
  const hid2 = await adm(admin, 'hide', { cell: r0.cell, key: r0.items[0].key })
  check(hid2.status === 404, 'aynı madde ikinci kez → 404', String(hid2.status))
  const future = await adm(admin, 'hide', { cell: 15, key: 0 })
  check(future.status === 404, 'açılmamış/boş hücrede gizleme yok → 404', String(future.status))

  console.log('== Açma')
  const op = await adm(admin, 'reveal', { position: 0 })
  check(op.status === 200, 'admin açtı', String(op.status))
  const op2 = await adm(admin, 'reveal', { position: 0 })
  check(op2.status === 409, 'çift dokunma → 409 stale', String(op2.status))
  const shown = (await state(others[2])).json.reveal
  check(shown.step === 'shown' && shown.target === targetId, 'gösterme adımında sahibi herkese döner')
  check(JSON.stringify(shown.correct) === JSON.stringify([guessers[0].id]), 'doğru bilen listesi', JSON.stringify(shown.correct))
  check(shown.scores.find((x) => x.playerId === guessers[0].id)?.score === 1, 'bilen 1 puan aldı')
  check(shown.opened.length === 1 && shown.opened[0].playerId === targetId, 'hücre açıldı')
  const lateGuess = await act(guessers[1], 'guess', { position: 0, playerId: targetId })
  check(lateGuess.status === 409, 'açıldıktan sonra tahmin → 409', String(lateGuess.status))

  console.log('== Sıradaki hücreler')
  const n1 = await adm(admin, 'next', { position: 0 })
  check(n1.status === 200, 'sıradaki', String(n1.status))
  const r1 = (await state(guessers[0])).json.reveal
  check(r1.position === 1 && r1.step === 'guess' && !r1.candidates.includes(targetId), 'açılan kişi adaylardan düştü')
  const views1 = await Promise.all(p.map((pl) => state(pl)))
  const free1 = p.find((pl, i) => views1[i].json.reveal.canGuess)
  const opened = await act(free1, 'guess', { position: 1, playerId: targetId })
  check(opened.status === 400 && opened.json?.error === 'invalid_guess', 'açılmış kişi tahmin edilemez → 400', `${opened.status} ${opened.json?.error}`)
  for (let pos = 1; pos < 4; pos++) {
    const a = await adm(admin, 'reveal', { position: pos })
    const n = await adm(admin, 'next', { position: pos })
    if (a.status !== 200 || n.status !== 200) check(false, `hücre ${pos + 1}`, `${a.status} ${n.status}`)
  }

  console.log('== Son hücre')
  const lastView = (await state(admin)).json.reveal
  check(lastView.position === 4 && lastView.step === 'shown' && lastView.cellGuessing === false, 'son hücre doğrudan açık (tahmin adımı yok)', `${lastView.position} ${lastView.step}`)
  check(lastView.correct === undefined && lastView.guessed === undefined && lastView.candidates.length === 0, 'son hücrede bilen/sayı/aday yok')
  const lastGuess = await act(free1, 'guess', { position: 4, playerId: lastView.target })
  check(lastGuess.status === 409, 'son hücrede tahmin → 409', String(lastGuess.status))
  const lastNext = await adm(admin, 'next', { position: 4 })
  check(lastNext.status === 200 && lastNext.json?.done === true, 'son hücreden sonra BITTI', String(lastNext.status))

  console.log('== BITTI')
  const done = await state(others[3])
  check(done.json.phase === 'done' && done.json.result?.cells.length === 5, 'BITTI: 5 hücreli sonuç')
  const left = done.json.result.deletesAt - done.json.serverNow
  check(left > 29 * 60_000 && left <= 30 * 60_000 + 5000, 'oda ~30 dakika sonra silinir', `${Math.round(left / 60000)} dk`)
  check(!JSON.stringify(done.json).includes(hiddenText), 'gizlenen metin sonuç yanıtında hiç yok')
  const targetCell = done.json.result.cells.find((c) => c.playerId === targetId)
  check(targetCell.items.length === 2, 'gizlenen madde sonuç pusulasında da yok')
  check(!/author|ring_pos|session/.test(JSON.stringify(done.json)), 'sonuçta da yazarlık yok')
  const sum = done.json.result.scores.reduce((a, s) => a + s.score, 0)
  check(sum >= 1, 'skor tablosu dolu', JSON.stringify(done.json.result.scores.map((s) => s.score)))
  const hideDone = await adm(admin, 'hide', { cell: targetCell.cell, key: targetCell.items[0].key })
  check(hideDone.status === 200, 'BITTI\'de de gizlenebilir', String(hideDone.status))

  console.log('== Klasik + 4 oyuncu: tahminsiz')
  {
    const r4 = await quickRoom('classic', 4)
    try {
      check(r4.lobby.guessing === false, 'lobide "tahmin yok" önizlemesi (guessing=false)')
      const v = (await r4.get(r4.players[1])).json
      check(v.phase === 'reveal' && v.guessing === false, 'açılışta guessing=false')
      const rv = v.reveal
      check(rv.step === 'guess' && rv.cellGuessing === false && rv.items.length === 0 && rv.candidates.length === 0, 'ilk hücre "Aç"a kadar kapalı (madde yok)')
      check(rv.scores.length === 0, 'skor yok')
      const g = await call('room-action', { code: r4.code, session: r4.players[1].session, action: 'guess', position: 0, playerId: r4.players[2].id })
      check(g.status === 409 && g.json?.error === 'no_guessing', 'tahmin → 409 no_guessing', `${g.status} ${g.json?.error}`)
      const adminS = r4.players[0].session
      const o = await call('room-admin', { code: r4.code, session: adminS, action: 'reveal', position: 0 })
      check(o.status === 200, 'admin "Aç" ile ilk hücreyi açtı')
      const v0 = (await r4.get(r4.players[1])).json.reveal
      check(v0.step === 'shown' && v0.items.length === 3 && v0.correct === undefined, 'açılınca maddeler ve sahibi; bilen yok')
      const n0 = await call('room-admin', { code: r4.code, session: adminS, action: 'next', position: 0 })
      const v1 = (await r4.get(r4.players[1])).json.reveal
      check(n0.status === 200 && v1.position === 1 && v1.step === 'shown', '"Aç" sonraki hücreyi doğrudan açar')
      for (let pos = 1; pos < 4; pos++) await call('room-admin', { code: r4.code, session: adminS, action: 'next', position: pos })
      const d = (await r4.get(r4.players[2])).json
      check(d.phase === 'done' && d.result.scores.length === 0 && d.result.cells.length === 4, 'BITTI: 4 hücre, skor tablosu yok')
    } finally {
      await call('room-admin', { code: r4.code, session: r4.players[0].session, action: 'delete' })
    }
  }

  console.log('== Klasik + 5 ve Hızlı + 3: tahminli')
  check(s0.json.guessing === true, 'Klasik 5: guessing=true (yukarıdaki oyun)')
  {
    const r3 = await quickRoom('quick', 3)
    try {
      check(r3.lobby.guessing === true, 'Hızlı 3: lobide tahminli')
      const views3 = await Promise.all(r3.players.map((pl) => r3.get(pl)))
      const rv = views3[0].json.reveal
      check(views3[0].json.guessing === true && rv.cellGuessing === true && rv.items.length === 3, 'Hızlı 3: ilk hücrede tahmin adımı, 3 madde')
      check(views3.filter((v) => v.json.reveal.canGuess).length === 2, 'Hızlı 3: hücre başına 2 kişi tahmin edebilir')
      check(rv.eligible === 2 || rv.eligible === undefined, 'admin sayısı 2 (admin yazarsa yine 2)', String(rv.eligible))
      const adminS = r3.players[0].session
      await call('room-admin', { code: r3.code, session: adminS, action: 'reveal', position: 0 })
      await call('room-admin', { code: r3.code, session: adminS, action: 'next', position: 0 })
      const p1 = (await r3.get(r3.players[0])).json.reveal
      check(p1.position === 1 && p1.step === 'guess' && p1.cellGuessing, 'Hızlı 3: ikinci hücre tahminli')
      await call('room-admin', { code: r3.code, session: adminS, action: 'reveal', position: 1 })
      await call('room-admin', { code: r3.code, session: adminS, action: 'next', position: 1 })
      const p2 = (await r3.get(r3.players[0])).json.reveal
      check(p2.position === 2 && p2.step === 'shown' && !p2.cellGuessing, 'Hızlı 3: son hücre doğrudan açık')
    } finally {
      await call('room-admin', { code: r3.code, session: r3.players[0].session, action: 'delete' })
    }
  }
} finally {
  if (code && p[0]) {
    const d = await adm(p[0], 'delete')
    console.log(`oda silindi: ${d.status}`)
    const gone = await call('get-room-state', { code, session: p[1]?.session })
    check(gone.status === 404, 'silinen oda → 404', String(gone.status))
  }
  const total = Object.values(calls).reduce((a, b) => a + b, 0)
  console.log(`\nFonksiyon çağrıları (betik): ${JSON.stringify(calls)} · toplam ${total}`)
}

console.log(failures === 0 ? '\nHepsi geçti.' : `\n${failures} denetim başarısız.`)
process.exit(failures === 0 ? 0 : 1)
