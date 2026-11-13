import { afterEach, describe, expect, it } from 'vitest'
import { ROOM_FLAG_KEY, applyRoomFlagFromUrl, roomEntryEnabled } from '../roomFlag'

function go(url: string) {
  window.history.replaceState(null, '', url)
  applyRoomFlagFromUrl()
}

describe('canlı oda gizli girişi', () => {
  afterEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('bayrak yokken kapalı', () => {
    go('/')
    expect(roomEntryEnabled()).toBe(false)
  })

  it('?oda=1 açar, ?oda=0 kapatır; parametre adresten silinir', () => {
    go('/?oda=1')
    expect(roomEntryEnabled()).toBe(true)
    expect(localStorage.getItem(ROOM_FLAG_KEY)).toBe('1')
    expect(window.location.search).toBe('')

    go('/')
    expect(roomEntryEnabled()).toBe(true)

    go('/?oda=0')
    expect(roomEntryEnabled()).toBe(false)
    expect(window.location.search).toBe('')
  })

  it('diğer parametreleri ve hash’i korur, bilinmeyen değeri yok sayar', () => {
    go('/?x=2&oda=evet#a')
    expect(roomEntryEnabled()).toBe(false)
    expect(window.location.search).toBe('?x=2')
    expect(window.location.hash).toBe('#a')
  })
})
