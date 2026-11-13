# Character Compass — Yol Haritası

Son güncelleme: 14 Kasım 2026 · Yayın: https://compass.meteucar.com

## 1. Ürün

Arkadaş grupları için "karakter pusulası" meme'i üreten web uygulaması: ızgaradaki her hücrede foto, isim ve 1-3 esprili madde. Kazanç hedefi yok; amaç eğlence ve mümkün olduğunca çok kişinin kullanması.

### Değişmeyecek ilkeler

- **Meme modu sunucusuz kalır.** Pusula yap, PNG indir/paylaş akışı hesap, link ve backend gerektirmez; fotoğraflar cihazdan çıkmaz. Varsayılan mod budur.
- **Sunucu yalnızca isteyerek.** Kullanıcı "Oyun linki oluştur" ya da "Oda kur" demedikçe hiçbir veri gönderilmez.
- **Geçici barındırma.** Sunucuya giden her şey (foto dahil) kısa süre tutulur ve otomatik silinir; kalıcı arşiv yok.
- **Hesap yok.** Oyunlarda yalnızca bir ad girilir.
- **Az emek.** Bir pusulayı bitirmek kısa sürmeli; her yeni özellik bu ölçüyle değerlendirilir.
- **AI yok.** Madde önerisi hazır havuz ve zar ile yapılır.

## 2. Tamamlananlar

- Prototip: 4×4 ızgara, düzenleme paneli, karakter limitleri (isim 20, madde 40, en fazla 3 madde), foto yükleme ve kırpma, sürükle-bırak takas, 1080×1080 PNG çıktısı, otomatik kayıt, geri al/ileri al.
- 2×2 / 3×3 / 4×4 boyutları (varsayılan 3×3), 3×3'te satır bantları.
- Hazır temalar: Genel, Halı Saha, Tatil, Ofis, Sınıf, Aile.
- Madde havuzu (400'ü aşkın madde), zar ve "3 madde öner".
- PNG'de site imzası.
- Yeniden adlandırma (Character Compass), Netlify yayını, `compass.meteucar.com`.
- iPhone'da PNG çıktısı doğrulandı.
- **Aşama 2 — Supabase temeli (13 Kasım 2026):** şema ve migration'lar (RLS açık, policy yok, yalnızca service_role'a yetki), private foto kovası, `create-game` / `delete-game` / `cleanup` / `health` Edge Function'ları, yükleme doğrulaması (400×400 JPEG, ≤150 KB, en fazla 16 foto, gövde ≤3 MB), IP başına hız limiti (tuzlanmış özet; oyun oluşturmada saatte 15 + günde 40, sistemde en fazla 1000 aktif oyun), 15 dakikada bir temizlik (pg_cron + pg_net), GitHub Actions ile uyanık tutma, "Oyun linki oluştur" penceresi, "Oyunlarım", `/g/{code}` yer tutucu, `/gizlilik` sayfası. İşletim ve canlı doğrulama adımları: `docs/supabase.md`.
- **Aşama 3 — Tahmin oyunu (kod ve sunucu tarafı, 14 Kasım 2026; `feature/guess-game` dalı):** `/g/{code}` oyun ekranı (ad, karışık isim listesi, mobilde alt sayfa, "6/9 yerleştirildi", sırayla açılan sonuç ve "Animasyonu geç"), ipucu (32×32 bulanık foto, yarım puan), sunucuda puanlama, cihaz başına tek deneme, oyun başına 200 tahmin, sıralama (ilk 20 + kendi satırın, "Tümünü göster"), skor kartı PNG'si, kurucu istatistiği ve "Bu oyuncuyu sıralamadan kaldır", tek "Oyun" menüsü, "Bu oyun artık yok" sayfası. Yeni uç noktalar: `get-game`, `use-hint`, `submit-guess`, `game-stats`. Sunucu tarafı canlıda; ön yüz main'e birleştirilmeyi bekliyor.

## 3. Verilen kararlar

