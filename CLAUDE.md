# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje
Character Compass: arkadaş grupları için karakter pusulası meme'i üreten web uygulaması.
Yayın: https://compass.meteucar.com (Netlify, ayarlar `netlify.toml`).
Yol haritası ve verilen kararlar: `docs/ROADMAP.md`. Kapsam dışı bir işe girmeden önce oraya bak.

## Komutlar
pnpm + Node 22.20.0 (`.nvmrc`).
- `pnpm dev` · `pnpm build` · `pnpm preview`
- `pnpm typecheck` (tsc -b) · `pnpm lint` (oxlint) · `pnpm test` (vitest run, jsdom)
- Tek test: `pnpm test src/lib/__tests__/grid.test.ts` ya da `pnpm test -t "test adı"`

## Mimari (birkaç dosyaya yayılan kısımlar)
- Durum: `src/store/compassStore.ts` (zustand + persist → localStorage, anahtar `STORAGE_KEY`).
  Undo/redo `past`/`future` yığınlarıyla; aynı anahtarla 1 sn içindeki ardışık
  değişiklikler tek adımda birleşir (`commit`, `breakCoalescing`). Geçmiş kalıcı değil.
  Geçici arayüz durumu (toast, kırpma isteği) `src/store/uiStore.ts`'te.
- Kalıcı veri okunurken: `migratePersisted` (`src/lib/migrate.ts`) → `sanitizeCompass`
  (`src/lib/sanitize.ts`). Migration yalnızca eksik/değişen alanları ekler, doğrulamayı sanitize yapar.
- Fotolar IndexedDB'de Blob olarak (`src/lib/photos.ts`); store'da yalnızca `photoId` var.
  Undo geçmişi nedeniyle fotolar anında silinmez; sahipsizler açılışta temizlenir.
- localStorage anahtarı ve IndexedDB adı eski adla (`karakter-pusulasi`) kalır; değiştirme, kayıtlar kaybolur.
- Oyun linki (Aşama 2): Supabase Edge Functions (`supabase/functions/`), işletim adımları
  `docs/supabase.md`. Tarayıcı yalnızca `fetch` + publishable anahtarla fonksiyonları çağırır
  (`src/lib/gameApi.ts`, yalnızca dinamik import); supabase-js ön yüze eklenmez.
  Doğrulama `supabase/functions/_shared/` içinde saf TS'dir ve vitest ile test edilir;
  sunucu limitleri `_shared/limits.ts`'te kopya durur, `limits.test.ts` `src/constants.ts` ile eşleştirir.
  Oyunlarım listesi ve delete_token `compass-games` anahtarında (`src/store/gamesStore.ts`), pusula şemasından ayrı.
- Pusula her zaman 1080×1080 çizilir ve ekrana ölçeklenir; PNG, aynı DOM'dan
  `src/lib/exportPng.ts` ile alınır (fontlar ve fotolar beklenir, `.editor-only` öğeler çıkarılır).

## Değişmeyecek ilkeler
- Meme modu sunucusuz kalır: fotoğraflar cihazdan çıkmaz, hesap yok.
- Sunucuya veri yalnızca kullanıcı açıkça "oyun linki" ya da "oda" oluşturduğunda
  gider ve kısa süre sonra silinir.
- AI özelliği yok; madde önerisi hazır havuzdan gelir.
- Arayüz metinleri Türkçe.

## Çalışma şekli
- Büyük işlerde önce kısa plan çıkar, onay bekle.
- Her adımın sonunda typecheck, lint ve testleri çalıştır.
- Arayüz değişikliklerini masaüstünde ve 390 px mobilde tarayıcıda doğrula.
- PNG çıktısını etkileyen değişikliklerde 2x2, 3x3 ve 4x4 çıktıyı kontrol et.
- Ben istemedikçe commit atma.

## Dikkat edilecekler
- Limitler ve sabit ölçüler tek yerde: `src/constants.ts`.
- Temalar ve madde havuzları: `src/data/themes.ts`.
- Metin karşılaştırmalarında Türkçe yerel ayar kullan (`toLocaleLowerCase('tr')`).
- Kayıtlı veri şeması değişirse `src/lib/migrate.ts`'teki `STORE_VERSION`'ı artır,
  `migratePersisted`'a geçiş ekle ve `src/store/__tests__/migrate.test.ts`'e test yaz.
- iOS Safari'yi emülasyon tam yansıtmaz; klavye ve export davranışında gerçek
  cihaz testi gerektiğini kullanıcıya söyle.
