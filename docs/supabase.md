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
| Canlı oda (Aşama 4) | `supabase/migrations/20261117000100_live_rooms.sql` | `rooms`, `room_players`, `room_items`, `room_guesses` (odaya cascade); `room_join()`, `room_remove_player()`, `room_handover_admin()`; private `room-photos` kovası |
| Zamanlama | `supabase/migrations/20261113000200_schedules.sql` | pg_cron + pg_net; cleanup sırrı Vault'ta, DB içinde üretilir |
| Fonksiyonlar | `supabase/functions/{create-game,delete-game,cleanup,health,get-game,start-game,use-hint,submit-guess,game-stats,create-room,join-room,get-room-state,room-action,room-admin}` | Hepsi `verify_jwt = false`; yetki kontrolü fonksiyon içinde |
| Ortak kod | `supabase/functions/_shared/` | `validate.ts`, `play.ts`, `room.ts`, `jpeg.ts`, `tokens.ts`, `http.ts`, `ip.ts` saf TS → vitest; `game.ts`, `roomDb.ts`, `supabase.ts` Edge ortamı |
| Uyanık tutma | `.github/workflows/keepalive.yml` | Pzt + Per 06:17 UTC, `health` → 204 |

### Uç noktalar

| Fonksiyon | Kim çağırır | Yetki | Hız limiti |
|---|---|---|---|
| `create-game` | Tarayıcı | `apikey` = publishable anahtar | IP başına saatte 15 ve günde 40; sistemde en fazla 1000 aktif oyun |
| `delete-game` | Tarayıcı | publishable + `delete_token` | IP başına saatte 30 |
| `get-game` | Tarayıcı (`/g/{code}`) | publishable + `device` | IP başına saatte 120 |
| `start-game` | Tarayıcı (ad girilip oyuna başlanınca) | publishable + `device` | IP başına saatte 120 |
| `use-hint` | Tarayıcı | publishable + `device` | IP başına saatte 120 |
| `submit-guess` | Tarayıcı | publishable + `device` | IP başına saatte 30; oyun başına 200 tahmin |
| `game-stats` | Tarayıcı (Oyunlarım → İstatistik) | publishable + `delete_token` | IP başına saatte 60 |
| `create-room` | Tarayıcı ("Canlı oda kur") | publishable | IP başına saatte 10 ve günde 30; sistemde en fazla 20 aktif oda |
| `join-room` | Tarayıcı (`/r/{code}`) | publishable | IP başına saatte 60; bitmemiş odalarda toplam 180 oyuncu |
| `get-room-state` | Tarayıcı (`/r/{code}`) | publishable + `session` (yoksa ziyaretçi görünümü) | oturum başına dakikada 90; oturumsuz IP başına saatte 240 |
| `room-action` | Tarayıcı | publishable + `session`; `action` beyaz listede (`leave`, `save-items`) | oturum başına saatte 600 |
| `room-admin` | Tarayıcı (admin) | publishable + `session` = `rooms.admin_player_id`; `action` beyaz listede (`kick`, `delete`, `start`, `end-writing`) | oturum başına saatte 300 |
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

### Canlı oda (Aşama 4)

Durum makinesi `lobby → writing → reveal → done`. Sunucu tek doğruluk kaynağıdır; her işlem
bir Edge Function'dır.

- **Kimlik:** `create-room` / `join-room` 32 baytlık bir oturum anahtarı döner (yalnızca o
  yanıtta); tarayıcı `compass-rooms` anahtarında saklar, sunucuda `SHA-256('room-session|' + anahtar)`
  tutulur. Ayrı admin anahtarı yok: admin, oturumu `rooms.admin_player_id` ile eşleşen oyuncudur.
- **Admin devri:** admin 5 dakikadır durum istemediyse ve oyun bitmediyse, ilk durum isteğinde
  son 150 sn'de görünen en eski oyuncu admin olur (`room_handover_admin`, oda kilitli). Lobide
  admin kendisi çıkarsa admin en eski oyuncuya geçer; odada kimse kalmazsa oda silinir.