- **Backend: Supabase**, ücretsiz plan. Aşımda fatura çıkmaz, hizmet kısıtlanır. 7 gün hareketsizlikte proje duraklar; zamanlanmış küçük bir istekle önlenir.
- **Sunucu bölgesi:** AB (Frankfurt).
- **Fotoğraflar tahmin oyununda da yer alır**, geçici barındırmayla.
- **Saklama süreleri:**
  - Tahmin oyunu linki: varsayılan 24 saat; kurucu 1 saat / 24 saat / 72 saat seçebilir. Süre dolunca foto, metin ve skorlar birlikte silinir.
  - Canlı oda: oyun bitince silinir; her durumda en geç 2 saat sonra.
  - Kurucu ve admin istediği an elle silebilir.
- **Salt okunur paylaşım sayfası yapılmayacak.** O işi PNG görüyor; sunucuda gereksiz veri tutmamak için kaldırıldı.
- **Küfür/argo filtresi opsiyonel**, oda kurulurken seçilir.

## 4. Aşamalar

### Aşama 0 — Mobil cilası (şimdi)

- Klavye açıkken panelin doğru konumlanması (visualViewport), arka planın kaymaması.
- Düzenlerken hücrenin canlı önizlemesi.
- Panel başlığında kişinin adı; tek focus stili; madde satırının tek satıra inmesi.
- "Önceki / Sonraki" hücre geçişi, Enter ile hızlı doldurma.
- iOS güvenli alan boşlukları.
- 2×2 ve 3×3'te içeriğin hücreyi doldurması (font ve foto ölçeği).
- Netlify rozetinin kapatılması.

**Bitti sayılır:** iPhone'da bir 3×3 pusula, panel hiç bozulmadan baştan sona doldurulabiliyor.

### Aşama 1 — Gerçek kullanım testi

- Kendi grubunla en az bir pusula yap ve paylaş.
- Linki 3-4 başka gruba açıklama yapmadan ver.
- Bak: kaç kişi bitirdi, kaç kişi ikinci pusulayı yaptı, nerede takıldılar?

**Bitti sayılır:** En az 3 farklı grubun geri bildirimi toplandı; çıkan sorunlar küçük bir turda giderildi.

### Aşama 2 — Supabase temeli ✅ Tamamlandı

> Kod 13 Kasım 2026'da tamamlandı. Canlıya alma ve "Bitti sayılır" ölçütünün canlı doğrulaması: `docs/supabase.md`.

- Proje kurulumu (AB bölgesi), şema, tüm tablolarda RLS açık ve anonim erişim kapalı.
- Tüm yazma ve okuma işlemleri Edge Function üzerinden; service role anahtarı yalnızca orada.
- Özel (private) foto kovası; fotoğraflar kısa ömürlü imzalı adreslerle sunulur.
- Yükleme doğrulaması: yalnızca 400×400 JPEG, boyut sınırı, pusula başına en fazla 16 foto.
- Hız limiti: link ve oda oluşturma, tahmin gönderme.
- Süresi dolan kayıtları ve dosyaları silen zamanlanmış görev.
- Projeyi uyanık tutan zamanlanmış istek.
- Kısa bilgilendirme metni sayfası (ne işleniyor, ne kadar tutuluyor, nasıl silinir, iletişim).

**Bitti sayılır:** Süresi dolan bir kaydın satırları ve dosyaları kendiliğinden siliniyor; anonim anahtarla hiçbir tablo ve dosya okunamıyor.

### Aşama 3 — Tahmin oyunu (herkes kendi zamanında) ✅ Kod tamam

> Sunucu tarafı (migration + fonksiyonlar) 14 Kasım 2026'da canlıya alındı ve a–e maddeleri canlıda doğrulandı (`docs/supabase.md` → "Aşama 3 doğrulaması"). Ön yüz `feature/guess-game` dalında. "Bitti sayılır" ölçütünün gerçek grupla denenmesi bekleniyor.

Akış:

