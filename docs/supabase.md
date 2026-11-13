# Supabase: kurulum, yayın ve doğrulama

Aşama 2'nin sunucu tarafı. Mimari özeti `CLAUDE.md`'de; bu dosya işletim adımlarıdır.

- Proje: `iwdywhvfipdcuhfwlkba` · Bölge: eu-central-1 (Frankfurt) · Plan: ücretsiz
- Supabase CLI kurulu değil; her komut `npx supabase …` ile çalışır (v3.x).

## Bileşenler

| Parça | Yer | Not |
|---|---|---|
| Şema, yetkiler, kova | `supabase/migrations/20261113000100_games_schema.sql` | RLS açık, policy yok; yalnızca `service_role`'a GRANT |
| Tahmin oyunu (Aşama 3) | `supabase/migrations/20261114000100_guess_game.sql` | `guesses`, `guess_hints` (oyunla cascade silinir), `game_photos.blur_path`, `submit_guess()` |
| Çözme süresi | `supabase/migrations/20261115000100_solve_time.sql` | `guess_starts` (cascade), `guesses.duration_seconds`, `start_guess()`; `submit_guess()` süreyi yazar |
| Zamanlama | `supabase/migrations/20261113000200_schedules.sql` | pg_cron + pg_net; cleanup sırrı Vault'ta, DB içinde üretilir |
| Fonksiyonlar | `supabase/functions/{create-game,delete-game,cleanup,health,get-game,start-game,use-hint,submit-guess,game-stats}` | Hepsi `verify_jwt = false`; yetki kontrolü fonksiyon içinde |
| Ortak kod | `supabase/functions/_shared/` | `validate.ts`, `play.ts`, `jpeg.ts`, `tokens.ts`, `http.ts`, `ip.ts` saf TS → vitest; `game.ts`, `supabase.ts` Edge ortamı |
| Uyanık tutma | `.github/workflows/keepalive.yml` | Pzt + Per 06:17 UTC, `health` → 204 |

### Uç noktalar

| Fonksiyon | Kim çağırır | Yetki | Hız limiti |
|---|---|---|---|
| `create-game` | Tarayıcı | `apikey` = publishable anahtar | IP başına saatte 5 |
| `delete-game` | Tarayıcı | publishable + `delete_token` | IP başına saatte 30 |
| `get-game` | Tarayıcı (`/g/{code}`) | publishable + `device` | IP başına saatte 120 |
| `start-game` | Tarayıcı (ad girilip oyuna başlanınca) | publishable + `device` | IP başına saatte 120 |
| `use-hint` | Tarayıcı | publishable + `device` | IP başına saatte 120 |
| `submit-guess` | Tarayıcı | publishable + `device` | IP başına saatte 30; oyun başına 200 tahmin |
| `game-stats` | Tarayıcı (Oyunlarım → İstatistik) | publishable + `delete_token` | IP başına saatte 60 |
| `cleanup` | Yalnızca pg_cron (15 dk) | `x-cleanup-secret` (Vault'taki sır, DB'de doğrulanır) | — |
| `health` | GitHub Actions | yok; veri döndürmez (204) | — |

### Tahmin oyunu (Aşama 3)

- **Oyuncuya giden veri (`get-game`):** başlık, ızgara, bölgeler, hücre başına
  `{ bullets, playable, hint }` ve karıştırılmış isim listesi. İsim–hücre eşleşmesi, foto
  kimliği ve dosya yolu dönmez. Bu cihaz tahmin gönderdiyse oyun yerine kendi sonucu döner.
