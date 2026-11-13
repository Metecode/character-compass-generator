import type { ReactNode } from 'react'
import { PageShell } from './PageShell'

/** İletişim adresi: proje sahibi dolduracak. Boşken "—" görünür. */
const CONTACT = ''

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-black tracking-tight">{title}</h2>
      <div className="mt-2 flex flex-col gap-2 text-[15px] leading-relaxed">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <PageShell title="Gizlilik" noindex>
      <h1 className="text-2xl font-black tracking-tight">Gizlilik</h1>
      <p className="mt-2 text-[15px] leading-relaxed">
        Character Compass’ta hesap yok, çerez yok. Kısaca: pusulan cihazında kalır; yalnızca sen
        “Oyun linki oluştur” dediğinde seçtiğin süre boyunca, “Canlı oda kur” dediğinde ya da bir
        odaya katıldığında da oyun bitene kadar sunucuya gider.
      </p>

      <Section title="Pusula yaparken (varsayılan)">
        <p>
          Pusula, isimler, maddeler ve fotoğraflar yalnızca bu tarayıcıda saklanır (localStorage ve
          IndexedDB). Hiçbir sunucuya gönderilmez. PNG çıktısı da cihazında üretilir.
        </p>
      </Section>

      <Section title="Oyun linki oluşturunca ne işleniyor?">
        <ul className="list-disc pl-5">
          <li>Pusulanın başlığı, ızgara boyutu, bölge renkleri ve etiketleri</li>
          <li>Hücrelerdeki isimler ve maddeler</li>
          <li>Hücrelerdeki fotoğraflar (400×400 JPEG) ve ipucu için bulanık küçük sürümleri (32×32)</li>
          <li>
            Kötüye kullanımı sınırlamak için IP adresinin tuzlanmış özeti. Ham IP adresi
            saklanmaz; özet en geç 1 gün içinde silinir.
          </li>
        </ul>
        <p>
          Veriler Supabase üzerinde, Avrupa Birliği’nde (Frankfurt) tutulur. Fotoğraflar herkese açık
          bir adreste durmaz.
        </p>
      </Section>

      <Section title="Oyunu oynayınca ne işleniyor?">
        <ul className="list-disc pl-5">
          <li>Oyuncunun yazdığı ad (sıralamada görünür)</li>
          <li>Cevapları, açtığı ipuçları, puanı ve oyuna başlama zamanı (çözme süresi için)</li>
          <li>
            Cihaz kimliğinin özeti: tarayıcı rastgele bir kimlik üretip bu cihazda saklar; sunucuda
            yalnızca oyuna bağlı özeti tutulur. Her cihazın bir kez oynaması bununla sağlanır.
          </li>
          <li>Kötüye kullanımı sınırlamak için IP adresinin tuzlanmış özeti (en geç 1 günde silinir)</li>
        </ul>
        <p>
          Bunlar oyunun süresi boyunca tutulur ve oyunla birlikte silinir. Oyunu kuran kişi bir
          oyuncuyu sıralamadan kaldırabilir; o zaman o tahmin hemen silinir. Fotoğraflar oyuncuya
          yalnızca tahminini gönderdikten sonra, 10 dakika geçerli adreslerle gösterilir.
        </p>
      </Section>

      <Section title="Canlı odada ne işleniyor?">
        <ul className="list-disc pl-5">
          <li>Odayı kuranın ve katılanların yazdığı ad ile kendi yüklediği fotoğraf (400×400 JPEG)</li>
          <li>Oda ayarları (mod, yazma süresi, küfür-argo izni) ve oyunun hangi aşamada olduğu</li>
          <li>
            Oyuncuların yazdığı maddeler (yazarken taslak olarak da kaydedilir; argo kapalı odada
            otomatik bir süzgeçten geçer), “bu kim” tahminleri ve puanlar
          </li>
          <li>
            Oturum anahtarının özeti: odaya girince tarayıcına rastgele bir anahtar verilir ve bu
            cihazda saklanır; sunucuda yalnızca özeti tutulur. Sayfa yenilense de aynı yerine bununla dönersin.
          </li>
          <li>Son görülme zamanı (kimin bağlı olduğunu göstermek ve adminliği devretmek için)</li>
          <li>Kötüye kullanımı sınırlamak için IP adresinin tuzlanmış özeti (en geç 1 günde silinir)</li>
        </ul>
        <p>
          Herkes yalnızca kendi fotoğrafını yükler. Odaya katılmamış biri linki açarsa yalnızca odayı
          kuranın adını ve kaç kişinin katıldığını görür; adlar ve fotoğraflar katılmadan gösterilmez.
          Kimin hangi maddeyi yazdığı hiçbir oyuncuya, oyun bittikten sonra da gönderilmez.
        </p>
        <p>
          Canlı bağlantı için Supabase Realtime kullanılır; bu kanaldan yalnızca “bir şey değişti”
          sinyali geçer, ad, fotoğraf ya da madde geçmez.
        </p>
      </Section>

      <Section title="Ne kadar tutuluyor?">
        <p>
          Linki oluştururken seçtiğin süre kadar: 1 saat, 24 saat ya da 72 saat. Süre dolunca link
          hemen kapanır; fotoğraflar, metinler, oyuncu adları ve cevaplar en geç 15 dakika içinde
          kendiliğinden silinir.
          Yedek tutulmaz.
        </p>
        <p>
          Canlı oda: oyun bittikten 30 dakika sonra, her durumda oda kurulduktan en geç 2 saat
          sonra; adlar, fotoğraflar, maddeler ve tahminler birlikte silinir (silme görevi 15
          dakikada bir çalışır). Lobiden çıkan ya da çıkarılan oyuncunun fotoğrafı hemen silinir.
        </p>
      </Section>

      <Section title="Nasıl silinir?">
        <p>
          Linki oluşturduğun cihazda “Oyun” menüsünden “Oyunlarım”a gir ve “Şimdi sil”e bas. Oyun;
          fotoğrafları, oyuncu adları ve cevaplarıyla birlikte hemen silinir. Silme anahtarı yalnızca o cihazda durur; sunucuda
          yalnızca özeti vardır.
        </p>
        <p>
          Canlı odada admin “Odayı sil”e basınca oda her şeyiyle hemen silinir. Oyun başlamadan
          “Odadan çık” dersen adın ve fotoğrafın hemen silinir. Oyun sonunda indirdiğin PNG ya da
          düzenleyiciye aktardığın pusula yalnızca senin cihazında kalır; sunucuya gönderilmez.
        </p>
        <p>
          Pusulada sen varsın ve silinmesini istiyorsan linki paylaşan kişiye ya da aşağıdaki adrese
          yazabilirsin. Her durumda içerik seçilen süre sonunda silinir.
        </p>
      </Section>

      <Section title="İletişim">
        <p>{CONTACT || 'i.meteucar@gmail.com'}</p>
      </Section>
    </PageShell>
  )
}