1. Kurucu "Oyun linki oluştur" der, süreyi seçer; pusulanın o anki hali fotoğraflarla birlikte sunucuya kopyalanır. Yayınlamadan önce uyarı: "Bu pusuladaki kişilerin haberi olsun; içerik seçtiğin süre sonunda silinir."
2. Oyuncu linki açar, ad yazar.
3. Izgara görünür; foto ve isimler kapalı, maddeler açık. Boş hücreler tahmin edilmez. Hücreye dokununca isim listesi açılır (mobilde alt sayfa); atanmış isim işaretli görünür ve başka hücreye taşınabilir. "6/9 yerleştirildi"; hepsi dolunca "Gönder".
4. Gönderince hücreler sırayla açılır (foto ve isim), skor çıkar ("9'da 6").
5. Linke özel sıralama tablosu.
6. Paylaşılabilir skor kartı (PNG, altında link).

Kurallar:

- **İpucu:** Bulanık foto açılabilir, o hücre yarım puan sayılır. **Karar değişti:** bulanık sürümü (32×32 JPEG, ≤ 5 KB) oyunu kuran tarayıcı üretir ve asıl fotoğrafla yükler; sunucu doğrular. Bulanık dosyası olmayan oyunda ipucu yok. Net foto tahminden önce gönderilmez; sonra 10 dakikalık imzalı adresle gelir.
- **Tek deneme:** Cihaz başına bir deneme (tarayıcıda rastgele cihaz kimliği, sunucuda yalnızca oyuna bağlı özeti). Aynı cihaz linki yeniden açarsa kendi sonucunu görür. Oyun başına en fazla 200 tahmin.
- **Kurucu istatistiği:** Kaç kişi oynadı, en kolay tanınan ve kimsenin bilemediği kişi; "Bu oyuncuyu sıralamadan kaldır" (tahmini silinir).
- **Sıralama:** Puan azalan, eşitlikte çözme süresi artan, o da eşitse önce gönderen; ekranda ilk 20 + bu cihazın satırı, "Tümünü göster". Cevap içermez.
- **Çözme süresi (15 Kasım 2026):** Oyuncu adını girip başlayınca sunucu başlangıcı kaydeder (cihaz başına bir kez, yenileme sıfırlamaz); süreyi gönderimde sunucu hesaplar. Sonuçta, sıralamada ve skor kartında görünür ("1 dk 42 sn"); oyun sırasında sayaç yok. Başlangıç kaydı olmayan (eski) tahminler süresiz, eşitlikte en altta.
- **Skor kartı:** 1080×1080 PNG; oyun başlığı, "9'da 6 bildim · 1 dk 42 sn", kısa çağrı ve site adresi. Başkalarının adı ya da fotoğrafı yok.
- **Kopya önleme:** Fotoğraflar ve isim eşleşmesi tahmin gönderilmeden tarayıcıya gelmez; skoru sunucu hesaplar.
- **Süre bitince:** Süresi dolmuş, silinmiş ya da geçersiz kod için tek tip "Bu oyun artık yok" sayfası. Tahminler ve ipuçları oyunla birlikte silinir.

**Bitti sayılır:** Bir grup linkten oynadı, sıralama doğru, cevaplar ağ trafiğinden görülemiyor, süre dolunca her şey silinmiş.

### Aşama 4 — Canlı oda modu