- **Net fotoğraflar** yalnızca tahmin gönderildikten sonra (`submit-guess` ya da tahmini olan
  cihazın `get-game`'i) 10 dakikalık imzalı adreslerle gelir.
- **İpucu:** oyunu kuran tarayıcı her foto için 32×32 bulanık JPEG (≤ 5 KB) üretir ve
  `blur_N` alanında gönderir (isteğe bağlı; eski istemciler göndermez, o oyunda ipucu olmaz).
  `use-hint` bunu base64 döner ve `guess_hints`'e yazar; o hücre doğru bilinirse yarım puan.
- **Puan** sunucuda (`_shared/play.ts`): isimler `toLocaleLowerCase('tr')` ile, isme göre
  karşılaştırılır; aynı adı taşıyan iki kişi birbirinin yerine sayılır. `points2` = puanın iki katı.
- **Cihaz:** tarayıcı 128 bitlik rastgele kimlik üretir (`compass-device`); sunucuda yalnızca
  `SHA-256(kod | cihaz)` tutulur. `(game_code, device_hash)` tekil; `submit_guess()` oyun başına
  danışma kilidiyle 200 sınırını ve tekil cihazı tek işlemde denetler (409 `already_played` /
  `game_full`).
- **Silme:** `guesses`, `guess_hints` ve `guess_starts` `games`'e cascade ile bağlı; bulanık dosyalar oyunun
  kova klasöründe. cleanup ve `delete-game` bunları ek kod olmadan kapsar.
- **Çözme süresi:** oyuncu adını girip oyuna başlayınca `start-game` cihaz için başlangıcı
  `guess_starts`'a yazar; yalnızca ilk seferde (`on conflict do nothing`), yenileme sıfırlamaz.
  `submit_guess()` süreyi sunucu saatiyle hesaplar (`now() - started_at`, saniye) ve
  `guesses.duration_seconds`'a yazar. Başlangıç yoksa tahmin yine kabul edilir, süre boş kalır.
  Sıralama: puan azalan, süre artan (boş en sonda), o da eşitse önce gönderen
  (`_shared/play.ts` → `compareGuesses`). Oyun sırasında sayaç gösterilmez; başlangıç zamanı
  istemciye dönmez.
- **Kurucu:** `game-stats` silme anahtarıyla istatistik ve satır kimlikli sıralama döner;
  `remove: <id>` o tahmini ve o cihazın ipuçlarını siler.

### Fonksiyon ortam değişkenleri

Platformun kendiliğinden verdikleri: `SUPABASE_URL`, `SUPABASE_SECRET_KEYS`,
`SUPABASE_PUBLISHABLE_KEYS` (eskileri yalnızca yedek: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`).

Elle verilecekler (`npx supabase secrets set …`):

| Ad | Değer | Zorunlu |
|---|---|---|
| `RATE_LIMIT_SALT` | 64 hex karakter, rastgele (`openssl rand -hex 32`) | Evet; yoksa create/delete 500 döner (fail-closed) |
| `CLIENT_IP_HEADER` | Doğrulamadan sonra platformun yazdığı başlık adı | Hayır; yoksa `cf-connecting-ip`, sonra `x-real-ip` denenir |

## Sabah: canlıya alma (sırayla)

> Parola ve anahtarlar sohbete yazılmaz; hepsi terminalde girilir.

1. **Giriş ve bağlama** (kullanıcı):
   ```sh
   npx supabase login                                  # tarayıcıda onay ya da token
   npx supabase link --project-ref iwdywhvfipdcuhfwlkba # DB parolasını terminalde gir
   ```
2. **Dashboard kontrolü** (kullanıcı, 1 dk): Settings → API Keys'te bir publishable ve bir
   secret anahtar olduğunu, Integrations → Data API'de "Automatically expose new tables"ın
   kapalı olduğunu gör.
3. **Migration'lar**: `npx supabase db push --remote` → iki migration uygulanır.
   (CLI v3'te `db push` ve `db query` varsayılan olarak yerel yığını hedefler; `--remote`
   verilmezse 127.0.0.1:54322'ye bağlanmaya çalışıp hata verir. Ajan modunda canlıyı
   değiştiren komutlar ayrıca `--yes` ister; salt okuma sorguları `--read-only` ile çalışır.)
4. **Tuz** (değer ekrana basılmadan):
   ```sh
   npx supabase secrets set RATE_LIMIT_SALT="$(openssl rand -hex 32)"
   ```
5. **Fonksiyonlar**: `npx supabase functions deploy create-game delete-game cleanup health`
6. **IP başlığı doğrulaması** (aşağıda) → gerekirse `CLIENT_IP_HEADER` ayarla.
7. **Ön yüz**: `.env.local` (gitignore'da) ve Netlify ortam değişkenleri:
   ```
   VITE_SUPABASE_URL=https://iwdywhvfipdcuhfwlkba.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
   ```
   Netlify: Site configuration → Environment variables → iki değişkeni ekle → yeniden deploy.
8. **GitHub**: Settings → Secrets and variables → Actions → **Variables** →
   `SUPABASE_URL = https://iwdywhvfipdcuhfwlkba.supabase.co`. Ardından Actions →
   "Supabase keepalive" → Run workflow ile bir kez elle dene.

## Doğrulama (canlı)

Aşağıda `$URL` = `https://iwdywhvfipdcuhfwlkba.supabase.co`, `$PK` = publishable anahtar.

### a) Publishable anahtarla doğrudan erişim reddedilir

```sh
for t in games game_photos rate_limits; do
  curl -s -o /dev/null -w "$t %{http_code}\n" "$URL/rest/v1/$t?select=*" -H "apikey: $PK"
done
curl -s -w "\n%{http_code}\n" -X POST "$URL/rest/v1/rpc/verify_cleanup_secret" \
  -H "apikey: $PK" -H 'Content-Type: application/json' -d '{"p_secret":"x"}'
curl -s -w "\n%{http_code}\n" -X POST "$URL/storage/v1/object/list/game-photos" \
  -H "apikey: $PK" -H "Authorization: Bearer $PK" -H 'Content-Type: application/json' -d '{"prefix":""}'
curl -s -o /dev/null -w "%{http_code}\n" "$URL/storage/v1/object/public/game-photos/x/y.jpg"
```
Beklenen: tablolar 401/403/404 (izin yok ya da şemada görünmez), rpc 401/403/404, liste boş
dizi ya da 4xx, public adres 400/404. Hiçbir satır ya da dosya adı dönmemeli.

### b) Süresi dolan oyun siliniyor

1. 1 saatlik bir oyun oluştur (uygulamadan ya da curl ile), kodunu not et.
2. SQL Editor'de (kullanıcı):
   ```sql
   update public.games set expires_at = now() - interval '1 minute', created_at = now() - interval '2 hours'
   where code = 'KOD';
   ```
3. Hemen: `delete-game` ve ileride oyun okuma "yok" sayar (404).
4. En geç 15 dk sonra SQL Editor:
   ```sql
   select count(*) from public.games where code = 'KOD';           -- 0
   select count(*) from public.game_photos where game_code = 'KOD'; -- 0
   select count(*) from storage.objects where bucket_id = 'game-photos' and name like 'KOD/%'; -- 0
   select status, start_time from cron.job_run_details order by start_time desc limit 5;
   ```

### c) Hız limiti 6. istekte devreye girer

Geçerli bir gövdeyle 6 ardışık `create-game` isteği: ilk 5 → 201, 6. → 429. Ardından
oluşan 5 test oyunu `delete-game` ile silinir ve IP'nin kilidi açılır:
```sql
delete from public.rate_limits where key like '%:create-game' or key like '%:delete-game';
```
(Test sırasında başka kullanıcı yoksa bu güvenlidir; satırlar zaten en geç 1 saatte silinir.)

### d) Secret anahtar repoda ve build'de yok

```sh
git ls-files -co --exclude-standard | xargs grep -nE "sb_secret_[A-Za-z0-9]|eyJhbGciOi" ; echo "çıkış: $?"
pnpm build && grep -rnE "sb_secret_|service_role|SUPABASE_SECRET" dist ; echo "çıkış: $?"
```
İkisi de eşleşme vermemeli (çıkış 1).

### e) Meme modu ağ isteği atmaz

Oyun linki oluşturmadan pusula yap, PNG indir: tarayıcının ağ sekmesinde site kökeni
dışına hiçbir istek olmamalı. Ağ kodu (`gameApi`) ayrı bir parçadır ve yalnızca
"Linki oluştur" ya da "Şimdi sil"e basınca yüklenir.

### IP başlığı doğrulaması

İstemcinin kendi gönderdiği `x-forwarded-for`'a güvenilmez. Hangi başlığın platform
tarafından yazıldığını görmek için:

1. `supabase/probes/ip-probe.ts` → `supabase/functions/ip-probe/index.ts` kopyala,
   `config.toml`'a `[functions.ip-probe]` + `verify_jwt = false` ekle,
   `npx supabase functions deploy ip-probe`.
2. Gerçek IP'ni öğren (`curl -s https://api.ipify.org`), sonra sahte başlıkları **tek tek** dene
   (Cloudflare, istemcinin gönderdiği `cf-connecting-ip`'i "error code: 1000" ile reddeder;
   hepsini aynı istekte göndermek bu yüzden sonuç vermez):
   ```sh
   for h in cf-connecting-ip x-real-ip x-forwarded-for true-client-ip; do
     echo "== $h"; curl -s "$URL/functions/v1/ip-probe" -H "$h: 6.6.6.6"; echo
   done
   ```
3. Değeri gerçek IP'n olan ve `6.6.6.6` ile ezilemeyen başlık, platformun yazdığıdır.
   `x-forwarded-for` gibi listelerde en sağdaki değer kullanılır (`_shared/ip.ts`).
4. Gerekirse `npx supabase secrets set CLIENT_IP_HEADER=<başlık>`.
5. Temizlik: `npx supabase functions delete ip-probe`, kopyalanan klasörü ve config satırını sil.

**Sonuç (13 Kasım 2026):** Platformun yazdığı başlık `cf-connecting-ip` (gerçek IP; istemci
gönderirse istek 1000 ile reddediliyor). `x-real-ip` gelmiyor, istemcinin gönderdiği silinir.
`x-forwarded-for` istemcinin değerini atıp `gerçek, gerçek, <vekil>` biçiminde yeniden yazılıyor;
**en sağdaki değer bir AWS vekili (99.82.x / 99.83.x)**, istemci değil. Bu yüzden
`CLIENT_IP_HEADER=x-forwarded-for` kullanılmamalı. `true-client-ip`, `x-client-ip`, `forwarded`
ve `x-envoy-external-address` istemciden olduğu gibi geçiyor (güvenilmez). Varsayılan sıra
(`cf-connecting-ip` → `x-real-ip`) doğru; `CLIENT_IP_HEADER` ayarlanmadı.

### Aşama 3 doğrulaması (canlı)

Betikler `fetch` ile uç noktaları çağırır (publishable anahtar, rastgele cihaz kimliği).

- **a)** `get-game` yanıtında hücre alanları yalnızca `bullets, playable, hint`; isim, `photo`,
  yol, uuid, `http` geçmez; isim listesi her istekte farklı sırada.
- **b)** Tahminden önce: `use-hint` yalnızca 32×32 dosyayı döner; tablolar (`games`,
  `game_photos`, `guesses`, `guess_hints`) 401; `rpc/submit_guess` reddedilir; kova listesi boş;
  gerçek nesne yolu bilinse bile imzalatma, doğrudan okuma ve public adres reddedilir.
