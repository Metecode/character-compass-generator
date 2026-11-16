import { afterEach, describe, expect, it } from 'vitest'
import { removeLegacyStorage } from '../legacyStorage'

describe('eski localStorage anahtarlarının temizliği', () => {
  afterEach(() => localStorage.clear())

  it('canlı oda gizli giriş bayrağını siler, diğer kayıtlara dokunmaz', () => {
    localStorage.setItem('compass-room-entry', '1')
    localStorage.setItem('karakter-pusulasi', '{}')
    localStorage.setItem('compass-rooms', '{}')
    removeLegacyStorage()
    expect(localStorage.getItem('compass-room-entry')).toBeNull()
    expect(localStorage.getItem('karakter-pusulasi')).toBe('{}')
    expect(localStorage.getItem('compass-rooms')).toBe('{}')
  })

  it('depolama hata verirse açılışı bozmaz', () => {
    const broken = {
      removeItem: () => {
        throw new Error('SecurityError')
      },
    } as unknown as Storage
    expect(() => removeLegacyStorage(broken)).not.toThrow()
  })
})