- **Ziyaretçi görünümü** (oturumsuz `get-room-state`): yalnızca kurucu adı, oyuncu sayısı,
  katılınabilir mi ve neden değil (`started` / `full`). Ad, foto, kanal adı dönmez.
- **Üye görünümü** `_shared/room.ts` → `projectMember`: oyuncu başına `id, name, photo, isAdmin,
  online`; ayarlar, kanal adı, sunucu saati. Yazarlık (`room_items.author_id`) hiçbir aşamada
  hiçbir istemciye gitmez.
- **Foto:** 400×400 JPEG doğrulaması `create-game` ile aynı. `room-photos/{kod}/{uuid}.jpg`;
  yüklemede oda bitiş süresine kadar geçerli tek imzalı adres üretilir ve `room_players.photo_url`'de
  saklanır (her istekte yeniden imzalanmaz, tarayıcı önbelleği çalışır). Lobiden çıkan ya da
  çıkarılan oyuncunun dosyası hemen silinir.
- **Ad:** oda içinde tekil, `toLocaleLowerCase('tr')` ile (`name_key`); 409 `name_taken`.
- **Başlatma (B):** `room-admin` → `start` (`room_start`, oda kilitli): yalnızca admin, LOBI'de,
  oyuncu sayısı mod alt sınırında (409 `too_few` + `needed`). Oyuncular rastgele halkaya dizilir
  (`ring_pos`); Klasik'te herkes sonraki 3 kişiye 1'er, Hızlı'da sonraki 1 kişiye 3 madde yazar
  (`ROOM_ASSIGNMENT`, `_shared/limits.ts`); boş `room_items` satırları burada açılır, ızgara
  boyutu (2/3/4) yazılır, `writing_ends_at = now() + write_seconds`. Başladıktan sonra katılma,
  çıkarma ve çıkma yok.
- **Yazma (B):** `room-action` → `save-items` `{ items: [{ target, slot, text }], ready? }`
  (`room_save_items`). Yalnızca oyuncuya atanmış satırlar yazılır (400 `not_assigned`); metin
  ≤ 40 karakter, boşluklar sadeleşir. Taslak kaydı sinyal göndermez (istemci ~1,5 sn duraklamada,
  odak kaybında, sayfa gizlenince ve süre sonunda gönderir). `ready` değişirse sinyal gider;
  herkes hazırsa aşama hemen AÇILIŞ'a geçer. Süre bittikten sonra 5 sn (`ROOM_WRITE_GRACE_SECONDS`)
  daha metin kabul edilir, hazır durumu değişmez. Argo kapalı odada `_shared/profanity.ts`
  süzgecine takılan madde boş kaydedilir ve yanıtta `flagged` olarak döner.
- **Yazmanın bitişi (B):** cron yok. Süre ve kayıt payı dolduysa ilk `get-room-state` isteği
  `room_finish_writing` ile aşamayı ilerletir ve sinyal gönderir; istemciler bitiş + pay + 0,3–1,8 sn
  sonra sorar, ilerlemezse 3 sn'de bir yeniden. Admin `end-writing` ile erken bitirince aşama hemen
  ilerlemez: `writing_ends_at` şimdiye çekilir, istemciler son taslaklarını pay içinde gönderir.
  Aşama geçişi `room_enter_reveal`'da (C açılış sırasını burada kuracak).
- **Yazma görünümü (B):** `writing` = bitiş anı (sunucu saati, ms), hazır sayısı / toplam, kendi
  hazır durumu ve kendi görevi (hedef kimlikleri + yalnızca kendi yazdığı metinler). Halka, kimin
  hazır olduğu ve başkalarının maddeleri dönmez.
- **Silme:** oda kuruluştan en geç 2 saat sonra (`expires_at`, tablo kısıtıyla), oyun bitince
  30 dakika sonra (Parça C). `cleanup` süresi dolan odaları dosyalarıyla siler ve `room-photos`'taki
  yetim klasörleri temizler. Admin `room-admin` → `delete` ile hemen siler.

