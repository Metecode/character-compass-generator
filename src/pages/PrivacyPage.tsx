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
        “Oyun linki oluştur” dediğinde, seçtiğin süre boyunca sunucuya gider.
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
            saklanmaz; özet en geç 1 saat içinde silinir.
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
          <li>Kötüye kullanımı sınırlamak için IP adresinin tuzlanmış özeti (en geç 1 saatte silinir)</li>
        </ul>
        <p>
          Bunlar oyunun süresi boyunca tutulur ve oyunla birlikte silinir. Oyunu kuran kişi bir
          oyuncuyu sıralamadan kaldırabilir; o zaman o tahmin hemen silinir. Fotoğraflar oyuncuya
          yalnızca tahminini gönderdikten sonra, 10 dakika geçerli adreslerle gösterilir.
        </p>
      </Section>

      <Section title="Ne kadar tutuluyor?">
        <p>
          Linki oluştururken seçtiğin süre kadar: 1 saat, 24 saat ya da 72 saat. Süre dolunca link
          hemen kapanır; fotoğraflar, metinler, oyuncu adları ve cevaplar en geç 15 dakika içinde
          kendiliğinden silinir.
          Yedek tutulmaz.
        </p>
      </Section>

      <Section title="Nasıl silinir?">
        <p>
          Linki oluşturduğun cihazda “Oyun” menüsünden “Oyunlarım”a gir ve “Şimdi sil”e bas. Oyun;
          fotoğrafları, oyuncu adları ve cevaplarıyla birlikte hemen silinir. Silme anahtarı yalnızca o cihazda durur; sunucuda
          yalnızca özeti vardır.
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
