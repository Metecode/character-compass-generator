// Sosyal önizleme görselini üretir (headless Chrome, 1200×630):
//   node scripts/og-game.mjs        → public/og-game.png  (scripts/og-game.html)
//   node scripts/og-game.mjs room   → public/og-room.png  (scripts/og-room.html)
// Chrome yolu: CHROME ortam değişkeni ya da işletim sistemine göre bilinen yer.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)
const chrome = candidates.find((p) => existsSync(p))
if (!chrome) throw new Error('Chrome bulunamadı; CHROME=/yol/chrome ile çalıştır.')

const name = process.argv[2] === 'room' ? 'og-room' : 'og-game'
const src = pathToFileURL(fileURLToPath(new URL(`./${name}.html`, import.meta.url))).href
const out = fileURLToPath(new URL(`../public/${name}.png`, import.meta.url))

execFileSync(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  '--window-size=1200,630',
  '--virtual-time-budget=3000',
  `--screenshot=${out}`,
  src,
])
console.log(`yazıldı: ${out}`)
