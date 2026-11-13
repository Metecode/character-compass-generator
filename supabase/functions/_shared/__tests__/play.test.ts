// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cleanHints,
  compareGuesses,
  cleanPlayerName,
  deviceHash,
  gameStats,
  guessStatusResponse,
  isDeviceId,
  nameKey,
  publicGame,
  ranking,
  scoreGuess,
  shuffled,
  validateAnswers,
  type GuessRow,
  type StoredCell,
  type StoredGame,
} from '../play.ts'

const cell = (name: string, bullets = ['Bir madde'], photo_id: string | null = null): StoredCell => ({
  name,
  bullets,
  photo_id,
})
const empty = (): StoredCell => ({ name: '', bullets: [], photo_id: null })

// 2x2: üç oynanabilir hücre + bir boş hücre
const cells: StoredCell[] = [cell('Işıl', ['Gece kuşu'], 'p1'), cell('İlker', ['Kaos ajanı']), empty(), cell('Ali')]

const game: StoredGame = {
  title: 'Test',
  grid_size: 2,
  regions: [{ color: '#FFADAD' }, { color: '#A0C4FF' }, { color: '#CAFFBF' }, { color: '#FDFFB6' }],
  cells,
}

describe('nameKey (Türkçe)', () => {
  it('İ/i ve I/ı eşleşir, I ile i karışmaz', () => {
    expect(nameKey('İLKER')).toBe(nameKey('ilker'))
    expect(nameKey('IŞIL')).toBe(nameKey('ışıl'))
    expect(nameKey('Işıl')).not.toBe(nameKey('işil'))
  })
  it('boşluk farklarını yok sayar', () => {
    expect(nameKey('  Ayşe   Nur ')).toBe('ayşe nur')
  })
})

describe('scoreGuess', () => {
  it('doğru 1, ipuçlu doğru yarım puan, yanlış 0; boş hücre sayılmaz', () => {
    const answers = ['IŞIL', 'Ali', null, 'İlker'] // Işıl doğru (büyük harf), diğer ikisi yer değiştirmiş
    const s = scoreGuess(cells, answers, new Set())
    expect(s.total).toBe(3)
    expect(s.points2).toBe(2)
    expect(s.cells[2]).toBeNull()
    expect(s.cells[0]).toMatchObject({ name: 'Işıl', correct: true, hinted: false })
    expect(s.cells[1]).toMatchObject({ name: 'İlker', guess: 'Ali', correct: false })
  })

  it('ipucu açılan hücre doğruysa yarım puan', () => {
    const s = scoreGuess(cells, ['ışıl', 'ilker', null, 'ali'], new Set([0]))
    expect(s.points2).toBe(1 + 2 + 2) // 2,5 puan
  })

  it('İ/ı ayrımı: "Isil" (noktasız I, s) "Işıl" sayılmaz', () => {
    const s = scoreGuess(cells, ['Isil', 'İlker', null, 'Ali'], new Set())
    expect(s.cells[0]!.correct).toBe(false)
  })

  it('aynı adı taşıyan iki kişi birbirinin yerine sayılır', () => {
    const twins = [cell('Mert', ['A']), cell('Mert', ['B']), cell('Ece'), cell('Can')]
    const s = scoreGuess(twins, ['mert', 'MERT', 'Ece', 'Can'], new Set())
    expect(s.points2).toBe(8)
  })
})

describe('validateAnswers', () => {
  it('geçerli cevabı kabul eder; boş hücrede null olmalı', () => {
    expect(validateAnswers(['Ali', 'Işıl', null, 'İlker'], cells)).toEqual({
      ok: true,
      value: ['Ali', 'Işıl', null, 'İlker'],
    })
    expect(validateAnswers(['Ali', 'Işıl', 'İlker', 'İlker'], cells).ok).toBe(false)
  })

  it('listede olmayan isim, eksik cevap, yanlış uzunluk reddedilir', () => {
    expect(validateAnswers(['Ali', 'Işıl', null, 'Zeynep'], cells).ok).toBe(false)
    expect(validateAnswers(['Ali', null, null, 'İlker'], cells).ok).toBe(false)
    expect(validateAnswers(['Ali', 'Işıl', null], cells).ok).toBe(false)
    expect(validateAnswers('Ali', cells).ok).toBe(false)
  })

  it('bir isim listede geçtiğinden fazla kullanılamaz; aynı isimli iki kişide iki kez kullanılabilir', () => {
    expect(validateAnswers(['Ali', 'Ali', null, 'İlker'], cells).ok).toBe(false)
    const twins = [cell('Mert'), cell('Mert'), cell('Ece'), cell('Can')]
    expect(validateAnswers(['mert', 'Mert', 'Can', 'Ece'], twins).ok).toBe(true)
    expect(validateAnswers(['Mert', 'Mert', 'Mert', 'Ece'], twins).ok).toBe(false)
  })

  it('Türkçe büyük/küçük harf farkı kabul edilir', () => {
    expect(validateAnswers(['ALİ', 'IŞIL', null, 'ilker'], cells).ok).toBe(true)
  })
})

