# Sınırlı production yayını — 30 Ekim 2026

## Yetki ve kapsam

İşletme sahibi `BLUEFIN_TUNA_CODEX_GO_LIVE_FINAL.md` paketini uygulama/yayımlama talimatıyla benimsedi; ardından toplu eksik listesindeki adres/yayın teyidine “onaylıyorum” yanıtını verdi. Bu, işletme sahibi yayım yetkisidir. Bağımsız avukat veya mali müşavir incelemesi **NOT_PERFORMED**. Genel onay eksik secret, Google kullanıcı izni, Stripe merchant doğrulaması veya işlem-vergi dayanağı yaratmaz.

Bu sürüm **başvuru yayınıdır; tam ticari tahsilat açılışı değildir**. Yedi ana hizmet ve uyumlu ekler server quote ile başvuruya alınır. Tüketici başvuruları ayrı inceleme gerekçesiyle kabul edilir. Score pilotu sunulmaz. Update malzeme mapping'i inceleme gerektirir. Sunucu `TAX_REVIEW_REQUIRED` kaydı oluşturur; hiçbir başvuru PAID, dosya transferi veya iş emrine dönüşmez.

Production portal: https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/project-portal/

Başvuru inbox: https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/admin/applications/

Ana site: https://bluefintuna.life/ — mevcut site çalışıyor; yeni main yayını GitHub Contents yazma izni nedeniyle 403 ile bekliyor.

Yerel release commit: `f53ce895091905cc655bed0d7fccd19a50ad2971`. Son Worker sürümü: `0ba44440-13b5-4b12-b8b9-cc1263d85795`; deployment `f878bc5d-42df-4661-b8f3-7de350d8a06c`.

## Politika ve kanıt

- Yeni sürüm: `service-terms-2026-10-30-v2`, yürürlük/publication UTC tarihi: **2026-10-30**.
- Immutable UTF-8 JSON bundle SHA-256: `85197b0cc77544c400f826dab4a50091d13d916f326fc0ac5cea4ebfab1d7f9c`.
- `APPROVED` / `LEGAL_APPROVED=true`: yalnız owner publication gate; uzman tasdiki değildir.
- Eski v1 dosyası/hash'i ve geçmiş staging kabul kanıtları değişmedi. Eski satışlara yeni kabul eklenmedi.
- Başvuruda boş başlayan required checkbox; ayrı business-use beyanı; fatura/işletme/proje konumu; D1 immutable kapsam, quote hash, terms version/hash ve gerçek server kabul zamanı var. Başvuruda Stripe Session yoktur ve varmış gibi kaydedilmez.
- Ek 4 muhasebeci özeti özel yerel yedek klasöründe hazırlandı; GitHub'a veya müşteri sitesine konmadı, kimseye gönderilmedi.

## Mevcut altyapı ve sınırlar

Mevcut production Worker, `c21cc680-8df5-4f81-b411-20d18b0e5f37` D1 ve `bluefin-project-uploads` R2 korundu. Yeni platform/kaynak oluşturulmadı. D1 yedeği SQLite içine yüklenip schema/ledger doğrulandı; başlangıçta **0 order**, migration 0001/0002 vardı. Yalnız 0003–0006 eklemeli migration uygulandı.

Mevcut Turnstile widget'ına production Worker hostname'i eklendi; ana site hostname'i korunuyor. RATE_LIMIT_SALT kriptografik rastgele üretildi ve yalnız Worker Secrets'ta saklandı. Production Access uygulaması/audience/Allow admin e-postası doğrulandı; `/api/v1/admin` ve alt yollar zaten korunuyordu. Ana/e-posta DNS, Mercury, şirket vergi sınıflandırması ve Apple yolları değiştirilmedi. Staging deploy değiştirilmedi.

Production Cron `*/15 * * * *`; R2 43200 saniye TTL korunuyor. Başvuru 30 gün geçerli; dönüşmemiş ve hold bulunmayan kaydı **sona erdikten 90 gün sonra** Cron kaldırır. Bu yol yalnız unpaid application tablosuna dokunur, ödeme/kabul kayıtlarını silmez. Yeni 120 günlük gerçek bekleme yapılmadı; zaman ilerletilmiş yerel test ayrı kanıttır.

Gerçek dosya intake ve Drive/delivery production entegrasyonu bu sınırlı sürümde açık değildir. Önceki staging Drive/OAuth/12h/30d/90d kanıtları production OAuth kanıtı yerine kullanılmadı. Production'da dosya olmadığı için unpublished proje dosyalarının 30 günlük kapanış, mali kayıtların yedi yıllık gözden geçirme/istisna ve yerel belge tarama operasyonu ilk dosyalı satıştan önce ayrıca tamamlanacak. Gerçek 30/90 günlük bekleme bu başvuru yayınının engeli yapılmadı.

