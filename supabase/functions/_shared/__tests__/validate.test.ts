// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseDuration, photoFieldIndex, validateGame } from '../validate.ts'
import { emptyCell, fakeJpeg, filledCell, payload, photosFor } from './fixtures.ts'

const errorOf = (data: unknown, photos = photosFor(0, 1)) => {
  const r = validateGame(data, photos)
  return r.ok ? null : r.error
}

/** 2x2 pusula: 0. hücre test edilen hücre, diğer üçü dolu (biri photo_1'li). */
const withCell = (cell: unknown) =>
  payload({ cells: [cell, filledCell('Ayşe'), filledCell('Mehmet'), filledCell('Zeynep', 1)] })

describe('validateGame: geçerli istek', () => {
  it('kabul eder ve boş maddeleri atar', () => {
    const r = validateGame(payload(), photosFor(0, 1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.durationHours).toBe(24)
    expect(r.value.cells[0]).toEqual({ name: 'Ali', bullets: ['Hep geç kalır', 'Çay sever'], photo: 0 })
    expect(r.value.photos.size).toBe(2)
  })

  it('3x3 için 3 bant, 4x4 için 4 çeyrek ister', () => {
    const cells9 = [...Array.from({ length: 4 }, () => filledCell()), ...Array.from({ length: 5 }, emptyCell)]
    const bands = [{ color: '#000000' }, { color: '#111111' }, { color: '#222222' }]
    expect(errorOf(payload({ gridSize: 3, regions: bands, cells: cells9 }), [])).toBeNull()
    const cells16 = [...Array.from({ length: 4 }, () => filledCell()), ...Array.from({ length: 12 }, emptyCell)]
    expect(errorOf(payload({ gridSize: 4, cells: cells16 }), [])).toBeNull()
    expect(errorOf(payload({ gridSize: 3, cells: cells9 }), [])).toBe('invalid_regions')
  })
})

describe('validateGame: ızgara ve başlık', () => {
  it.each([1, 5, '3', null, 3.5])('gridSize %s reddedilir', (gridSize) => {
    expect(errorOf(payload({ gridSize }))).toBe('invalid_grid')
  })

  it('hücre sayısı gridSize² olmalı', () => {
    expect(errorOf(payload({ cells: [filledCell(), filledCell(), filledCell()] }), [])).toBe('invalid_cells')
  })

  it('başlık en fazla 60 karakter', () => {
    expect(errorOf(payload({ title: 'a'.repeat(60) }))).toBeNull()
    expect(errorOf(payload({ title: 'a'.repeat(61) }))).toBe('invalid_title')
    expect(errorOf(payload({ title: 42 }))).toBe('invalid_title')
  })

  it('gövde nesne değilse reddedilir', () => {
    expect(errorOf(null)).toBe('invalid_payload')
    expect(errorOf([payload()])).toBe('invalid_payload')
  })

  it('bölge rengi ve etiket uzunluğu denetlenir', () => {
    const rest = payload().regions.slice(1)
    expect(errorOf(payload({ regions: [{ color: 'red' }, ...rest] }))).toBe('invalid_regions')
    expect(errorOf(payload({ regions: [{ color: '#FFFFFF', label: 'x'.repeat(25) }, ...rest] }))).toBe(
      'invalid_regions',
    )
  })
})

describe('validateGame: hücre limitleri', () => {
  it('isim ≤ 20 karakter (emoji tek sayılır)', () => {
    expect(errorOf(withCell(filledCell('a'.repeat(20))), photosFor(1))).toBeNull()
    expect(errorOf(withCell(filledCell('😀'.repeat(20))), photosFor(1))).toBeNull()
    expect(errorOf(withCell(filledCell('a'.repeat(21))), photosFor(1))).toBe('name_too_long')
  })

  it('madde ≤ 40 karakter', () => {
    expect(errorOf(withCell({ name: 'A', bullets: ['b'.repeat(40)] }), photosFor(1))).toBeNull()
    expect(errorOf(withCell({ name: 'A', bullets: ['b'.repeat(41)] }), photosFor(1))).toBe('bullet_too_long')
  })

  it('hücre başına ≤ 3 madde', () => {
    expect(errorOf(withCell({ name: 'A', bullets: ['1', '2', '3'] }), photosFor(1))).toBeNull()
    expect(errorOf(withCell({ name: 'A', bullets: ['1', '2', '3', '4'] }), photosFor(1))).toBe('too_many_bullets')
  })

  it('satır sonu ve kontrol karakteri kabul edilmez', () => {
    expect(errorOf(withCell({ name: 'A\nB', bullets: ['x'] }), photosFor(1))).toBe('invalid_cells')
    expect(errorOf(withCell({ name: 'A', bullets: ['x\u0000'] }), photosFor(1))).toBe('invalid_cells')
  })

  it('isim ve en az bir maddesi olan en az 4 hücre ister', () => {
    expect(errorOf(withCell({ name: 'Sadece isim', bullets: [] }), photosFor(1))).toBe('not_enough_cells')
    expect(errorOf(withCell({ name: '  ', bullets: ['madde'] }), photosFor(1))).toBe('not_enough_cells')
  })
})

describe('validateGame: süre', () => {
  it('verilmezse 24 saat', () => {
    const r = validateGame({ ...payload(), duration: undefined }, photosFor(0, 1))
    expect(r.ok && r.value.durationHours).toBe(24)
  })

  it.each([1, 24, 72])('%s saat kabul', (d) => {
    expect(parseDuration(d)).toEqual({ ok: true, value: d })
  })

  it.each([0, 2, 48, 73, -1, 24.5, '24', '24h', null, Infinity])('%s geçersiz', (duration) => {
    expect(errorOf(payload({ duration }))).toBe('invalid_duration')
  })
})

describe('validateGame: fotoğraflar', () => {
  const sixteen = Array.from({ length: 16 }, (_, i) => i)
  const cells16 = sixteen.map((i) => filledCell(`K${i}`, i))

  it('en fazla 16 foto', () => {
    expect(errorOf(payload({ gridSize: 4, cells: cells16 }), photosFor(...sixteen))).toBeNull()
    const seventeen = [...photosFor(...sixteen), { field: 'photo_16', bytes: fakeJpeg() }]
    expect(errorOf(payload({ gridSize: 4, cells: cells16 }), seventeen)).toBe('too_many_photos')
  })

  it('photo_N dışındaki alan adı reddedilir', () => {
    expect(photoFieldIndex('photo_0')).toBe(0)
    expect(photoFieldIndex('photo_15')).toBe(15)
    expect(photoFieldIndex('photo_16')).toBeNull()
    expect(photoFieldIndex('photo_01')).toBeNull()
    expect(photoFieldIndex('../x')).toBeNull()
    expect(errorOf(payload(), [...photosFor(0, 1), { field: 'evil', bytes: fakeJpeg() }])).toBe(
      'invalid_photo_field',
    )
  })

  it('hücrenin işaret ettiği foto gelmezse reddedilir', () => {
    expect(errorOf(payload(), photosFor(0))).toBe('missing_photo')
  })

  it('hiçbir hücrede kullanılmayan foto reddedilir', () => {
    expect(errorOf(payload(), photosFor(0, 1, 2))).toBe('unused_photo')
  })

  it('aynı foto iki hücrede ya da iki kez gelirse reddedilir', () => {
    const cells = [filledCell('A', 0), filledCell('B', 0), filledCell(), filledCell()]
    expect(errorOf(payload({ cells }), photosFor(0))).toBe('duplicate_photo')
    expect(errorOf(payload(), [...photosFor(0, 1), ...photosFor(1)])).toBe('duplicate_photo')
  })

  it('bozuk (kesik) JPEG reddedilir', () => {
    const broken = fakeJpeg().slice(0, 30)
    expect(errorOf(payload(), [{ field: 'photo_0', bytes: broken }, ...photosFor(1)])).toBe('photo_not_jpeg')
  })

  it('JPEG olmayan dosya reddedilir', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(errorOf(payload(), [{ field: 'photo_0', bytes: png }, ...photosFor(1)])).toBe('photo_not_jpeg')
  })

  it('yanlış ölçü ve büyük dosya reddedilir', () => {
    expect(errorOf(payload(), [{ field: 'photo_0', bytes: fakeJpeg(300, 300) }, ...photosFor(1)])).toBe(
      'photo_wrong_size',
    )
    const big = fakeJpeg(400, 400, { padTo: 200_000 })
    expect(errorOf(payload(), [{ field: 'photo_0', bytes: big }, ...photosFor(1)])).toBe('photo_too_large')
  })

  it('hücredeki photo alanı 0-15 arası tamsayı olmalı', () => {
    for (const photo of [-1, 16, 1.5, '0']) {
      const cells = [{ ...filledCell('A'), photo }, filledCell(), filledCell(), filledCell()]
      expect(errorOf(payload({ cells }), [])).toBe('invalid_cells')
    }
  })
})
