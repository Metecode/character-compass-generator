/**
 * Kaba küfür/argo süzgeci (canlı odada "argo serbest" kapalıyken). Saf TS.
 *
 * Kaba bir süzgeçtir, tek güvence değildir (ROADMAP). Yanlış alarmı az tutmak için
 * metin sözcüklere bölünür ve her sözcük kök listesiyle karşılaştırılır; masum
 * sözcüklerle çakışan kökler (ör. "götür", "şikayet", "sıçramak", "amin") dışarıda bırakılır.
 *
 * Normalleştirme: Türkçe küçük harf, sık kullanılan rakam/simge yerine koymaları
 * (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s), 3+ tekrar eden harf tek harfe iner
 * ("siiiik" → "sik"), tek harflik ardışık parçalar birleştirilir ("s.i.k" → "sik").
 */

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' }

/** Sözcük başından eşleşen kalıplar (normalleştirilmiş sözcük üzerinde). */
const PATTERNS: RegExp[] = [
  /^sik(?!ke|ay)/, // sik, siktir, sikerim; "sıkı", "sikke", "sikayet" değil
  /^am[ıi]na/,
  /^amc[ıi][kğg]/,
  /^or[oa]?spu/,
  /^yar+a[kğg]/,
  /^dalyar+a/,
  /^piç(ler|lik|i|in|e)?$/,
  /^göt(ü|ün|e|ler|lek|veren|oş|ten)?$/,
  /^ibne/,
  /^pezeven/,
  /^kahpe/,
  /^gavat/,
  /^kaltak/,
  /^s[üu]rt[üu]k/,
  /^yav[şs]ak/,
  /^[şs]erefsiz/,
  /^pu[şs]t/,
  /^bok(tan|u|lu|un|a)?$/,
  /^sıç(?!ra|an)/,
  /^ta[şs]a[kğg]/,
  /^mına/,
  /^fuck/,
  /^shit/,
  /^bitch/,
  /^motherf/,
]

/** Tam sözcük olarak eşleşenler (kısaltmalar). */
const EXACT = new Set(['amk', 'amq', 'aq', 'mk', 'oç', 'oc', 'sg'])

function normalizeWord(w: string): string {
  let s = ''
  for (const ch of w) s += LEET[ch] ?? ch
  return s.replace(/(.)\1{2,}/gu, '$1')
}

/** Metni normalleştirilmiş sözcüklere böler; tek harflik parçalar birleştirilir. */
export function profanityTokens(text: string): string[] {
  const raw = text.toLocaleLowerCase('tr').normalize('NFC').split(/[^\p{L}0-9@$]+/u).filter(Boolean)
  const out: string[] = []
  let run = ''
  const flush = () => {
    if (run.length > 1) out.push(run)
    run = ''
  }
  for (const part of raw) {
    const w = normalizeWord(part)
    if (Array.from(w).length === 1) {
      run += w
      continue
    }
    flush()
    out.push(w)
  }
  flush()
  return out
}

export function containsProfanity(text: string): boolean {
  for (const w of profanityTokens(text)) {
    if (EXACT.has(w)) return true
    if (PATTERNS.some((p) => p.test(w))) return true
  }
  return false
}