## Tahsilatın neden kapalı olduğu — somut eksikler

1. Production Worker'da `STRIPE_SECRET_KEY` ve `STRIPE_WEBHOOK_SECRET` yok; gerçek Live `acct_` kimliği doğrulanamadı. Mevcut güvenli bağlantı Cloudflare içindir; bu erişim Stripe Live yetkisi sağlamaz. Sandbox secret/merchant kopyalanmadı.
2. Live ürün/Price, Tax registrations, invoice/satıcı ayarları, webhook ve Terms/Privacy URL ayarları API ile incelenemedi. Kayıtlar tahmin edilmedi. Gerekli Live erişim sağlanınca mevcut ürünler keşfedilecek; gereksiz yeni ürün veya Payment Link açılmayacak.
3. İlk müşteri/proje yeri ve hizmet tipine uygulanabilir belgeli işlem-vergi kuralı/tescil dayanağı yok. Hiçbir ülke/işlem için otomatik sıfır vergi veya US-only kuralı kurulmadı. Şu anda **tahsilata uygun doğrulanmış sipariş kapsamı boş**.
4. Production `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, ve kullanıcı OAuth onayı/production private root doğrulanmadı; `DRIVE_TOKEN_KEY` ise 256 bit rastgele üretildi ve yalnız Worker Secrets'a kaydedildi. Callback: `https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/api/v1/admin/drive/oauth/callback`. Staging refresh token taşınmadı. Google OAuth publishing/refresh sürekliliği de doğrulanacak.
5. Gerçek müşteri belgeleri için güncel yerel tarama/karantina ve operatör güvenli işleme süreci henüz kanıtlanmadı. Bu nedenle dosya intake kapalıdır.

Bunlar tamamlandığında yapılacak teknik iş yalnız bir bayrağı açmak değildir: production entry'ye doğrulanmış per-order vergi onayı, scope/quote/fatura-adresi değişince onayın geçersizliği, gerçek Live merchant/Price/webhook/invoice ve production Drive izolasyonu bağlanıp hedefli testten geçirilmeli. `PORTAL_ENABLED=true` tek başına bu sürümde tahsilatı açamaz. Bu ayrım istemci bypass'ına karşı test edildi.

## Eski yedi Payment Link

`data/payment-links.json` envanteri korundu; hiçbir link silinmedi/değiştirilmedi. Public sayfalarda bu URL'lere doğrudan ödeme CTA'sı yok; yeni başvurular portal üzerinden gider. Önceki public denetim zorunlu onay eksikliği bildirmişti. **Live API active durumu ve mevcut açık Session'lar bu yayında NOT RUN**; linkler kapalı varsayılamaz, dışarıda paylaşılmış eski URL'ler hâlâ ödeme kabul edebilir.

Yeni Live Checkout henüz hazır olmadığından paketteki geçiş sırasına göre deactivation yapılmadı. Live erişim ve uygun Checkout sağlandıktan sonra mevcut açık Session/ödemeler tek tek uzlaştırılacak, ardından yedi Link deactivate edilecek. Eski satışlara D1 kabulü uydurulmayacak; eksik kabul/kapsam varsa fulfillment incelemede kalacak. Ürün/fiyat/ödeme silinmeyecek, eski linkler rollback tahsilat yolu olarak açılmayacak.

## Geri dönüş

- İlk tercih: `APPLICATIONS_ENABLED=false`, `PORTAL_ENABLED=false`; aynı kod/şema ile redeploy. Admin, webhook route ve Cron korunur. D1/R2 silinmez.
- Başvuru açılmadan önceki uyumlu kapalı Worker sürümü: `844436e4-c38b-4548-9e16-fed38fa9e1cf` (0003–0006 schema ile çalışır).
- İlk eski production sürümü: `6c2cc5a1-ec69-4bdc-b5a0-c0aadbec3200`; repo başlangıcı `c04c1895be7c75227ff28bb107dd96b8d842c3dc`. Bunlar tarihsel recovery noktalarıdır; yeni başvurular geldikten sonra körlemesine restore yapılmaz.
- Yerel özel yedek: `.qa/go-live-20261030/` içinde kaynak tar, dirty diff, Worker multipart ve D1 SQL. Git dışıdır. D1 export SHA-256 `1938f411877bac3328a330308fa3c22a3e61bd152008f6d0f8fbd90e083462eb`. Export SQLite'a başarıyla yüklenmiştir; production'a restore tatbikatı yapılmadı.
- Yeni ödeme varsa hiçbir zaman Hello World'e dönme; muhasebe/kabul kayıtlarını geri alma, R2 saatini sıfırlama veya toplu iade yapma.

## Durum ve test ayrımı

| Kontrol | Sonuç | Kanıt / sınır |
|---|---|---|
| Yerel Worker regresyonları | PASS | 72/72; son retention değişikliği için 6/6 hedefli tekrar |
| Typecheck ve üretim bundle ayrımı | PASS | Staging mutation araçları/bayrakları production bundle'da yok |
| Site ve sözleşme testi | PASS | 1111 assertion / 23 sayfa; v2 hash, v1 korunması, Apple legacy/contact fragment |
| Production D1 yedek + eklemeli migration | PASS | 0003–0006; mevcut kaynaklar korundu |
| Production .html ilk smoke | FAIL → düzeltildi | İlk auto-redirect tespit edildi; html_handling none + dizin çözümlemesiyle 200 |
| Production anonim admin | PASS | Cloudflare Access 302; bu, yetkili admin oturumu veya TTL410 testi değildir |
| İmzasız webhook mevcut kapalı durum | PASS (fail closed) | 503 webhook_not_configured; gerçek Live signature/webhook testi değildir |
| Checkout, yanlış origin | PASS | 503 ve 403; tahsilat açılmadı |
| Production Live Checkout/webhook/invoice | NOT RUN | Live credentials/merchant/vergi dayanağı eksik |
| Production Drive OAuth/transfer/delivery | NOT RUN | Production bağlantısı/izin/root eksik; staging kanıtı yerine sayılmadı |
| İlk gerçek müşteri satışı | NOT RUN | Henüz yok; sahte kart/self-payment yapılmadı |
| Eski Live link deactivation/reconciliation | NOT RUN | Yeni uygun Checkout ve Live erişim yok |
| Bağımsız hukuk/vergi incelemesi | NOT RUN / NOT_PERFORMED | İşletme sahibi onayı farklıdır |

Gerçek browser, production D1, Cron ve son deploy kanıtı aynı klasördeki `production-browser-2026-10-30.json`, `production-final-audit-2026-10-30.json` ve `production-smoke-2026-10-30.json` dosyalarında tutulur. Yapılmayan kontroller bu raporla PASS olmaz.

## Son gerçek kanıt

- Production browser: gerçek Turnstile, boş/required consent, ayrı business-use checkbox, HTTP201 sentetik başvuru, dosya/ödeme yok, mobil taşma yok: **PASS**. İlk networkidle bekleme zaman aşımı başarı sayılmadı; DOM yükleme beklemesiyle gerçek tekrar tamamlandı.
- D1 sentetik application `7c28f39d-2bdd-410a-b061-df605cd1f57d`; terms hash doğru, scope hash `593d602858ea730a4c25ca215161a036efd679c54005d8bea9961128e2d57927`; 1 application, 0 orders. **PASS**.
- Doğal Cron heartbeat 2026-10-30 14:30:43 UTC; delete/orphan/session hataları 0. **PASS**, cleanup elle tetiklenmedi.
- Mevcut ana site Apple Privacy/Company/Support/Contact yolları HTTP200 ve legacy Privacy/contact metni korunuyor: **PASS**. V2 şu anda Worker origin'inde yayında; ana site yeni metin yayını **FAIL / BLOCKED_BY_GITHUB_WRITE_PERMISSION**.
- Git push 403. Bağlı GitHub integration blob yazma da 403. Keychain'deki geçerli fine-grained PAT doğru kullanıcıyı doğruluyor fakat Contents API yazması 403 `Resource not accessible by personal access token`; gereken izin `contents=write`. Hesabın depo admin/push rolü token'ın write scope'unun yerine geçmez. Secret değerleri gösterilmedi. Kullanıcıya kaydetme/doğru token eşlemesi soruldu; sonuç bekleniyor.

GitHub kök neden: kullanıcının ekranındaki Bluefin-Tuna-Codex token'ı 27 Kasım, Git/gh Keychain token'ı 21 Kasım bitişli MAMMUX kaydıyla eşleşiyor. Yanlış kayıt kullanılmış; MAMMUX izinleri değiştirilmedi. Bu depoya özel Bluefin kimlik bilgisi için gizli yerel macOS giriş mekanizması hazırlandı; sonuç doğrulanmadan push başarılı sayılmayacak.

Son GitHub durumu: doğru Bluefin token izni kullanıcı tarafından kaydedildi (27 Kasım bitişli), ancak depoya özel yerel kayıt bulunmadı. İlk gizli giriş geçersiz format nedeniyle kaydedilmedi; ikinci giriş tamamlanmadı/iptal edildi. Secret değeri hiçbir rapora yazılmadı. MAMMUX/global Keychain girdisi ve git credential ayarları değiştirilmedi. Yerel main commit hazır; remote main güncellemesi ve ana site v2 yayını henüz yapılmadı.
