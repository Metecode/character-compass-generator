// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { inspectJpeg } from '../jpeg.ts'
import { validatePhoto } from '../validate.ts'
import { fakeJpeg } from './fixtures.ts'

describe('inspectJpeg', () => {
  it('ölçüyü SOF başlığından okur', () => {
    expect(inspectJpeg(fakeJpeg(400, 400))).toEqual({ ok: true, width: 400, height: 400 })
    expect(inspectJpeg(fakeJpeg(640, 480))).toEqual({ ok: true, width: 640, height: 480 })
  })

  it('progressive (SOF2) dosyayı da tanır', () => {
    expect(inspectJpeg(fakeJpeg(400, 400, { sof: 0xc2 }))).toMatchObject({ ok: true, width: 400 })
  })

  it('PNG / GIF / boş dosyayı reddeder (magic byte)', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0xff, 0xd9])
    const gif = new TextEncoder().encode('GIF89a......')
    expect(inspectJpeg(png)).toEqual({ ok: false, reason: 'not_jpeg' })
    expect(inspectJpeg(gif)).toEqual({ ok: false, reason: 'not_jpeg' })
    expect(inspectJpeg(new Uint8Array())).toEqual({ ok: false, reason: 'not_jpeg' })
  })

  it('kesik (EOI olmayan) dosyayı reddeder', () => {
    const j = fakeJpeg()
    expect(inspectJpeg(j.slice(0, j.length - 10))).toEqual({ ok: false, reason: 'truncated' })
  })

  it('bozuk işaretçi zincirini reddeder', () => {
    const j = fakeJpeg()
    j[2 + 18] = 0x00 // SOF'un FF'i bozuldu
    expect(inspectJpeg(j)).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('segment uzunluğu dosyanın dışına taşarsa reddeder', () => {
    const j = fakeJpeg()
    j[4] = 0xff // APP0 uzunluğu 0xFF10
    expect(inspectJpeg(j)).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('SOF olmadan görüntü verisine geçen dosyayı reddeder', () => {
    const noFrame = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x00, 0x00, 0xff, 0xd9])
    expect(inspectJpeg(noFrame)).toEqual({ ok: false, reason: 'no_frame' })
  })

  it('magic byte doğru ama içi çöp olan dosyayı reddeder', () => {
    const junk = new Uint8Array(500).fill(0x41)
    junk.set([0xff, 0xd8, 0xff, 0x41], 0)
    junk.set([0xff, 0xd9], 498)
    expect(inspectJpeg(junk).ok).toBe(false)
  })
})

describe('validatePhoto', () => {
  it('400x400 ve ≤150 KB JPEG kabul', () => {
    expect(validatePhoto(fakeJpeg())).toBeNull()
    expect(validatePhoto(fakeJpeg(400, 400, { padTo: 150 * 1024 }))).toBeNull()
  })

  it('150 KB üstü reddedilir', () => {
    expect(validatePhoto(fakeJpeg(400, 400, { padTo: 150 * 1024 + 1 }))).toBe('photo_too_large')
  })

  it('400x400 dışındaki ölçü reddedilir', () => {
    expect(validatePhoto(fakeJpeg(401, 400))).toBe('photo_wrong_size')
    expect(validatePhoto(fakeJpeg(1080, 1080))).toBe('photo_wrong_size')
  })

  it('JPEG olmayan reddedilir', () => {
    expect(validatePhoto(new TextEncoder().encode('<svg></svg>'))).toBe('photo_not_jpeg')
  })
})
