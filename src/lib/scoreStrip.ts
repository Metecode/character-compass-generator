/**
 * Skor şeridinde bir çipi görünür yapmak için gereken scrollLeft. Çip zaten
 * tamamen görünüyorsa mevcut değer döner; değilse çip ortalanır (kenarlara kırpılır).
 */
export function stripScrollLeft(
  chip: { left: number; width: number },
  box: { scrollLeft: number; width: number; scrollWidth: number },
  margin = 8,
): number {
  const visible = chip.left >= box.scrollLeft + margin && chip.left + chip.width <= box.scrollLeft + box.width - margin
  if (visible) return box.scrollLeft
  const max = Math.max(0, box.scrollWidth - box.width)
  const centered = Math.round(chip.left + chip.width / 2 - box.width / 2)
  return Math.min(max, Math.max(0, centered))
}