**Realtime.** Oda başına bir public Broadcast kanalı: `room-{channel_id}` (22 karakter base62,
oda kodundan ayrı; yalnızca üyenin durum yanıtında döner). Kanal yalnızca içi boş sinyal taşır:
`changed` (herkes yeniden çeker) ve `admin` (yalnızca admin; tahmin sayısı gibi). Sinyali
fonksiyonlar REST ile gönderir (`POST /realtime/v1/api/broadcast`, secret anahtar, soket açmadan;
`_shared/supabase.ts` → `signalRoom`); gönderilemezse işlem yine başarılıdır. İstemci
(`src/lib/roomRealtime.ts`, yalnızca `/r/` parçasında `@supabase/realtime-js`) sinyal gelince
0–300 ms rastgele bekleyip `get-room-state` çağırır; peş peşe sinyaller tek isteğe iner, iki istek
arasında en az 1 sn (`src/lib/roomSync.ts`). Soket bağlıyken 60 sn'de bir nabız, kopukken 5 sn'de
bir yoklama; bağlanınca hemen çeker. "Bağlı" = kanal katılımı tamam ve tarayıcı çevrimiçi
(çevrim dışı olunca açık soket hemen kapanmayabilir). Yalnızca katılmış oyuncu soket açar
(oda başına ≤ 16). Private kanal kullanılmadı: Auth kullanıcısı ve projede "Allow public access"ı
kapatmayı gerektirir. Sonuç: konu adını bilen biri (atılmış oyuncu) sahte sinyal gönderip yeniden
çekme tetikleyebilir; veri sızmaz, istemcideki 1 sn sınırı ve oturum limiti etkisini sınırlar.

**Çağrı kotası.** Ücretsiz plan: ayda 500.000 Edge Function çağrısı (aşımda ücret yok, hizmet
kısıtlanır); Realtime 200 eşzamanlı bağlantı, saniyede 100 mesaj. Ölçüm (13 Kasım 2026,
`scripts/room-load.mjs`, 16 oyuncu): boşta lobide oyuncu başına dakikada 1,0 çağrı (nabız);
bir sinyal 16–17 durum isteği; 16 kişinin katılması toplam ~150 durum isteği. Tahmin, 16 kişilik
tam oyun (5 dk lobi, 3 dk yazma, 16 hücre açılış ~15 dk):

| Aşama | Hesap | Çağrı |
|---|---|---|
| Lobi | 16 katılma + ~150 durum + 5 dk × 16 nabız | ~250 |
| Yazma (B) | başlat 16 + 16 "hazırım" × 16 + taslak kaydı ~160 + 3 dk × 16 nabız + geçiş 16 | ~500 |
| Açılış (C) | 16 hücre × (2 admin adımı × 16 + 16 tahmin + 16 admin çekişi) + 15 dk × 16 nabız | ~1.300 |
| Toplam | | **~2.000–2.500** |

Ayda ~200 tam dolu oyun (tahmin oyunu kullanımı hariç). Nabız payı küçük (~%15); aralık 60 sn kaldı.
B ölçümü (`pnpm room:e2e:write`, 4 oyuncu, 2 dk yazma, lobi ve geçiş dahil): toplam 46 durum isteği
ve 8 `room-action`; taslak kaydı oyuncu başına 2–3 istekte kaldı. Tablodaki yazma tahmini korunur.

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
3. **Migration'lar**: `npx supabase db push --remote` → bekleyen migration'lar uygulanır.
   (CLI v3'te `db push` ve `db query` varsayılan olarak yerel yığını hedefler; `--remote`
   verilmezse 127.0.0.1:54322'ye bağlanmaya çalışıp hata verir. Ajan modunda canlıyı
   değiştiren komutlar ayrıca `--yes` ister; salt okuma sorguları `--read-only` ile çalışır.)
4. **Tuz** (değer ekrana basılmadan):
   ```sh
   npx supabase secrets set RATE_LIMIT_SALT="$(openssl rand -hex 32)"
   ```
