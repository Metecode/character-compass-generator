import { describe, expect, it } from 'vitest'
import { inviteMessage, rateLimitMessage, retryWaitText, scoreMessage } from '../gameLink'

const URL = 'https://compass.meteucar.com/g/abc123abc123abcd'

describe('inviteMessage', () => {
  it('kurucu adıyla davet; paylaşım metninde link yok, kopyada tek parça', () => {
    const m = inviteMessage('Mete', URL)
    expect(m.text).toBe("Mete seni challenge'a davet etti! Bakalım kaç saniyede kimin kim olduğunu bileceksin")
    expect(m.text).not.toContain('http')
    expect(m.copy).toBe(`${m.text} 👉 ${URL}`)
  })

  it.each([null, undefined, '', '   '])('ad yoksa (%j) genel davet', (name) => {
    const m = inviteMessage(name, URL)
    expect(m.text).toBe('Bu pusuladakileri tanıyabilecek misin? Bakalım kaç saniyede çözeceksin')
    expect(m.copy).toBe(`${m.text} 👉 ${URL}`)
  })
})

describe('scoreMessage', () => {
  it('skor ve süreyle', () => {
    const m = scoreMessage({ points2: 12, total: 9, durationSeconds: 102 }, URL)
    expect(m.text).toBe("9'da 6 bildim, 1 dk 42 sn. Sen kaç yaparsın?")
    expect(m.copy).toBe(`9'da 6 bildim, 1 dk 42 sn. Sen kaç yaparsın? 👉 ${URL}`)
  })

  it('yarım puan ve doğru ek; süre bilinmiyorsa yazılmaz', () => {
    expect(scoreMessage({ points2: 7, total: 4, durationSeconds: null }, URL).text).toBe(
      "4'te 3,5 bildim. Sen kaç yaparsın?",
    )
  })
})

describe('hız limiti mesajı', () => {
  it('dakika yukarı yuvarlanır, uzun bekleme saatle yazılır', () => {
    expect(retryWaitText(1)).toBe('1 dakika')
    expect(retryWaitText(60)).toBe('1 dakika')
    expect(retryWaitText(61)).toBe('2 dakika')
    expect(retryWaitText(3599)).toBe('60 dakika')
    expect(retryWaitText(89 * 60)).toBe('89 dakika')
    expect(retryWaitText(90 * 60)).toBe('2 saat')
    expect(retryWaitText(20 * 3600 + 5)).toBe('21 saat')
  })

  it('ne zaman tekrar denenebileceğini söyler, limit sayısı içermez', () => {
    expect(rateLimitMessage(754)).toBe('Bu ağdan çok fazla oyun oluşturuldu. Yaklaşık 13 dakika sonra tekrar dene.')
    expect(rateLimitMessage(null)).toBe('Bu ağdan çok fazla oyun oluşturuldu. Biraz sonra tekrar dene.')
    expect(rateLimitMessage(754)).not.toMatch(/\b(5|15|40) oyun/)
  })
})
