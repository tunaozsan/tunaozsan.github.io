# Stripe Tax Basic — staging doğrulaması, 31 Ekim 2026

## Kapsam ve son durum

Yalnız mevcut staging Worker/D1/R2 ve `acct_1UVrQ3BxU4PsnoX0` Sandbox üzerinde vergi entegrasyonu değiştirildi. Production Worker deployment, D1/R2, Stripe Live ürün/fiyat/Payment Link kayıtları, Mercury, DNS ve Apple yolları değiştirilmedi. Kullanıcının Google ekranındaki hatalı form girişine ayrıca müdahale edildi: mevcut OAuth istemcisinde production callback doğru **Authorized redirect URIs** alanına kaydedildi, staging callback korundu; bu bir Worker deployment veya tamamlanmış OAuth bağlantısı değildir.

- Branch: `codex/stripe-tax-basic`; başlangıç/production kaynak tabanı: `9ea5b46`.
- Son staging version: `aa274a7e-b188-4d60-8120-e124c2878328`.
- Production version değişmedi: `ea542759-f4af-42c7-ab3f-a538d89486de`.
- `PORTAL_ENABLED=false`, `LEGAL_APPROVED=false`, `STAGING_TAX_TEST_UNTIL=0`. Müşteri intake bu tur boyunca açılmadı. Access + aynı origin + exact Sandbox hesabı + süre sınırı arkasındaki admin aracı yalnız sentetik siparişler oluşturdu. Test sonunda yetkili tarayıcıda dahi `test_window_closed` dönüyor.
- Webhook ve `*/15 * * * *` Cron açık; mevcut Drive/Delivery true binding'leri ve Secrets korundu. Her yeni sentetik order TTL değeri 43200 saniye; zamanlar değiştirilmedi, elle R2 cleanup yapılmadı.
- Hiç gerçek kart/self-payment veya ücretli Tax aboneliği başlatılmadı. İki Sandbox ödemesi de tamamen iade edildi.

## Uygulama

Checkout `automatic_tax[enabled]=true`, `billing_address_collection=required`, `tax_id_collection[enabled]=true`, `tax_id_collection[required]=never` kullanır. Native `consent_collection[terms_of_service]=required` korunur. İşletme tax ID'si Stripe'ın desteklediği yerlerde isteğe bağlıdır; D1'e tax ID veya kart verisi yazılmaz. `adaptive_pricing[enabled]=false` ile yayınlanmış USD tutarları korunur.

Consulting Services kodu `txcd_20060048`, işletme sahibinin seçimine göre doğrulanır. Product/Price'ta override yoksa Stripe hesabının sunucudan alınan varsayılanları uygulanır: `inferred_by_currency` + USD vergi hariçtir. Açıkça inclusive veya farklı tax code bulunan kayıtlar varsayılanla örtülmez. Eksik/belirsiz ayarlar Checkout'u durdurur. Yeni production Checkout manuel/boş vergi moduna sessizce düşemez; geçmiş ödeme webhook kayıtları yeniden sınıflandırılmaz.

D1'e eklemeli `0008_stripe_tax_evidence.sql` eklendi:

- `checkout_tax_requirements`: order, quote hash, Session bağı, automatic tax gereksinimi, consulting code ve exclusive davranışı. Intake kapansa veya env değişse bile webhook bu kayda uyar.
- `payment_tax_evidence`: Stripe'tan yeniden sorgulanan subtotal/tax/total, `automatic_tax.status=complete`, her tax breakdown'ın gerçek `taxability_reason` değeri, ülke/eyalet, merchant/Session/event/REST version ve doğrulama zamanı. UPDATE trigger'ı kaydı değiştirilemez tutar. Refund ilk ödeme kanıtını değiştirmez; ayrı refund hold/event kayıtları korunur.
- Vergi sonucu eksik/failed/requires_location_inputs veya tutar/gerekçe uyuşmazlığı varsa PAID, kabulün Stripe doğrulaması ve fulfillment güncellemesi yapılmaz. Vergi API hatası sıfır kabul edilmez. Hosted Checkout adres/vergi hesaplamasını ödeme öncesinde yapar; webhook kontrolü zaten tahsil edilmiş bir işlemi geriye dönük olarak “engelledik” iddiasında bulunmaz.
- Korunan admin sipariş detayında vergi kanıtı da döner. REST sürümü `2025-02-24.acacia` değişmedi; webhook yolu intake kapanışından etkilenmedi.

