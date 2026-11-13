import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

/** Katılım linkinin QR kodu (SVG; dış istek yok). */
export function QrCode({ value, size = 184, label }: { value: string; size?: number; label: string }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(value)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    }
    return { path: d, count: n }
  }, [value])

  const margin = 2
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-margin} ${-margin} ${count + margin * 2} ${count + margin * 2}`}
      shapeRendering="crispEdges"
      className="rounded-lg border-2 border-ink bg-white"
    >
      <path d={path} fill="#121212" />
    </svg>
  )
}
