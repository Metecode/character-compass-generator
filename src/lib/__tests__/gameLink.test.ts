import { describe, expect, it } from 'vitest'
import { inviteMessage, scoreMessage } from '../gameLink'

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
