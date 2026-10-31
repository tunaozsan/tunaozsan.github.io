# Güncel sonuç — 31 Ekim 2026: production teknik yayın tamam; tahsilat kapsamı henüz yok

Bu bölüm aşağıdaki tarihsel raporlardan önceliklidir. Önceki production yayın yetkisi kullanıldı. **Başvurular açık; hiçbir ürün/müşteri kapsamı henüz canlı tahsilata açık değil.** Eksikler: teyit edilmemiş uygulanabilir işlem-vergi dayanağı, kesinleşmemiş ilk müşteri/proje konumu ve son Dashboard kontrolünde Read olduğu görülen Live anahtarın Payment Intents Write iznidir. Secret değeri eksik değildir. Genel sıfır vergi veya yalnız ABD'de vergi kuralı oluşturulmadı.

- Production portal: https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/project-portal/
- Admin: https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/admin/ — production Drive CONNECTED, gerçek refresh ve private production root PASS.
- Çalışan kod: **9351dd4** (ana uygulama değişikliği d472285; önceki Tax commit f9748a2). Production Worker **6a2c82f4-ed4d-489a-a3ca-d4fa1e7dd13b**, %100. Staging **307d1b96-c53d-4095-8caa-1d5d4e5fe272**, sipariş/test penceresi kapalı.
- Production migrations: **0008_stripe_tax_evidence.sql, 0009_application_orders.sql, 0010_order_invoices.sql PASS**. Remote ledger 0001–0010. Önceki 2 başvuru korunuyor; 0 order / 0 acceptance / 0 invoice / 0 approval. Geçmiş ödeme veya sözleşme kabulü değiştirilmedi.
- 22 Live Product / 22 Live Price doğrulandı. Yalnız eksik EXTRA-50-UPDATE-R ($150) oluşturuldu; diğer 21 kayıt ve yedi temel fiyat korunuyor. Katalogda aktif olmak satış yetkisi değildir.
- Sekiz eski Live Payment Link **inactive**. 16 açık/ödenmemiş Session expire edildi; taramada paid=0, pending=0; kapatma sonrası open=0. Hiçbir ürün/fiyat/ödeme geçmişi silinmedi, portal kabulü uydurulmadı.
- Sözleşme `service-terms-2026-10-30-v2`, SHA-256 `85197b0cc77544c400f826dab4a50091d13d916f326fc0ac5cea4ebfab1d7f9c`. Owner adoption korundu; bağımsız hukuk/vergi görüşü **NOT_PERFORMED**.

| Kontrol | Sonuç | Kanıt / sınır |
|---|---|---|
| Production yedek + ledger/schema + eklemeli migration | PASS | İki özel D1 export integrity=ok; eski tablolar düşürülmedi veya yeniden oluşturulmadı |
| Production Google OAuth / gerçek refresh / private root | PASS | Authenticated Admin verify; production DB yalnız production-root, staging DB yalnız staging-root; token/klasör taşınmadı |
| Başvuru → onaylı immutable kapsam → tek kullanımlık davet → order → R2 upload → Checkout | PASS — gerçek staging | f0fee6a1-3a6f-4e33-8f90-bfd2292cddd6; public intake kapalı, Access korumalı sentetik fixture |
| Onaylı adreste manual authorization → verified webhook capture → D1 | PASS — gerçek Sandbox | $199 + $12.34 = $211.34; Acacia REST, Snapshot webhook; standard_rated; paid_at yalnız verified sonuçtan |
| Checkout adres değişikliği | PASS — gerçek Sandbox | d3b29586-8b3a-446a-86a6-61b69c0a2151; requires_capture → canceled; received=0; TAX_REVIEW_REQUIRED; PAID/invoice/tax record/Drive transfer yok |
| Scope/quote/address immutable bağ; expired/revoked onay; release retry | PASS — yerel | 0009 immutable trigger, scope/customer/quote hash'leri; ilk ret nedeni artık korunur; doğrulanmış provizyon iptalinden sonra webhook ACK/dedup. Yeni ACK davranışının provider redelivery'si bu tur ayrıca gözlenmedi |
| PDF fatura | PASS — gerçek staging | Admin'den indirilen 12,284-byte PDF; $199/$12.34/$211.34 ve gerçek order; görsel kontrol. D1 invoice snapshot SHA-256 c19189d167cd38c5ae795d83438c62c2a162ba05f0820dffb77c0afe0a4d312b |
| R2 → Drive | PASS — gerçek staging | Mevcut sentetik XER VERIFIED; attempts=2; SHA-256 783eab3c8872eb378429ed29069e41098e87f1430522eae4b98feace25f5657e; TTL değiştirilmedi |
| Tam refund / D1 hold / değişmeyen tax ve invoice | PASS — gerçek Sandbox | re_3UWWFFBxU4PsnoX00ZCTXqK6, $211.34 succeeded; webhook hold; orijinal vergi/fatura korunur. İade sonrası PDF durum göstergesi son yerel testte PASS |
| Stripe Live native terms ve public legal config | PASS — yapılandırma | Kod terms required; Sandbox gerçek checkbox/kabul PASS. Live Dashboard Terms/Privacy/Support kaydedilip yeniden açılarak doğrulandı. Gerçek Live Checkout Session **NOT RUN** |
| Yedi fiyat / consulting tax code / USD exclusive / optional business tax ID | PASS | Yeni Live fiyat 15000 USD exclusive, txcd_20060048; diğer 21 fiyat korunur; automatic_tax=true, required billing address; tax hatasında ödeme açılmaz |
| Legacy Link kontrollü kapatma | PASS — gerçek Live API | 8 inactive, 16 açık unpaid Session expire; hiçbir D1 consent backfill yok |
| Regresyon, typecheck, site/Apple | PASS | **128/128 Worker**, typecheck ve format:check;  **1111 assertion / 23 sayfa**; son public Privacy/Support/Contact/Terms HTTP kontrolleri PASS |
| Son ortam kapanışı / kaynak ayrımı / Cron | PASS | Prod PORTAL=false + APPROVED_ORDERS=false; stage PORTAL=false + LEGAL=false + test_until=0; her iki Cron */15; webhook/refund açık; R2 TTL 43200 |
| Gerçek Live tahsilat / ilk müşteri faturası / production paid-file transfer | NOT RUN | Sahte gerçek kart veya self-payment yok; henüz uygun gerçek sipariş yok |
| Yeni gerçek 12 saat / 30–90 günlük bekleme | NOT RUN — bu tur | Önceki gerçek TTL ve staging/simülasyon kanıtları korunur; yeni genel yayın engeli yapılmadı |