> `feature/live-room` dalında üç parça halinde. **Parça A (13 Kasım 2026):** şema, oda kurma/katılma,
> lobi, canlı sinyal (public Broadcast + gizli `channel_id`), 5 sn yoklamaya düşme, yeniden bağlanma,
> admin devri; sunucu canlıda, ön yüz dalda. Ayrıntı ve doğrulama: `docs/supabase.md` → "Canlı oda".
> **Parça B (13 Kasım 2026):** başlatma (mod alt sınırı sunucuda), rastgele halka ataması, yazma
> ekranı (büyük hedef, Klasik'te "1/3"), sinyalsiz taslak kaydı, hazır/düzenlemeye dönme, sunucu
> saatine göre geri sayım, admin erken bitirme, argo süzgeci, cron'suz aşama geçişi; sunucu canlıda.
> **Parça C (13 Kasım 2026):** açılış (her hücre iki adım: maddeler + tahmin → admin "Aç" → foto,
> isim ve bilenler; "Sıradaki"), oyuncu listesinden tek dokunuşla değiştirilebilir tahmin, admin için
> "x/y tahmin etti", madde gizleme (ekrandan ve sonuçtan), ara skor şeridi, çevirme animasyonu ve
> bilene vurgu (azaltılmış harekete uyar), BITTI'de skor tablosu, dolu pusula, PNG, düzenleyiciye
> aktarma, "Odayı şimdi sil", 30 dk sonra silinme. Sunucu 13 Kasım 2026'da canlıya alındı; API,
> 6 kişilik tam oyun, admin devri ve 2×2/3×3/4×4 PNG canlıda doğrulandı (`docs/supabase.md`);
> ön yüz dalda.
> **Kararlar (C):** o hücreye madde yazmakla görevli olan tahmin edemez (cevabı biliyor); hedefin
> kendisi edebilir. Hücre başına tahmin edebilecek kişi 2'den azsa (Klasik + 4 oyuncu) oda
> **tahminsiz** oynanır: başlatırken sunucu hesaplar (`rooms.guessing`); açılışta tahmin adımı yok,
> admin "Aç" ile tek tek açar, skor şeridi ve tablosu yok; lobide "4 kişiyle Klasik modda tahmin
> yok…" notu. Tahminli odada son hücrede tahmin adımı yok (tek aday), doğrudan açılır ("Son kişi").
> Açılmış kişiler adaylardan düşer. 1 doğru = 1 puan. Madde kimliği istemciye gitmez (yazarlığı
> ele verirdi); gizleme hücre içi rastgele sırayla yapılır. Yazarlık oyun bittikten sonra da
> gösterilmez. Tam oyun (6 kişi, Klasik) ~200 Edge Function çağrısı.
> **Geçici gizli giriş:** "Canlı oda kur" menüde yalnızca cihazda bayrak varsa görünür
> (`/?oda=1` yazar, `/?oda=0` siler; `src/lib/roomFlag.ts`). `/r/{kod}` bayraksız çalışır.
> Cihazda denenip onaylanınca bayrak ve `roomFlag.ts` ayrı bir işle kaldırılacak.

"Ortak doldurma" fikrinin yerine geçer.

Akış:

1. Admin oda kurar; ayarları seçer (mod, süre, küfür/argo izni).
2. Oyuncular kodla girer: tanınan adını yazar, kendi fotoğrafını yükler.
3. Admin oyunu başlatır; atamalar dağıtılır.
4. Yazma aşaması: süre dolana ya da herkes onaylayana kadar.
5. Açılış: admin kutuları sırayla açar.
6. Sonuç: skorlar ve pusulanın PNG'si (imzalı, oyuncuların cihazında üretilir). Ardından oda verisi silinir.

Modlar:

- **Klasik (varsayılan):** Her oyuncuya 3 kişi düşer, her birine 1 madde yazar. Oyuncular karıştırılıp halkaya dizilir; herkes kendinden sonraki 3 kişiye yazar. Kimse kendine yazmaz, herkes tam 3 madde alır. En az 4 oyuncu.
- **Hızlı:** Her oyuncuya 1 kişi düşer, ona 3 madde yazar. En az 3 oyuncu.

Açılış sırasında:

- Önce maddeler görünür, herkes "bu kim" tahmini yapar; sonra foto ve isim açılır, doğru bilenler puan alır.
- İsteğe bağlı: "bu maddeyi kim yazdı" tahmini ve en iyi madde oylaması.

Ayarlar ve sınırlar:

- **Oyuncu sayısı:** En fazla 16. 4 kişiye kadar 2×2, 9'a kadar 3×3, üstü 4×4.
- **Küfür/argo izni:** Oda kurulurken anahtar. Arkadaş modunda varsayılan açık, yayıncı modunda kapalı. Filtre kaba bir süzgeçtir, tek güvence değildir.
- **"Bu maddeyi geç":** Admin için her durumda var.
- **Yayıncı modu:** Konular oyunculardan ayrıdır; admin konu listesini kendi belirler (ekibi, bir dizinin karakterleri), izleyiciler madde yazar. Maddeler yayına çıkmadan moderatör onayından geçer.

Teknik:

- Oda durum makinesi: `LOBI → YAZMA → ACILIS → BITTI`.
- Supabase Realtime ile canlı bağlantı, sunucu taraflı sayaç, bağlantısı kopanın aynı kimlikle geri dönmesi.
- Yazar bilgisi yalnızca sunucuda tutulur; oyun bitene kadar hiçbir istemciye gitmez.

**Bitti sayılır:** 6+ kişilik gerçek bir grup, bir oyuncunun bağlantısı kopup geri geldiği halde oyunu baştan sona oynadı; oyun sonunda oda verisi silindi.

### Aşama 5 — Yayılma

- **İngilizce (i18n):** Arayüz metinleri dosyaya taşınır, tarayıcı diline göre TR/EN, İngilizce madde havuzları.
- **Dizi/film şablonları:** Karakter adları ve bölge etiketleri hazır gelir, fotoğrafı kullanıcı ekler (oyuncu fotoğrafı barındırılmaz).
- **Kişi havuzu:** Arkadaşları bir kez kaydet, her pusulada seç (yalnızca cihazda).
- **Ek temalar** ve çıktı boyutları (dikey hikâye formatı).

## 5. Veri modeli (Aşama 2-4)

Her varlıkta bir bitiş zamanı bulunur; silme görevi buna bakar.

| Varlık | Alanlar |
|---|---|
| Oyun (snapshot) | kod, başlık, boyut, bölgeler, hücreler (isim, maddeler, fotoId), bitiş zamanı, silme anahtarı |
| Foto | id, oyun/oda bağı, dosya yolu |
| Tahmin | oyun kodu, oyuncu adı, cihaz kimliği, cevaplar, skor, ipucu sayısı |
| Oda | kod, admin anahtarı, mod, süre, küfür izni, durum, konu listesi, bitiş zamanı |
| Oyuncu | oda, ad, fotoId, oturum anahtarı, bağlantı durumu |
| Atama | oda, yazar, hedef, madde metni, onay durumu, geçildi mi |

## 6. Gizlilik ve güvenlik

- Linkler ve oda kodları tahmin edilemez; arama motorlarına kapalı (`noindex`).
- Saklama süreleri "Verilen kararlar" bölümündeki gibidir; silme otomatiktir, yedek tutulmaz.
- Canlı odada herkes yalnızca kendi fotoğrafını yükler.
- Tahmin oyununda kurucuya yayınlamadan önce pusuladaki kişilerin haberdar olması hatırlatılır.
- RLS her tabloda açık; tarayıcı tablolara ve dosyalara doğrudan erişemez.
- Yükleme boyutu ve istek hızı sınırlıdır.
- Kullanım sayacı çerezsizdir ve kişisel veri tutmaz.
- Uygulama büyür ya da yayıncılar kullanmaya başlarsa bir hukukçuya danışılacak.

## 7. Açık kararlar

1. **i18n zamanı:** Aşama 5'te mi, yoksa yurt dışı ilgi görülürse öne mi alınsın?
2. **Varsayılan link süresi:** 24 saat önerildi; kullanım testine göre değişebilir.

## 8. Başarı ölçütleri

- Pusulaya başlayanların kaçı PNG indirdi?
- Bir cihazdan ikinci pusula yapılma oranı.
- Tahmin linki başına oynayan kişi sayısı.
- İmzadaki adresten gelen yeni ziyaretçi sayısı.