describe('cleanPlayerName', () => {
  it('baştaki/sondaki boşluğu atar', () => {
    expect(cleanPlayerName('  Deniz  ')).toEqual({ ok: true, value: 'Deniz' })
  })
  it('boş, yalnızca boşluk, 20 karakteri aşan, kontrol karakterli ad reddedilir', () => {
    expect(cleanPlayerName('').ok).toBe(false)
    expect(cleanPlayerName('    ').ok).toBe(false)
    expect(cleanPlayerName('a'.repeat(21)).ok).toBe(false)
    expect(cleanPlayerName('Ali\nVeli').ok).toBe(false)
    expect(cleanPlayerName(42).ok).toBe(false)
  })
  it('20 karakter (emoji tek sayılır) kabul edilir', () => {
    expect(cleanPlayerName('ğ'.repeat(20)).ok).toBe(true)
    expect(cleanPlayerName('😀'.repeat(20)).ok).toBe(true)
  })
})

describe('publicGame (kopya önleme)', () => {
  const pub = publicGame(game, new Set([0]))
  it('hücrelerde isim, foto kimliği ya da yol yok', () => {
    const json = JSON.stringify(pub.cells)
    expect(json).not.toContain('Işıl')
    expect(json).not.toContain('p1')
    expect(pub.cells.every((c) => Object.keys(c).sort().join() === 'bullets,hint,playable')).toBe(true)
    expect(JSON.stringify(pub)).not.toMatch(/photo|path|p1/)
  })
  it('ipucu yalnızca bulanık dosyası olan oynanabilir hücrede', () => {
    expect(pub.cells.map((c) => c.hint)).toEqual([true, false, false, false])
    expect(pub.cells.map((c) => c.playable)).toEqual([true, true, false, true])
  })
  it('isim listesi oynanabilir hücrelerin isimleri, sırası hücre sırasından bağımsız', () => {
    expect([...pub.names].sort()).toEqual(['Ali', 'Işıl', 'İlker'].sort())
    // Sabit "rastgele" ile bile sıra hücre sırasına eşit değil.
    const reversed = publicGame(game, new Set(), () => 0)
    expect(reversed.names).not.toEqual(['Işıl', 'İlker', 'Ali'])
    // Birçok karıştırmada her isim her konumda görülür.
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(publicGame(game, new Set()).names[0]!)
    expect(seen.size).toBe(3)
  })
})

