import { describe, expect, it } from 'vitest'
import {
  answersOf,
  classifyPlayError,
  cleanPlayerName,
  formatDuration,
  formatPoints,
  locative,
  nextOpenCell,
  place,
  preferFreeEntry,
  placedCount,
  restorePlacement,
  scoreLabel,
  unplace,
  visibleRows,
} from '../play'

describe('puan yazımı', () => {
  it('bulunma eki', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 16].map((n) => `${n}${locative(n)}`)).toEqual([
      "1'de", "2'de", "3'te", "4'te", "5'te", "6'da", "7'de", "8'de", "9'da", "10'da", "11'de", "13'te", "16'da",
    ])
  })
  it('yarım puan virgülle', () => {
    expect(formatPoints(12)).toBe('6')
    expect(formatPoints(13)).toBe('6,5')
    expect(formatPoints(1)).toBe('0,5')
    expect(scoreLabel(12, 9)).toBe("9'da 6")
    expect(scoreLabel(13, 9)).toBe("9'da 6,5")
    expect(scoreLabel(8, 4)).toBe("4'te 4")
  })
})

describe('süre yazımı', () => {
  it('sn, dk sn, sa dk', () => {
    expect(formatDuration(0)).toBe('0 sn')
    expect(formatDuration(42)).toBe('42 sn')
    expect(formatDuration(60)).toBe('1 dk')
    expect(formatDuration(102)).toBe('1 dk 42 sn')
    expect(formatDuration(3599)).toBe('59 dk 59 sn')
    expect(formatDuration(3600)).toBe('1 sa')
    expect(formatDuration(3900)).toBe('1 sa 5 dk')
    expect(formatDuration(-5)).toBe('0 sn')
  })
})

describe('sıralama satırında süre', () => {
  it('visibleRows süreyi korur', () => {
    const rows = [{ rank: 1, name: 'A', points2: 4, durationSeconds: 102, me: true }]
    expect(visibleRows(rows, false)[0]!.durationSeconds).toBe(102)
  })
})

describe('yerleştirme', () => {
  const playable = [true, true, false, true]

  it('isim bir hücreye konur; başka hücredeyse oradan taşınır', () => {
    let p = place([null, null, null, null], 0, 2)
    expect(p).toEqual([2, null, null, null])
    p = place(p, 3, 2)
    expect(p).toEqual([null, null, null, 2])
    p = place(p, 3, 1) // hücredeki isim değişir, eskisi listeye döner
    expect(p).toEqual([null, null, null, 1])
    expect(unplace(p, 3)).toEqual([null, null, null, null])
  })

  it('ilerleme yalnızca oynanabilir hücreleri sayar', () => {
    expect(placedCount([0, null, null, 1], playable)).toBe(2)
  })

  it('sıradaki boş hücre (başa sarar, oynanmayanı atlar)', () => {
    expect(nextOpenCell([0, null, null, null], playable, 0)).toBe(1)
    expect(nextOpenCell([0, 1, null, null], playable, 1)).toBe(3)
    expect(nextOpenCell([null, 1, null, 2], playable, 3)).toBe(0)
    expect(nextOpenCell([0, 1, null, 2], playable, 3)).toBeNull()
  })

  it('cevaplar: oynanabilir hücrede isim, diğerlerinde null', () => {
    expect(answersOf([2, 0, null, 1], ['Ali', 'Işıl', 'Ece'], playable)).toEqual(['Ece', 'Ali', null, 'Işıl'])
  })

  it('aynı adın boşta bir girişi varsa taşımak yerine o kullanılır', () => {
    const names = ['Mert', 'Ali', 'MERT']
    // 0. giriş (Mert) 1. hücrede; 3. hücre için yine "Mert"e dokunuldu → boştaki 2. giriş.
    expect(preferFreeEntry([null, 0, null, null], names, 3, 0)).toBe(2)
    // Boşta aynı ad yoksa seçilen giriş taşınır.
    expect(preferFreeEntry([2, 0, null, null], names, 3, 0)).toBe(0)
    expect(preferFreeEntry([null, 1, null, null], names, 3, 1)).toBe(1)
  })

  it('taslak yeni karışık listeye isimle eşlenir (Türkçe, aynı isim iki kez)', () => {
    const names = ['Mert', 'IŞIL', 'Mert', 'Ali']
    expect(restorePlacement(['ışıl', 'Mert', null, 'MERT'], names, 4)).toEqual([1, 0, null, 2])
    // Listede olmayan isim yok sayılır.
    expect(restorePlacement(['Zeynep', null, null, 'Ali'], names, 4)).toEqual([null, null, null, 3])
  })
})

describe('oyuncu adı', () => {
  it('baştaki/sondaki boşluk atılır; yalnızca boşluk kabul edilmez', () => {
    expect(cleanPlayerName('  Deniz  ')).toBe('Deniz')
    expect(cleanPlayerName('   ')).toBeNull()
    expect(cleanPlayerName('')).toBeNull()
    expect(cleanPlayerName('a'.repeat(21))).toBeNull()
    expect(cleanPlayerName('a'.repeat(20))).toBe('a'.repeat(20))
  })
})

describe('hata metinleri', () => {
  it('kullanıcı dilinde', () => {
    expect(classifyPlayError('rate_limited').message).toBe('Çok fazla deneme yapıldı, biraz sonra tekrar dene.')
    expect(classifyPlayError('game_full').message).toBe('Bu oyun doldu.')
    expect(classifyPlayError('not_found').kind).toBe('gone')
    expect(classifyPlayError('network').kind).toBe('network')
    expect(classifyPlayError('weird').kind).toBe('message')
  })
})

describe('sıralama görünümü', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, name: `O${i + 1}`, points2: 30 - i, me: i === 25 }))

  it('ilk 20 satır + bu cihazın satırı', () => {
    const v = visibleRows(rows, false)
    expect(v).toHaveLength(21)
    expect(v.at(-1)!.name).toBe('O26')
  })
  it('bu cihaz ilk 20 içindeyse fazladan satır yok', () => {
    const mine = rows.map((r, i) => ({ ...r, me: i === 3 }))
    expect(visibleRows(mine, false)).toHaveLength(20)
  })
  it('"Tümünü göster" ile hepsi', () => {
    expect(visibleRows(rows, true)).toHaveLength(30)
  })
})