## Son izin ve operasyon kontrolü

**FAIL — Live yetki önkoşulu:** mevcut “Secret Key For Claudfare” anahtarının Payment Intents izni Read. Onaylı manual capture ve uyumsuz provizyon cancel için Write gerekiyor. Checkout Sessions ve Customers Write mevcut. Yalnız Payment Intents genişletmesi için özel onay istendi; izin değiştirilmedi. Gerçek Live capture **NOT RUN**; sahte ödeme oluşturulmadı. Kanıt: [Live izinler](live-payment-permissions-2026-10-31.json).

Production operations son yetkili kontrolde alerts=[]; cleanup delete/orphan/session failures=0. İade sonrası PDF için ek gerçek indirme girişiminde tarayıcı zaman aşımı: bu ek kontrol **NOT RUN**; önceki gerçek PDF ve son yerel refund-status testi PASS olarak korunur.

## Teknik kararlar ve düzeltilen test hataları

Stripe Acacia, manual capture ile `invoice_creation` parametresini (false dahil) birlikte reddetti. Onaylı siparişlerde adres/vergi kapsamını tahsilattan **önce** doğrulamak için manual capture korunuyor; bu siparişlerin PDF faturası mevcut Worker içinde, Stripe tarafından doğrulanmış tutar ve immutable D1 kabul snapshot'ından üretiliyor (`REVIEWED_INVOICE_MODE=portal_pdf`). Parametre tamamen kaldırıldı. Eski Stripe invoice ID'leri ve akışı korunuyor; REST sürümü yükseltilmedi, yeni platform/ücretli abonelik yok. İade sonrası orijinal fatura değişmez; mevcut hold göstergesi ayrı okunur. Müşteri PDF erişimi kendi capability'si ve ilk 12 saat ile sınırlı, sonrasında yetkili Admin üzerinden sağlanır. PDF fontu desteklemediği karakterde sessiz veri bozmak yerine açık hata verir.

İlk başarısız synthetic Checkout denemelerinin idempotency key'i parametre değişimini reddetti; yeni reviewed-PDF yoluna sürümlü key verildi. Controlled fixture quote yanlışlıkla kapalı genel staging env kullanıyordu; düzeltildi. Bu test fixture'ının yeniden denemesi order.consent_at pointer'ını değiştirmişti: asıl mevcut acceptance satırı hiç değiştirilmeden **yalnız bu turdaki sentetik order pointer'ı** aynı gerçek kabul zamanına bağlandı. Kod artık ilk kabul zamanını koruyor; tekrar ödeme/fulfillment regresyonu PASS. Diğer tarihsel staging/production kayıtları değiştirilmedi. Ret webhook tekrarının ilk adres ret nedenini ezmesi düzeltildi; eski testte önceden yazılmış neden geriye dönük yeniden üretilmedi.

