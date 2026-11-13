// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { containsProfanity, profanityTokens } from '../profanity.ts'

describe('argo süzgeci', () => {
  it('yaygın küfürleri yakalar', () => {
    for (const t of [
      'siktir git',
      'Amına koyayım',
      'AMK',
      'aq ya',
      'orospu çocuğu',
      'tam bir yarrak',
      'piç',
      'göt',
      'ibnenin teki',
      'şerefsiz herif',
      'bok gibi',
      'Pezevenk',
    ]) {
      expect(containsProfanity(t), t).toBe(true)
    }
  })

  it('yazım hileleri: rakamlar, uzatma, harf aralama', () => {
    for (const t of ['s1kt1r', 'siiiiktir', 's.i.k.t.i.r', 'or0spu', 'a m k', '@mk']) {
      expect(containsProfanity(t), t).toBe(true)
    }
  })

  it('masum sözcüklere dokunmaz', () => {
    for (const t of [
      'Sıkı çalışır',
      'Çok sıkıcı',
      'sıkıntı yapmaz',
      'Eski sikke toplar',
      'sikayet etmeyi sever', // Türkçe klavyesiz "şikayet"
      'Her şeyi götürür',
      'Sıçrayarak yürür',
      'Sıçan görünce kaçar',
      'Amin der',
      'Ambulans sesini taklit eder',
      'Bokser köpeği var',
      'Kahve içmeden konuşmaz',
      'Picnic sever',
      'Taşınmayı sever',
      'Hep geç kalır',
      'Yarışmayı kazanır',
      'Ya rakı ya şarap',
      'A takımında oynar',
    ]) {
      expect(containsProfanity(t), t).toBe(false)
    }
  })

  it('Türkçe küçük harf: İ → i, I → ı', () => {
    expect(profanityTokens('SİKTİR')).toEqual(['siktir'])
    expect(profanityTokens('SIKI')).toEqual(['sıkı'])
  })
})
