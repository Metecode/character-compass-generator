/** Test için en küçük geçerli JPEG yapısı: SOI, APP0, SOF0 (ölçü), SOS, EOI. */
export function fakeJpeg(width = 400, height = 400, opts: { padTo?: number; sof?: number } = {}): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [
    0xff, opts.sof ?? 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  ]
  const sos = [0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00]
  const head = [0xff, 0xd8, ...app0, ...sof, ...sos]
  const tail = [0xff, 0xd9]
  const fill = Math.max(4, (opts.padTo ?? 0) - head.length - tail.length)
  const out = new Uint8Array(head.length + fill + tail.length)
  out.set(head, 0)
  // Sıkıştırılmış veri yerine sıfırlar (FF içermez).
  out.set(tail, head.length + fill)
  return out
}

export const filledCell = (name = 'Ali', photo: number | null = null) => ({
  name,
  bullets: ['Hep geç kalır', '', 'Çay sever'],
  photo,
})

export const emptyCell = () => ({ name: '', bullets: [] as string[] })

export function payload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Sınıf',
    gridSize: 2,
    duration: 24,
    regions: [{ color: '#FFADAD', label: 'Kaos' }, { color: '#A0C4FF' }, { color: '#CAFFBF' }, { color: '#FDFFB6' }],
    cells: [filledCell('Ali', 0), filledCell('Ayşe'), filledCell('Mehmet'), filledCell('Zeynep', 1)],
    ...overrides,
  }
}

export const photosFor = (...indexes: number[]) => indexes.map((i) => ({ field: `photo_${i}`, bytes: fakeJpeg() }))
