/**
 * Açılışın masaüstü düzeni: iki sütun (sol: kart + panel, sağ: pusula),
 * `LEFT_FR : RIGHT_FR` oranında. Pusula kare kalır; kenarı sağ sütun genişliği
 * ile kalan yüksekliğin küçüğü. İki sütun da bu yükseklikte olur, böylece üst
 * ve alt kenarları aynı piksele denk gelir.
 */
export const LEFT_FR = 5
export const RIGHT_FR = 7
/** Sütun arası (px); Tailwind gap-6 ile aynı. */
export const COLUMN_GAP = 24

export function boardEdge(areaWidth: number, areaHeight: number, gap = COLUMN_GAP): number {
  if (areaWidth <= 0 || areaHeight <= 0) return 0
  const right = ((areaWidth - gap) * RIGHT_FR) / (LEFT_FR + RIGHT_FR)
  return Math.max(0, Math.floor(Math.min(right, areaHeight)))
}
