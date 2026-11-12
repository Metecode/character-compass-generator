# Character Compass

Arkadaş grupları için karakter pusulası (alignment chart) hazırlayıcı. İsim, fotoğraf ve komik maddeler ekle, 1080×1080 PNG olarak indir. Üyelik yok, sunucu yok: her şey tarayıcıda çalışır, fotoğraflar cihazdan çıkmaz.

Canlı adres: https://compass.meteucar.com

## Geliştirme

```bash
pnpm install
pnpm dev        # geliştirme sunucusu
pnpm test       # testler
pnpm typecheck
pnpm lint
pnpm build      # dist/ klasörüne üretim çıktısı
pnpm preview    # build çıktısını yerelde sun
```

Node sürümü `.nvmrc` dosyasında (22.20.0).

## Yayın (Netlify)

`netlify.toml` build ayarlarını (`pnpm build`, `dist`), Node sürümünü ve önbellek başlıklarını tanımlar. `public/_redirects` tüm yolları `index.html`'e yönlendirir.

## Paylaşım görseli

`public/og.png` (1200×630) Open Graph ve Twitter kartı için kullanılır. Örnek isimler ve baş harf avatarlarıyla üretilmiştir, gerçek kişi fotoğrafı içermez.