Restricted Live API Product POST tekrar 403 verdi. Mevcut yetkili Stripe Dashboard oturumundan yalnız izin verilen eksik ürün oluşturuldu ve API ile yeniden okundu: `prod_VXbTMNDddMX6Zp` / `price_1UWWGOBzdKYgwVw67E2P15jO`. SKU metadata ve açık Product/Price eşleşmesi var; lookup_key null olduğu için varmış gibi raporlanmadı. 22 ayrı Payment Link oluşturulmadı. Eski sekiz linkin ilk toplu kapatma isteği yarıda kaldı; kalan işlemler link başına sınırlandırılmış tekrarlarla tamamlandı ve bağımsız envanter active=0 doğrulandı.

Python public HTTP istemcisi Cloudflare 1010 reddi aldı; standart curl ve yetkili tarayıcıyla gerçek health/API sonuçları doğrulandı. Cloudflare güvenlik kuralı değiştirilmedi. Ham Cloudflare settings yedeği denemesi otomatik güvenlik incelemesinde secret riskiyle reddedildi; güvenli çözüm yalnız allowlist public ayarları ve secret **adlarını** kaydetti. Hiçbir secret/cookie/JWT rapora veya Git'e konmadı.

## Gerçekten kalan insan bilgisi

[İşletme sahibi beyanı](owner-nm-facts-2026-10-31.md): NM adresi yalnız posta/registered-agent; NM ofis/çalışan/hizmet ifası yok; 2025 NM kaynaklı satış $0; kuruluş sağlayıcısının kayıt yapıp yapmadığı bilinmiyor; yazılı kayıt gerekmeme değerlendirmesi ve kesin ilk müşteri/proje konumu yok. **Muafiyet veya bağımsız uzman görüşü değildir.**

Tek toplu eksik listesi: (1) Live anahtarda yalnız Payment Intents → Write yetkisi; (2) kuruluş sağlayıcısından NM vergi kaydı/BTIN durumunun belgeyle teyidi; ilk hedef müşteri fatura ülke/eyaleti ve proje/çıktı kullanım yeri; bu hizmet ve konuma uygulanacak kayıt/tahsil veya tahsil etmeme dayanağı. Stripe registrations=[] muafiyet sayılmaz; Sandbox SD Live'a kopyalanmadı. Şirket gelir vergisi, işlem vergisi yerine kullanılmadı. Mevcut owner yayın onayı tekrar istenmez. Google veya Stripe secret ekleme görevi kalmadı. Bağımsız avukat/mali müşavir onayı verilmiş gibi kaydedilmedi.

## Geri dönüş

- Hemen önceki güvenli kapalı-intake Worker: **294827b4-4a4c-40a0-b151-f30baef179f4**. Tur öncesi snapshot: **ea542759-f4af-42c7-ab3f-a538d89486de**. Her rollback'te intake/approved gates false; webhook/refund/Cron korunur. Açık yeni Session varsa uyumlu işleme kodunu tutun; eski Tax/consent korumasız kodla aktif satış açmayın.
- Özel Git dışı yedekler: `.qa/tax-production-20261031/d1-before.sql` SHA-256 e1454ea4eaaa84e4aaeb7711e162cec7fa7f3b5daf8d0ea58b5df561da1e80b9; `d1-before-0010.sql` SHA-256 2bbb10a37f5d770f8fce20c1fe0000dad0950b29ff9d6b275dd95c348bc55822; Worker multipart 9988027c7dd2174eaad43d3079ed12a782cbd66ad8f572420b759f85b9db4e73.
- Eklemeli D1 tabloları rollback'te düşürülmez; eski yedek yeni ödeme/kabul/Google kayıtlarının üstüne yazılmaz. Legacy linkler otomatik yeniden açılmaz. Mercury payout, vergi sınıflandırması, DNS ve Apple yolları değişmedi.

Kanıtlar: [ortam/migration audit](production-technical-audit-2026-10-31.json), [public smoke](production-smoke-2026-10-31.json), [Google](production-drive-verification-2026-10-31.json), [Sandbox ödeme/iade](reviewed-sandbox-paid-refunded-2026-10-31.json), [adres reddi](reviewed-sandbox-address-rejected-2026-10-31.json), [Live katalog](live-catalog-final-2026-10-31.json), [legacy links](legacy-links-retired-2026-10-31.json), [public legal URL'ler](stripe-live-public-links-2026-10-31.json).

---