## Gerçek testler

| Test | Sonuç | Kanıt ve sınır |
|---|---|---|
| Sandbox kimliği ve Tax setup | PASS | Exact account; active, Consulting Services, exclusive. Başlangıçta Sandbox head office eksikti. Yalnız Sandbox'ta sentetik Sioux Falls/SD test adresi ve `taxreg_1UWVNHBxU4PsnoX0BVIXe9TF` kaydı kuruldu; gerçek hukuki kayıt veya NM registration değildir. |
| Mevcut 22 Sandbox Product/Price | PASS | Tutar/ID/currency korunarak consulting/exclusive doğrulandı. Yeni Product, Price veya Payment Link oluşturulmadı. |
| Vergili Checkout → gerçek webhook → D1 | PASS | Order `d28bc192-a5e6-48c5-8a08-0301d985f030`: USD 199.00 subtotal + 12.34 tax = 211.34 total; Stripe `standard_rated`, automatic tax complete; D1 birebir eşleşiyor. |
| Sıfır vergili Checkout → gerçek webhook → D1 | PASS | Order `a06d2c86-81cf-49f5-b89f-390328ec076f`: USD 199.00 + 0.00 = 199.00; Oregon sentetik adresi için Stripe `not_subject_to_tax`; gerekçe varsayılmadı. |
| Eksik fatura adresi | PASS | İlk oturumda test kartı/consent ile boş adresli ödeme denemesi tamamlanmadı; Stripe `requires_location_inputs`, open/unpaid, D1 paid_at/taxEvidence null. |
| Vazgeçme / expire / webhook | PASS | Order `e598f07f-1b14-425c-bcdf-463abfaa60e3`; Checkout geri bağlantısı cancel sayfasına döndü. Geri dönmek Session'ı kendiliğinden expire etmez. Ardından sentetik unpaid Session API ile expire edildi; gerçek `evt_1UWVQLBxU4PsnoX0bAvn71WA` D1'de EXPIRED_UNPAID/PROCESSED. |
| Vergi dahil tam refund | PASS | `re_3UWVRnBxU4PsnoX01wQUA13L`: succeeded, 21134 cents. Gerçek refund webhook sonrası kalıcı D1 hold=21134; ilk tax receipt JSON'u birebir korundu. |
| Sıfır vergili refund | PASS | `re_3UWVUHBxU4PsnoX00cnRI7b2`: succeeded, 19900 cents. D1 hold ve değişmeyen ilk vergi kaydı doğrulandı. |
| Onaysız admin fixture oluşturma | PASS | HTTP 400 synthetic_consent_required. Bu test müşteri portalı Turnstile testi olarak sunulmaz. |
| Fatura oluşturma | PASS — sınırlı | İki gerçek Sandbox Session invoice ID üretti. Bu tur PDF dosyasının görsel/indirme testi yeniden yapılmadı; önceki PDF kanıtı korunur. |
| Vergi arızası / eksik gerekçe / tutar manipülasyonu / duplicate | PASS — yerel | Failed, requires_location_inputs, eksik amount/reason/address, inclusive, yanlış toplam, devre dışı automatic tax, pending/HTTP-error settings, yanlış kod/price; PAID/receipt oluşmuyor. Duplicate idempotent. |
| Gerçek Stripe vergi servisi kesintisi | NOT RUN | Sağlayıcı arızası zorlanmadı; yukarıdaki hata testleri yerel kontrollü fixture'lardır. |
| Önceki ödeme/Drive/consent/refund/upload regresyonu | PASS | **112/112 Worker testi**, typecheck. Site **1111 assertion / 23 sayfa**, eski Apple gizlilik metinleri dahil. |
| Müşteri portalı public intake/Turnstile E2E | NOT RUN — bu tur | Intake kapalı; gerçek Stripe Checkout'a aynı upload/quote/checkout fonksiyonlarını kullanan yetkili sentetik fixture ile girildi. Önceki public portal testleri yeniden yapılmış gibi raporlanmaz. |
| Gerçek 12 saat / 30 gün / 90 gün bekleme | NOT RUN — bu tur | Önceki gerçek TTL ve simülasyon raporları korunuyor; yeni genel yayın engeli değildir. |

