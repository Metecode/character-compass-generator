/** Menü ile ekran kenarı arasındaki en az boşluk (px). */
export const MENU_MARGIN = 8

/**
 * Masaüstü (≥ 640 px) açılır menünün konumu: düğmenin sağ kenarına hizalanır;
 * ekrandan taşacaksa sol kenarına hizalanır; her durumda ekran içinde kalır.
 */
export function menuPosition(
  button: { left: number; right: number; bottom: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let left = button.right - menu.width
  if (left < MENU_MARGIN) left = button.left
  left = Math.min(Math.max(MENU_MARGIN, left), Math.max(MENU_MARGIN, viewport.width - menu.width - MENU_MARGIN))
  let top = button.bottom + MENU_MARGIN
  if (top + menu.height > viewport.height - MENU_MARGIN) top = Math.max(MENU_MARGIN, viewport.height - menu.height - MENU_MARGIN)
  return { left: Math.round(left), top: Math.round(top) }
}