describe('shuffled', () => {
  it('elemanları korur', () => {
    expect([...shuffled([1, 2, 3, 4, 5])].sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('cihaz kimliği', () => {
  it('biçim: base64url, 22-64 karakter', () => {
    expect(isDeviceId('a'.repeat(22))).toBe(true)
    expect(isDeviceId('abc')).toBe(false)
    expect(isDeviceId('a'.repeat(22) + '!')).toBe(false)
    expect(isDeviceId(null)).toBe(false)
  })
  it('özet oyuna bağlı: aynı cihaz farklı oyunlarda farklı özet', async () => {
    const d = 'x'.repeat(32)
    expect(await deviceHash('KOD1aaaaaaaa', d)).not.toBe(await deviceHash('KOD2aaaaaaaa', d))
    expect(await deviceHash('KOD1aaaaaaaa', d)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('tekil cihaz ve oyun sınırı (submit_guess sonucu)', () => {
  it('ok → 201, ikinci deneme → 409 already_played, dolu → 409 game_full, yok → 404', () => {
    expect(guessStatusResponse('ok')).toEqual({ status: 201 })
    expect(guessStatusResponse('duplicate')).toEqual({ status: 409, error: 'already_played' })
    expect(guessStatusResponse('full')).toEqual({ status: 409, error: 'game_full' })
    expect(guessStatusResponse('not_found')).toEqual({ status: 404, error: 'not_found' })
    expect(() => guessStatusResponse('weird')).toThrow()
  })
})

describe('cleanHints', () => {
  it('yalnızca oynanabilir ve aralıktaki hücreler, tekrarsız', () => {
    expect(cleanHints([3, 0, 0, 2, 9, -1], cells)).toEqual([0, 3])
  })
})

const row = (
  name: string,
  points2: number,
  at: string,
  duration: number | null = null,
  device = name,
): GuessRow => ({
  id: name,
  device_hash: device,
  player_name: name,
  answers: [],
  hints: [],
  points2,
  duration_seconds: duration,
  created_at: at,
})

describe('ranking (skor, süre, gönderim zamanı)', () => {
  it('puan azalan; eşitlikte süre artan; o da eşitse önce gönderen', () => {
    const r = ranking(
      [
        row('Yavaş', 8, '2026-11-13T10:01:00Z', 300),
        row('Hızlı', 8, '2026-11-13T10:09:00Z', 95),
        row('Lider', 10, '2026-11-13T10:20:00Z', 900),
        row('İkiz2', 6, '2026-11-13T10:07:00Z', 60),
        row('İkiz1', 6, '2026-11-13T10:03:00Z', 60),
      ],
      'Hızlı',
    )
    expect(r.map((e) => [e.rank, e.name, e.durationSeconds, e.me])).toEqual([
      [1, 'Lider', 900, false],
      [2, 'Hızlı', 95, true],
      [3, 'Yavaş', 300, false],
      // Aynı puan ve aynı süre: önce gönderen önde, sırayı paylaşırlar.
      [4, 'İkiz1', 60, false],
      [4, 'İkiz2', 60, false],
    ])
  })

  it('başlangıcı olmayan (süresi boş) tahmin kabul edilir ve eşitlikte en alta düşer', () => {
    const r = ranking(
      [
        row('Eski', 8, '2026-11-13T09:00:00Z', null),
        row('Süreli', 8, '2026-11-13T10:00:00Z', 400),
        row('Az puan', 6, '2026-11-13T08:00:00Z', 10),
      ],
      null,
    )
    expect(r.map((e) => [e.rank, e.name, e.durationSeconds])).toEqual([
      [1, 'Süreli', 400],
      [2, 'Eski', null],
      [3, 'Az puan', 10],
    ])
  })

  it('iki süresiz tahmin: önce gönderen önde', () => {
    const r = ranking([row('B', 4, '2026-11-13T10:02:00Z'), row('A', 4, '2026-11-13T10:01:00Z')], null)
    expect(r.map((e) => [e.rank, e.name])).toEqual([
      [1, 'A'],
      [1, 'B'],
    ])
  })

  it('compareGuesses sunucu sorgusuyla aynı düzende', () => {
    const rows = [row('c', 4, '2026-11-13T10:00:00Z', null), row('b', 4, '2026-11-13T10:00:00Z', 50), row('a', 6, '2026-11-13T11:00:00Z')]
    expect([...rows].sort(compareGuesses).map((x) => x.player_name)).toEqual(['a', 'b', 'c'])
  })
})

describe('başlangıç kaydı (migration)', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../../../migrations/20261115000100_solve_time.sql', import.meta.url)),
    'utf8',
  )
  it('yalnızca ilk seferde yazılır: çakışmada hiçbir şey yapılmaz, started_at güncellenmez', () => {
    const fn = sql.slice(sql.indexOf('create function public.start_guess'), sql.indexOf('create or replace function'))
    expect(fn).toMatch(/on conflict \(game_code, device_hash\) do nothing/)
    expect(fn).not.toMatch(/update\s/i)
    expect(fn).not.toMatch(/do update/i)
  })
  it('oyunla birlikte silinir (cascade) ve yalnızca service_role erişir', () => {
    expect(sql).toMatch(/guess_starts \([\s\S]*references public\.games \(code\) on delete cascade/)
    expect(sql).toMatch(/revoke all on table public\.guess_starts from public, anon, authenticated/)
    expect(sql).toMatch(/alter table public\.guess_starts enable row level security/)
  })
  it('süre sunucu saatiyle hesaplanır; başlangıç yoksa boş kalır', () => {
    expect(sql).toMatch(/v_duration := greatest\(0, floor\(extract\(epoch from \(now\(\) - v_started\)\)\)::integer\)/)
    expect(sql).toMatch(/if v_started is not null then/)
    expect(sql).toMatch(/add column duration_seconds integer/)
  })
})

describe('gameStats', () => {
  it('en kolay tanınan ve kimsenin bilemediği', () => {
    const g = [{ answers: ['Işıl', 'Ali', null, 'İlker'] }, { answers: ['IŞIL', 'İlker', null, 'Ali'] }]
    const s = gameStats(cells, g)
    expect(s.players).toBe(2)
    expect(s.people).toEqual([
      { name: 'Işıl', correct: 2 },
      { name: 'İlker', correct: 1 },
      { name: 'Ali', correct: 1 },
    ])
    expect(s.easiest).toEqual(['Işıl'])
    expect(s.nobody).toEqual([])
  })
  it('kimse oynamadıysa listeler boş; kimsenin bilmediği kişi listelenir', () => {
    expect(gameStats(cells, [])).toMatchObject({ players: 0, easiest: [], nobody: [] })
    const s = gameStats(cells, [{ answers: ['Işıl', 'Ali', null, 'İlker'] }])
    expect(s.nobody).toEqual(['İlker', 'Ali'])
  })
})