Gerçek finansal kanıt dosyaları: `tax-sandbox-paid-2026-10-31.json`, `tax-sandbox-zero-2026-10-31.json`, `tax-sandbox-refund-2026-10-31.json`, `tax-sandbox-zero-final-2026-10-31.json`, `tax-sandbox-cancel-2026-10-31.json`. Checkout URL, cookie, JWT, refresh token, API key veya webhook secret raporlanmadı.

## Live: bu tur yalnız okunan gerçek durum

`tax-live-readonly-2026-10-31.json` mevcut production admin API üzerinden alınmıştır. Stripe Live'a yazma isteği gönderilmedi.

- Merchant `acct_1UV444BzdKYgwVw6`, Tax settings **active**. Önceki raporlardaki pending artık güncel değildir.
- Default consulting code doğru; tax behavior `inferred_by_currency`, USD için exclusive. Mevcut 21 Live Price unspecified ve Product tax_code null olsa da bu doğru hesap varsayılanlarıyla uyumludur; sırf override boş diye ürünleri değiştirmek gerekmez.
- **Registrations listesi boş.** NM head-office adresi, NM vergi tescili kanıtı değildir. New Mexico GRT yükümlülüğü/kayıt/tahsil etmeme dayanağı bu tur doğrulanmadı veya oluşturulmadı. Stripe'ın sıfır sonucu tüm satışlar için hukuki muafiyet olarak kaydedilmez.
- **8 aktif Live Payment Link** aynı kaldı; toplam listede bir ek pasif link var. URL/ID/terms/automaticTax envanteri salt okunur JSON'da. Bu görevde kapatma, required-consent veya automatic-tax güncellemesi yapılmadı.
- 21 mevcut Live Product/Price var; `EXTRA-50-UPDATE-R` $150 hâlâ yok. Bu eklentiye özel eksik, diğer 21 kaydın bilinmediği anlamına gelmez. Önceki Products POST 403 tarihsel bulgudur; bu tur yazma tekrar denenmedi.
- Production webhook enabled; dört Checkout event'i ve charge.refunded, Acacia. Secret mevcut; değer okunmadı.
- Mevcut production giriş noktası başvuru alıyor, Checkout/intake kapalı. Yeni Tax kodu ve D1 0008 production'a uygulanmadı.

## Kalan gerçek işler ve yayın öncesi sınır