- **c)** Aynı cihazdan ikinci `submit-guess` → 409 `already_played`; `get-game` sonucu döner.
- **d)** Tahminli ve ipuçlu bir oyunun süresi SQL Editor'de geri çekilir; en geç 15 dk sonra:
  ```sql
  select (select count(*) from public.games where code = 'KOD') as oyun,
         (select count(*) from public.game_photos where game_code = 'KOD') as foto,
         (select count(*) from public.guesses where game_code = 'KOD') as tahmin,
         (select count(*) from public.guess_hints where game_code = 'KOD') as ipucu,
         (select count(*) from storage.objects where bucket_id = 'game-photos' and name like 'KOD/%') as dosya;
  ```
  Hepsi 0 olmalı.
- **e)** İmzalı adres hemen 200, 10 dakika sonra 400 (`exp` = `iat` + 600).

## Bilinen sınırlar

- `cleanup` her turda en fazla 50 süresi dolmuş oyun siler; kalanlar sonraki turda.
- Tahmin oyununda cihaz kimliği tarayıcı deposundadır: gizli sekme ya da temizlenmiş tarayıcı
  yeni kimlik üretir ve yeniden oynayabilir (hesap olmadığı için kabul edildi).
- Kurucu bir oyuncuyu sıralamadan kaldırırsa o cihaz yeniden oynayabilir.
- pg_net, istek kuyruktayken `x-cleanup-secret` başlığını `net.http_request_queue`'ya
  yazar. Sızsa bile bu sır yalnızca cleanup'ı tetikler (o da zaten 15 dakikada bir çalışır).
- `project_url` Vault kaydı canlı adrese sabitlenmiştir; yerel `supabase start` ile cron
  canlı adrese istek atar ve yerel sır orada geçersiz olduğu için 404 alır (zararsız).