5. **Fonksiyonlar**: `npx supabase functions deploy` (hepsi; `_shared/` değişince ona bağlı tüm
   fonksiyonlar yeniden yayınlanmalı, ajan modunda `--yes`)
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

### c) Hız limiti 16. istekte devreye girer

Değerler tek yerde: `_shared/limits.ts` → `CREATE_GAME_LIMITS` (IP başına saatte 15, günde 40)
ve `MAX_ACTIVE_GAMES` (1000). `create-game` iki pencereyi `rate_limit_take` ile birlikte
denetler; reddedilen istek kotadan düşmez. Yanıt `429 { error: 'rate_limited', retry_after }`
(saniye, ayrıca `Retry-After` başlığı); ön yüz "Yaklaşık X dakika sonra tekrar dene" yazar.
Aktif oyun tavanında `503 { error: 'too_many_games' }`.

Geçerli bir gövdeyle 16 ardışık `create-game` isteği: ilk 15 → 201, 16. → 429 ve
`retry_after` ≈ 3600'den az. Ardından oluşan 15 test oyunu `delete-game` ile silinir.

**Test sırasında limite takılınca (ya da testten sonra) `rate_limits`'i temizle.** Günlük
pencere nedeniyle `create-game-day` satırı 24 saat durur; temizlenmezse aynı IP'den o gün
yalnızca 25 oyun daha açılabilir. Anahtar `SHA-256(tuz|IP):işlem` biçimindedir; IP'yi
bilmeden yalnızca işlem adına göre silinir:
```sh
npx supabase db query --remote --yes   "delete from public.rate_limits where key like '%:create-game' or key like '%:create-game-day' or key like '%:delete-game';"
```
(Test sırasında başka kullanıcı yoksa güvenlidir; en kötü ihtimalle başkalarının sayacı da
sıfırlanır. Satırlar zaten en geç 1 günde silinir: `purge-rate-limits`.)

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

### Aşama 4 doğrulaması (canlı)

Betikler `.env.local`'daki publishable anahtarla canlı fonksiyonları çağırır; anahtar ekrana basılmaz.

- **API ve güvenlik** (`pnpm room:check`, `scripts/room-api-check.mjs`): publishable anahtarla
  4 oda tablosu 401, oda SQL fonksiyonları 404, `room-photos` listesi boş; kanalı dinleyen
  bağımsız bir istemci yalnızca `{}` payload'lı `changed` sinyalleri alır; ziyaretçi yanıtında
  yalnızca izinli 7 alan; üye yanıtında oturum, yazar, dosya yolu yok; aynı ad (TR büyük harf)
  409; yetkisiz kick 403; beyaz liste dışı eylem 400; admin çıkınca en eski oyuncu admin; silme 404;
  son oyuncu çıkınca oda silinir.
