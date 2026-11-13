import { lazy } from 'react'

/**
 * Tema ve Bantlar/Bölgeler pencereleri ayrı parça olarak yüklenir (ana parça
 * küçük kalsın). Düğmeye gelince ya da dokunulmaya başlanınca `preload…` ile
 * önceden istenir; açılışta gecikme çoğu zaman hissedilmez.
 */
const loadTheme = () => import('./ThemePicker')
const loadQuadrants = () => import('./QuadrantSettings')

export const LazyThemePicker = lazy(() => loadTheme().then((m) => ({ default: m.ThemePicker })))
export const LazyQuadrantSettings = lazy(() => loadQuadrants().then((m) => ({ default: m.QuadrantSettings })))

export const preloadTheme = () => void loadTheme().catch(() => {})
export const preloadQuadrants = () => void loadQuadrants().catch(() => {})