1. NM GRT ve ilk satışların müşteri/proje/hizmet kapsamına uygulanabilir kayıt veya tahsil etmeme dayanağı netleştirilmeli. Sıfır vergi tutarı veya yalnız Tax Basic aktivasyonu bunu kanıtlamaz. Hiçbir gerçek kayıt uydurulmadı; NM registration oluşturulmadı. Bağımsız vergi/hukuk uzmanı onayı **NOT_PERFORMED**.
2. Production uygulama/tekliften uygun order/Checkout'a geçiş yolu hâlâ kapalıdır; bunun kontrollü açılması, mevcut konum/scope/quote doğrulaması ve 0008'in production yedek sonrası uygulanması ayrı teknik yayın işidir. Bu rapor öncesinde production deployment yapılmaması talimatı korundu. Sadece TAX_MODE/PORTAL_ENABLED değiştirmek yeterli sayılmaz.
3. Google OAuth callback doğru alana kaydedildi (**PASS — config**), staging adresi korundu. Production Drive status hâlâ **NOT_CONNECTED**. Admin'de Connect personal Drive ile gerçek kullanıcı onayı ve callback/refresh/private-root doğrulaması **NOT RUN**. Client secret/scope değiştirilmedi, yeni istemci oluşturulmadı.
4. Yalnız eksik $150 eklentisi için gerçek Live Product/Price tamamlanmalı veya bu eklenti kapalı kalmalı. Diğer fiyatlar korunur. Live Checkout/native consent/invoice için gerçek müşteri işleminden önce kurulum kontrolleri, ardından ilk gerçek müşteri olayının gözetimi gerekir; sahte Live ödeme yapılmaz.
5. Sekiz eski Live Payment Link'in geçişi bu görev kapsamında uygulanmadı. D1 kabul/scope bağı olmayan eski link satışları portal fulfillment olarak kabul edilmez. Önceki kontrollü geçiş planı ancak ayrı uygun aşamada uygulanır.

## Yedek, migration ve rollback

Özel Git dışı yedek `.qa/tax-basic-20261031/`: Worker multipart SHA-256 `0ed85a3c4e6de54f4239cad0330ee9a77479ce67e04615b0f0e5beb15d9c63f8`, settings/deployments, production deployment karşılaştırma kaydı ve SQLite'a geri okunarak doğrulanmış `d1-before.sql`. Wrangler migration tracking listesinde 0005–0007 işaretli değildi; bunların yalnız CREATE IF NOT EXISTS kullanan eklemeli SQL'i idempotent olarak tekrar uygulandı, ardından 0008 eklendi. Eski veriler backfill edilmedi, silinmedi veya değişmiş kabul edilmedi.

Rollback'te önce yeni Checkout/test penceresi kapalı tutulur. Bekleyen otomatik vergili Session varsa vergi webhook doğrulaması eski koda dönülerek kaldırılmaz. Önce bu Session'lar/ödeme olayları uzlaştırılır; mevcut yeni tablolar ve finansal kanıtlar korunur. DB restore/destructive rollback yapılmaz; webhook/refund/Cron/Secrets korunur. Sandbox tax behavior exclusive olarak bir kez yazılan Price Stripe'ta geri unspecified yapılamaz; bu test kataloğu için bilinçli kalıcı Sandbox değişikliğidir, yeni fiyat oluşturulmaz. Production etkilenmez.

İlk terminal smoke çağrıları varsayılan Python User-Agent ile JSON olmayan 403 döndürdü; tarayıcı User-Agent ile aynı anonim health isteği 200 verdi. Uygulama yetkilendirmesi değiştirilmedi; son smoke sonuçları ayrı JSON'dadır. Geçici UI kapatma authenticated tarayıcıda ayrıca doğrulandı.

## Birincil kaynaklar

- [Stripe Tax test ortamı](https://docs.stripe.com/tax/testing): Sandbox ayarları/tescilleri Live'dan ayrıdır.
- [Checkout otomatik vergi](https://docs.stripe.com/tax/checkout/page): adres ve automatic_tax entegrasyonu.
- [Vergi kodu ve fiyat davranışı](https://docs.stripe.com/tax/products-prices-tax-codes-tax-behavior): hesap varsayılanları, USD exclusive, inclusive/exclusive değişmezliği.
- [Vergi kodları](https://docs.stripe.com/tax/tax-codes): Consulting Services = txcd_20060048.
- [Sıfır vergi gerekçeleri](https://docs.stripe.com/tax/zero-tax): not_collecting ve not_subject_to_tax farklıdır; boş kayıt listesi evrensel muafiyet değildir.