- **Çok sekmeli deneme** (`pnpm dev` + `pnpm room:e2e`, `scripts/room-e2e.mjs`, sistem Chrome'u):
  admin editörden odayı kurar (masaüstü), 3 oyuncu 390 px'te katılır, admin listeyi sinyalle
  görür; ziyaretçi ad/foto görmez; bir oyuncu çevrim dışı olur ("Bağlantı yeniden kuruluyor"),
  o sırada admin birini çıkarır, bağlantı dönünce liste kendiliğinden düzelir; sayfa yenilenince
  oyuncu aynı yerine döner; admin siler, diğerleri "Bu oda artık yok" görür. `SHOTS=klasör`
  ekran görüntüsü alır.
- **Çağrı ölçümü** (`MINUTES=3 node scripts/room-load.mjs`): 16 oyunculu lobi, yukarıdaki tablo.
- **Yazma API'si (B)** (`pnpm room:check:write`, `scripts/room-writing-check.mjs`): 3 kişiyle Klasik
  başlamaz (409 `too_few`, `needed: 1`); admin olmayan başlatamaz; başladıktan sonra katılma,
  çıkarma, çıkma 409; herkesin 3 farklı hedefi var, herkes 3 madde alır; yanıtlarda halka, yazar,
  oturum yok; taslak sinyalsiz, hazır olma sinyalli; hedef dahil kimse başkasının maddesini görmez;
  argo kapalı odada takılan madde boş + `flagged`; atanmamış hedef / yuva 400; 41 karakter 400;
  admin erken bitirince pay içinde kayıt kabul, paydan sonra ilk istek aşamayı ilerletir; Hızlı
  odada son kişi hazır olunca hemen ilerler; dinleyici yalnızca boş sinyal alır.
- **Yazma, çok sekmeli (B)** (`pnpm dev` + `pnpm room:e2e:write`, ~3 dk): admin masaüstünde 2 dk
  Klasik oda kurar, 3 oyuncu 390 px'te katılır; başlatınca herkes geri sayımı, büyük hedef
  fotoğrafını ve "1/3"ü görür; taslak debounce ile kaydedilir, zar havuzdan madde getirir, noktalar
  dolu/boş gösterir; çevrim dışı yazan oyuncu "Kaydedilemedi" görür, bağlantı dönünce kaydedilir,
  yenileyince yazdıkları gelir; boş maddeyle "Hazırım" onay sorar, admin "1/4 hazır" görür,
  düzenlemeye dönülür; son 30 sn'de sayaç kırmızı; admin son 2 sn'de yazar; süre dolunca kimse
  basmadan herkes açılışa geçer; sunucuda 12 satırdan 5'i dolu (son saniye maddesi dahil).
- **Admin devri:** SQL Editor'de adminin `last_seen_at`'ı 6 dk geri çekilir; başka bir oyuncunun
  ilk durum isteğinde en eski çevrimiçi oyuncu admin olur, eski admin dönünce normal oyuncudur.
- **Süre dolunca silme:**
  ```sql
  update public.rooms set created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'
  where code = 'KOD';
  ```
  (Kısıt: `expires_at` en fazla `created_at + 2 sa 5 dk`.) Hemen 404; en geç 15 dk sonra:
  ```sql
  select (select count(*) from public.rooms where code = 'KOD') as oda,
         (select count(*) from public.room_players where room_code = 'KOD') as oyuncu,
         (select count(*) from storage.objects where bucket_id = 'room-photos' and name like 'KOD/%') as dosya;
  ```
- **Testten sonra `rate_limits` temizliği** (oda işlemleri):
  ```sh
  npx supabase db query --remote --yes "delete from public.rate_limits where key like '%:create-room' or key like '%:create-room-day' or key like '%:join-room' or key like '%:room-preview' or key like '%:room-state' or key like '%:room-action' or key like '%:room-admin';"
  ```

## Bilinen sınırlar

- `cleanup` her turda en fazla 50 süresi dolmuş oyun ve 50 oda siler; kalanlar sonraki turda.
  Oda, süresi dolduktan sonra en geç ~15 dk daha diskte durur (istemcilere hemen 404).
- Canlı oda kanalı public'tir; konu adını bilen biri sahte boş sinyal gönderebilir (veri sızmaz).
- iOS Safari arka plana geçince soket kapanır; dönünce görünürlük olayıyla hemen yeniden çekilir.
  Gerçek cihazda denenmeli.
- Tahmin oyununda cihaz kimliği tarayıcı deposundadır: gizli sekme ya da temizlenmiş tarayıcı
  yeni kimlik üretir ve yeniden oynayabilir (hesap olmadığı için kabul edildi).
- Kurucu bir oyuncuyu sıralamadan kaldırırsa o cihaz yeniden oynayabilir.
- pg_net, istek kuyruktayken `x-cleanup-secret` başlığını `net.http_request_queue`'ya
  yazar. Sızsa bile bu sır yalnızca cleanup'ı tetikler (o da zaten 15 dakikada bir çalışır).
- `project_url` Vault kaydı canlı adrese sabitlenmiştir; yerel `supabase start` ile cron
  canlı adrese istek atar ve yerel sır orada geçersiz olduğu için 404 alır (zararsız).
