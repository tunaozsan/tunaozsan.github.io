# Güncel sonuç — 31 Ekim 2026: Live anahtar ve webhook bağlı, tahsilat henüz kapalı

Bu bölüm aşağıdaki tarihsel raporların güncel durumunu değiştirir. **Yanlış publishable-key engeli çözüldü.** Kullanıcının eklediği sunucu anahtarı çalışan production Worker içinde doğrulandı; değeri görüntülenmedi. **Site ve başvurular açık; entegre canlı tahsilat/dosya intake henüz AÇILMADI.** Owner yayın yetkisi mevcut; yeniden genel yayın onayı gerekmiyor.

- Site: https://bluefintuna.life/
- Portal: https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/project-portal/
- Merchant: `acct_1UV444BzdKYgwVw6`, Bluefin Tuna LLC, US, Stripe `charges_enabled=true`; çalışan Worker hesabı eşleşiyor. Bu değer tek başına Checkout/fulfillment hazırlığı değildir.
- Kod commit'i: `fd607a1`; production Worker sürümü `dd2b8090-9b2c-4a8f-9d88-65f392d9c8f1`. Mevcut Worker/D1/R2 korundu; yeni platform/kaynak oluşturulmadı.
- Webhook: `we_1UWTAyBzdKYgwVw6TrMDvijt`, `https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/api/v1/stripe/webhook`; dört Checkout event'i, Acacia `2025-02-24.acacia`. Stripe API endpointi **enabled** olarak döndürdü. REST sürümü yükseltilmedi.
- `STRIPE_WEBHOOK_SECRET` sadece production Worker Secrets'a eklendi; mevcut `STRIPE_SECRET_KEY` değiştirilmedi. Signing secret, Worker'da operatorün geçici RSA-OAEP public key'i ile şifrelenip yerelde bellek içinde Secrets API'ye aktarıldı. Sır sohbet/Git/loglarda yok. İşlem sonunda geçici private key silindi; kurulum değişkenleri ve sayfası yayından kaldırıldı. İndirmenin bildirim API'si timeout verdi; dosyanın gerçekten oluştuğu doğrulanarak tekrar endpoint yaratılmadan tamamlandı.
- D1 `0007_payment_review.sql` yedek sonrası eklemeli uygulandı. Eski kayıtlar değiştirilmedi. Yeni `payment_reviews`, imzası ve Stripe Session sorgusu doğrulanmış fakat sipariş/kabul ilişkisi eksik Live ödemeleri ayrı finansal inceleme kaydı olarak tutar. `orders.PAID`, geriye dönük kabul veya Drive işi oluşturmaz. Event ID ile tekrar kayıt önlenir. `/api/v1/admin/payment-reviews` ve operations `paid_sessions_require_review` alarmı mevcut Access/JWT/allowlist arkasındadır. Bağlama yarışlarında Stripe retry korunur; bu kayıt yeni siparişin otomatik kabulü değildir.
- V2 sözleşme aynı: `service-terms-2026-10-30-v2`; hash `85197b0cc77544c400f826dab4a50091d13d916f326fc0ac5cea4ebfab1d7f9c`; efektif tarih 2026-10-30 UTC. Owner publication approval korunuyor; bağımsız avukat/mali müşavir incelemesi **NOT_PERFORMED**.

| Kontrol | Sonuç | Kanıt ve kapsam |
|---|---|---|
| Gerçek Live sunucu anahtarı/merchant | PASS | Yetkili admin oturumunda Stripe API; account/config eşleşmesi |
| Products/Prices tam Live envanteri | PASS | 21 mevcut Product + Price, aktif/one-time/USD; server eşlemesi kodda, her Checkout'ta tutar/merchant/env/product yeniden doğrulanır |
| 22. ürün `EXTRA-50-UPDATE-R` / $150 | FAIL — eksik | Tam Products ve Prices listesinde bulunmadı; tahmini ID veya mükerrer ürün yaratılmadı |
| Production webhook oluşturma/secret aktarımı | PASS | Gerçek Live endpoint enabled; yalnız mevcut dört Checkout event'i |
| Signing-secret yapılandırma kontrolü | PASS | Doğru HMAC ile **sentetik ve etkisiz** `bluefin.configuration_check` olayı HTTP 200; para/sipariş oluşturmadı |
| Gerçek Stripe-delivered ödeme olayı / Live Checkout / Live PDF invoice | NOT RUN | Gerçek müşteri ödemesi yapılmadı; yukarıdaki HMAC kontrolü bu testlerin yerine geçmez |
| İmzasız webhook | PASS | Gerçek HTTP 400 `invalid_signature`; önceki 503 missing-secret engeli çözüldü |
| Access / yanlış origin / kapalı intake | PASS | Anonim admin 302; yanlış origin 403; müşteri sipariş alımı 503 |
| Geçici kurulum yüzeyini kapatma | PASS | Setup vars yok; `/admin/stripe-setup/` HTTP 404; private transfer key yok |
| D1 yedek/migration | PASS | Export SQLite'a geri okunarak doğrulandı; yalnız 0007 eklendi; son okumada 0 orders, 0 order acceptances, 2 başvuru, 0 ödeme inceleme kaydı |
| Eşleşmeyen ödenmiş işlem güvenliği | PASS — yerel | İmzalı/Stripe doğrulamalı fixture, tekrar event, yanlış account, unpaid/mode mismatch; sipariş/kabul/Drive işi oluşmadı |
| Gerçek unbound Live ödeme kaydı | NOT RUN | Sahte gerçek kart/self-payment yapılmadı |
| Worker regresyonu | PASS | 83/83; önceki consent/refund/upload/Drive kontrolleri korunuyor |
| Typecheck / site / diff / sır taraması | PASS | TypeScript; 1111 assertion/23 sayfa; secret taraması temiz, özel yedekler ignore |
| Apple Privacy/Support/Contact | PASS | Gerçek HTTP 200; ana sayfa contact anchor mevcut, eski uygulama metinleri yerel testte korunuyor |
| Stripe Tax mevcut durumunu okuma | PASS | Settings pending, varsayılan tax code/behavior boş, registrations boş; bu gözlem muafiyet kararı değildir |
| Production vergi kuralı ve uygun sipariş tahsilatı | NOT RUN | Onaylı, konum/kapsam/quote'a bağlanan uygulanabilir vergi dayanağı sağlanmadı; global sıfır vergi kuralı kurulmadı |
| Production Drive bağlantısı / özel root / teslim | NOT RUN | Production GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET mevcut değil; staging token/klasör kopyalanmadı |
| Production Cron | PASS | Doğal cleanup heartbeat 2026-10-31 04:15:44 UTC; delete/orphan/session hata sayıları 0 |
| Gerçek 30/90 günlük bekleme | NOT RUN | Önceki simülasyon kanıtı korunur; yeni genel yayın engeli yapılmadı |

## Kalan insan bilgileri ve izinleri — tek liste

1. **İlk uygun işlem için mevcut vergi dayanağı:** hangi fatura ülke/eyaleti, proje ülkesi ve insan planlama hizmetini kapsadığı; kayıt/istisna/reverse-charge/no-registration kararının dayanağı, durumu ve uygulanma tarihi. Yeni vergi tescili veya uzman onayı uydurulmaz. Aktif Stripe Tax kaydı tek zorunlu yol değildir; geçerli dayanaklı manuel karar da değerlendirilebilir. Henüz hiçbir işlem için yeterli temel bulunmadığı için tahsilat açılmadı.
2. **Production Drive OAuth:** mevcut uygun Google OAuth istemcisinin `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` yapılandırması; redirect `https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/api/v1/admin/drive/oauth/callback`; Drive API ve yalnız `drive.file`. Secret yalnız Worker Secrets'a girilmeli. Gerçek Google consent/2FA adımını kullanıcı tamamlar; uygulama yayın durumu/refresh ömrü ayrıca doğrulanır. Yeni Google platformu zorunlu değil, staging bağlantısı kopyalanmaz.
3. **Yalnız eksik $150 eklentisi için:** `Additional 50 Activities — Update With MH & Cost` Product + Price gerçekten eksik. Mevcut önerilen restricted key kapsamı Products/Prices Read idi; bu tek kaydı oluşturmak için Write gerekir. Bu tur katalog yazma isteği denenmedi; 403 alınmış gibi raporlanmıyor. Bu eklentinin eksikliği, diğer 21 ürünün bilinmediği veya tüm katalog için yeni ürün gerektiği anlamına gelmez.

## Kalan teknik işler — tamamlandı sayılmıyor

Bunlar kullanıcıdan yeniden genel onay isteme gerekçesi değildir; eksik vergi/Google bilgileri geldikten sonra uygulama ve test sorumluluğu devam eder:

- Mevcut production giriş noktası bilinçli olarak Checkout/intake'ı kapalı tutuyor. Sadece `PORTAL_ENABLED=true` yazmak tahsilatı açmaz. Onaylı başvurudan capability korumalı siparişe geçiş, quote'a/fatura-proje konumuna bağlı vergi onayı ve adres değişirse yeniden değerlendirme henüz production'da tamamlanmış değil.
- Drive/Delivery kodundaki test-only ortam kontrolleri ve `sk_test_` doğrulamaları, doğrulanmış Live merchant/mode ile test edilerek uyarlanmalı; production callback, ayrı private root, queue reconciliation ve final indirme yolları devreye alınmalı. Google secret eklemek bu kod işinin bittiği anlamına gelmez.
- Live Checkout native terms ve public Terms/Privacy ayarları, fatura alanları/PDF ve uygun sipariş uçtan uca doğrulanmalı. `INVOICE_CREATION=false`; makbuz vergi faturası sayılmıyor. Production refund→delivery revoke uyarlaması henüz açık değil; mevcut staging kanıtı production PASS olarak sunulmuyor.
- Eski açık Checkout Session/ödeme envanteri ve işlem bazında uzlaştırma henüz yapılmadı. Yeni portal hazır olduğunda ilgili yedi link kontrollü kapatılacak; ürün/fiyatlar silinmeyecek.

## Eski linkler / geri dönüş

**Yedi orijinal Payment Link aktif**, hepsinde native required terms consent ve automatic tax kapalı. D1 kabulü ve order bağları doğrulanmış değil. URL/ID gerçek Live envanteri `docs/stripe-live-inventory-2026-10-31.json` içinde. Linkler değiştirilmedi/deactivate edilmedi; ilk geçiş koşulu olan yeni Checkout hazır değil. Bu nedenle “entegre portal tahsilatı kapalı” ifadesi “eski Stripe linklerinden hiç ödeme alınamaz” anlamına gelmez. Önceki tarayıcı not-found sonucu aktiflik kanıtı değildi; gerçek API sonucu onu geçersiz kılıyor.

Geri dönüş noktaları: bu tur öncesi Worker `38de7dbb-fdbb-4f02-8ad9-c15ad84b181c`; kaynak yedeği `.qa/checkout-live-ready-20261031/worker.multipart`, SHA-256 `36701d6e5426f85ea64cf4aa2fc6c092f94dc45d83ffecf7a228a97660b1510f`. D1 export `.qa/checkout-live-ready-20261031/pre-payment-review.sql`, SHA-256 `f58524f4cff05949469f4536461c3d012909844f6c99ea22c3845fc87d83b780`. Mevcut safe-closed kodu korumak ilk tercihtir. Geri dönüş gerekirse secret ve webhook/Cron korunarak eski kaynak yeniden deploy edilir; eski version rollback yeni webhook secret'ını kaybettirebileceği için körlemesine kullanılmaz. D1 geri yüklenmez, yeni finansal/acceptance kayıtları silinmez; eklemeli 0007 yerinde kalabilir.

Mercury payout, vergi sınıflandırması, DNS ve Apple yollarında değişiklik yok. Cron `*/15 * * * *`, R2 TTL 43200 saniye ve mevcut staging kaynakları aynı.

Kanıt dosyaları: `docs/production-live-smoke-2026-10-31.json`, `docs/production-webhook-setup-2026-10-31.json`, `docs/stripe-live-inventory-2026-10-31.json`. Stripe'ın [Tax kurulum açıklaması](https://docs.stripe.com/tax/set-up) ve [webhook API sözleşmesi](https://docs.stripe.com/api/webhook_endpoints/create) kontrol edildi; sıfır otomatik vergi sonucu tek başına yasal dayanak olarak kullanılmadı.

---

# Güncel Stripe Live anahtar doğrulaması — 31 Ekim 2026 (Asia/Samarkand)

**Mesaj düzeltmesi production'da yayımlandı. Başvurular açık, entegre Checkout ve dosya intake kapalı.** Kullanıcının `Live key hazır` bildirimi sonrasında secret adı ve çalışan Worker doğrulandı. Secret alanı mevcut fakat içindeki değer **publishable key** türünde; sunucu API anahtarı değil. Yetkili production Admin API `publishable_key_cannot_create_checkout` yanıtı verdi. Anahtarın gerçek değeri görüntülenmedi, kopyalanmadı veya Git'e alınmadı. Bu hata bir vergi incelemesi veya eksik owner onayı değildir.

- Production Worker: `bluefin-project-portal-api`; güncel deploy sürümü `0c8b6038-09ac-4c41-8c24-5ff57e9d961a`. Kod commit'i `abea260`; korumalı tanı ilk commit'i `65d25e4`. Mevcut Worker/D1/R2 binding'leri ve 15 dakikalık Cron korunuyor; migration yapılmadı.
- GitHub Pages mesaj düzeltmesi: **PASS**, `65d25e4ca3ffd4915115db43d72ed52bb2800b05`, build tamamlandı `2026-10-31T03:21:47Z`. Sonraki sunucu/readiness commit'leri static müşteri görünümünü değiştirmez.
- `STRIPE_SECRET_KEY` adı **mevcut**. Sunucu anahtarı doğrulaması **FAIL — publishable key**. `STRIPE_WEBHOOK_SECRET` secret adları envanterinde yok. Merchant `acct_` / Live katalog / tax kayıtları / webhook endpoint envanteri **NOT RUN**; yanlış anahtar türüyle Stripe'a istek gönderilmedi.
- Mevcut Access kullanıcı oturumu ile korumalı tanı endpointi açıldı. Cookie/JWT/session değeri raporlara kaydedilmedi. Tanı yalnız GET, mevcut admin JWT/allowlist ve production ortamı ile çalışır. Raw Stripe nesneleri, müşteri bilgisi, secret veya şirket vergi kimlikleri döndürülmez.
- Hem Secret hem Restricted Live sunucu anahtarları desteklenir. Publishable/test anahtarları reddedilir; normal readiness ve hard-closed production Checkout korumaları kaldırılmadı. Acacia REST `2025-02-24.acacia` aynı.
- Başvuru mesajı artık tüm müşterilere yapılmamış bir tax review iddiası sunmaz. Yeni başvurular `PAYMENT_SETUP_PENDING`; eski kabul/scope/başvuru kayıtları değiştirilmedi.
- V2 sözleşme `service-terms-2026-10-30-v2` ve hash `85197b0cc77544c400f826dab4a50091d13d916f326fc0ac5cea4ebfab1d7f9c` aynı. Owner onayı bağımsız uzman onayı olarak sunulmadı.

| Kontrol | Sonuç | Kanıt / sınır |
|---|---|---|
| Production secret adı | PASS | Cloudflare API 200; sadece isimler |
| Çalışan secret'ın sunucu anahtarı türü | FAIL | Admin runtime: `publishable_key_cannot_create_checkout` |
| Gerçek Access admin oturumu / anonim koruma | PASS | Yetkili tanı yanıtı; anonim istek Access 302 |
| Yerel Worker testleri | PASS | 76/76; restricted key desteği, ortam ayrımı, kapalı ödeme, redaksiyon |
| Typecheck / format | PASS | Worker ve frontend TypeScript; değişen kaynaklar Prettier |
| Site / Apple regresyonu | PASS | 1111 assertion / 23 sayfa; Privacy, Support, Contact canlı HTTP 200 |
| Worker health ve mesaj asset'i | PASS | HTTP 200; applicationsEnabled=true, checkoutEnabled=false, filesEnabled=false |
| Origin / eksik webhook doğrulaması | PASS | 403 `origin_denied`; 503 `webhook_not_configured`; imza testi yerine sayılmadı |
| İlk HTTP smoke denemesi | FAIL | Genel istemci ile 403 yanıtları; kanıt ayrı tutuldu. Tanımlı istemciyle tekrar PASS; erişim politikası değiştirilmedi |
| Live merchant/katalog/vergi/webhook/invoice/ödeme | NOT RUN | Doğru sunucu anahtarı gerekli; gerçek kart işlemi yapılmadı |
| Production Drive bağlantısı / yeni dosya alımı | NOT RUN | Bu adımda açılmadı; staging verileri/izinleri kopyalanmadı |

**Kullanıcı işlemi:** Stripe Live sunucu anahtarını yalnız production Worker Secrets `STRIPE_SECRET_KEY` alanına kaydetmek. Kullanıcı Restricted key izinlerini sordu; mevcut kod/izinli yayın kapsamına göre [izin listesi](docs/stripe-live-permissions.md) verildi. Payouts, Transfers, External/Bank Accounts, Refunds ve Connect için izin talep edilmedi. Doğru anahtar eklendikten sonra gerçek merchant/katalog/webhook kontrolleri devam edecek; henüz tamamlandı veya tahsilat açık denmedi.

**Yedek/geri dönüş:** `.qa/checkout-20261031/worker.multipart`, ayar/deployment yedekleri Git dışında. Worker yedek SHA-256 `129e9f064f17357aa6757431815df769201877e8900888eb6eaed04df0ba0424`. Yedek öncesi sürüm `e1ce2141-0622-4338-a5ac-02fd5c348075`. D1/R2 geri yükleme veya kayıt silme yapılmadı. Mercury, Stripe ödeme/payout ayarları, DNS ve Apple yolları değiştirilmedi.

Kanıt: `docs/live-key-smoke-2026-10-31.json`, ilk deneme `docs/live-key-smoke-initial-2026-10-31.json`. Önceki ağ engeli kayıtları tarihsel olarak aşağıda korunur; ağ erişimi bu tur yeniden çalıştı.

---

# Güncel devam durumu — 31 Ekim 2026 (Asia/Samarkand)

**Canlı Checkout hâlâ açılmadı. Aşağıdaki düzeltme yerelde tamamlandı; bu tur production yayını doğrulanmadı.** Önceki yayın onayı geçerlidir; yeni owner onayı istenmedi.

Kullanıcının ödeme yerine sürekli “tax review” görmesi incelendi. Production giriş noktası Checkout ve dosya alımını açıkça kapatıyor; başvuru endpointi ise işlem bazında bir vergi hesabı yapmadan her kayda `TAX_REVIEW_REQUIRED` yazıyordu. Bu nedenle ekrandaki mesaj, gerçek teknik engeli doğru anlatmıyordu.

- Yerel düzeltme: yeni başvurular `PAYMENT_SETUP_PENDING`; mesaj, ödeme sayfasının geçici olarak kullanılamadığını ve formun ödeme almadığını açıklar. Admin inbox ve hizmet FAQ metni uyumlu hale getirildi. Eski başvurular, kabul zamanları ve immutable sözleşme/kapsam kayıtları değiştirilmedi.
- Yeni durumun 90 gün sonrası unpaid metadata temizliği eski durumla birlikte desteklenir; explicit hold ve converted kayıtlar korunur. R2'nin 12 saatlik TTL'sine veya Cron tanımına değişiklik yok. Migration gerekmiyor.
- Son başarılı production envanterinde `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ve merchant account ID eksikti. Bu tur güncel secret adlarını tekrar okuma denemeleri ağ zaman aşımıyla sonuçlandı; güncel envanter doğrulanmış sayılmadı. API secret değerleri okunmadı veya görüntülenmedi.
- Cloudflare API (Node ve Python), ana site ve GitHub API HTTPS bağlantıları zaman aşımına uğradı. HTTP 403 veya Cloudflare yetki hata kodu alınmadı. Buna bir izin/vergi hatası denmedi.
- Mevcut Audit Payment Link tarayıcıda açıldı; son ekranda Stripe “Something went wrong / The page you were looking for could not be found” mesajı döndürdü. Ödeme formu ve tutar doğrulanamadı; bağlantının devre dışı olduğu API ile doğrulanmış değildir. Yedi eski link değiştirilmedi. Bu yol D1'e bağlı yeni portal Checkout'u sayılmaz.
- V2 sözleşme ve hash aynı. Vergi muafiyeti, evrensel sıfır vergi veya bağımsız uzman onayı üretilmedi. Mercury, DNS, Apple yolları ve production kaynakları bu tur değiştirilmedi.

| Kontrol | Sonuç | Kanıt / sınır |
|---|---|---|
| Worker testleri | PASS | 72/72; yeni başvuru durumu, geçmiş durum temizliği, hold ve converted korunması dahil |
| Typecheck ve değişen dosyalarda format | PASS | Worker ve frontend TypeScript; Prettier |
| Site testleri ve production asset build | PASS | 1111 assertion / 23 sayfa |
| Production secret adları yeniden kontrolü | FAIL | HTTPS bağlantısı zaman aşımı; değer okunmadı, izin sonucu bilinmiyor |
| Cloudflare / GitHub uzak erişim | FAIL | HTTP yanıtı alınamadı; ağ zaman aşımı |
| Git push | FAIL | Yerel düzeltme `7fe2ccb`; Git HTTPS düşük aktarım hızı zaman aşımı (exit 128), remote yayın doğrulanmadı |
| Düzeltmenin Worker/GitHub Pages yayını | NOT RUN | Uzak erişim doğrulanmadan yayın yapılmadı |
| Gerçek Live Checkout/webhook/ödeme | NOT RUN | Entegre Live bağlantısı henüz tamamlanmadı; gerçek kartla işlem yok |
| Eski Audit bağlantısının ödeme formu | FAIL | Stripe sayfası bulunamadı mesajı; aktiflik API ile doğrulanmadı |

**Somut sonraki adım:** Ağ erişimi geri geldiğinde mevcut production envanterini tekrar doğrula. `STRIPE_SECRET_KEY` eksikse yalnız production Worker Secrets alanına güvenli olarak eklenmesi gerekiyor; bunun için kullanıcıya tek erişim isteği gönderildi, değer sohbetten istenmedi. Ardından mevcut merchant/katalog/webhook/işlem-vergi ayarlarını doğrulayarak D1 kabulü ve immutable kapsamla bağlı Checkout'u tamamla. Yalnız bayrak değiştirerek ödeme veya doğrulanmamış fulfillment açma; eski Payment Link'i entegre ödeme diye sunma.

---

# FINAL LAUNCH RESULT — 2026-10-30 UTC

**Sınırlı açılış: ana site ve production başvuru portalı AÇIK; canlı tahsilat ve dosya intake KAPALI.** İşletme sahibinin son yayın talimatı önceki preparation-only kısıtını kaldırdı. Aşağıdaki eski kayıtlar tarihsel kanıttır; güncel durum bu bölümdür.

- **Production site/portal URL:** https://bluefintuna.life/ · https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/project-portal/
- **Production commit / deployment / migrations:** Release kodu `f53ce895091905cc655bed0d7fccd19a50ad2971`; remote main push **PASS**. İlk doğrulanan GitHub Pages build: `7fdb461978ec8399473277054d7bbc2eaad769c5`, built 2026-10-30 14:47:47 UTC. Rapor-only sonraki commit'ler aynı yayın kodunu korur. Worker sürümü `0ba44440-13b5-4b12-b8b9-cc1263d85795`; mevcut D1'e yedek sonrası 0003, 0004, 0005, 0006 eklendi.
- **Policy version / effective UTC / SHA-256:** `service-terms-2026-10-30-v2` / `2026-10-30` / `85197b0cc77544c400f826dab4a50091d13d916f326fc0ac5cea4ebfab1d7f9c`.
- **Owner authorization:** Son yayın paketi için açık “uygula ve devreye al” talimatı; toplu yayın/adres teyidine “onaylıyorum”. `LEGAL_APPROVED` burada owner publication gate anlamındadır.
- **External legal/tax review:** `NOT_PERFORMED`; owner onayı bağımsız uzman onayı değildir.
- **Stripe Live merchant verified:** Hayır. Worker secret adları yalnız `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_SALT`, `DRIVE_TOKEN_KEY`; Live key / webhook secret ve merchant kimliği yok.
- **Business order intake:** `OPEN` — ödeme içermeyen başvuru, server quote ve immutable D1 v2 kabul kaydı. Gerçek üretim siparişi/iş emri değil. Tüketici ve mapping belirsizliği ayrı inceleme gerekçeleriyle tutulur.
- **Live checkout:** `CLOSED`. Doğrulanmış uygulanabilir vergi kuralı yok; bütün yeni başvurular `TAX_REVIEW_REQUIRED`. Global sıfır vergi veya US-only vergi kuralı kurulmadı.
- **Live payment test:** `NOT RUN`; yapay gerçek kart/self-payment yok. **First genuine customer sale:** `NOT_YET_OCCURRED`.
- **Legacy links:** Yedi URL korundu, deactivate edilmedi; Live aktiflik/açık Session uzlaştırması `NOT RUN`. Ana sayfalarda yeni satın alma girişi portal. Önceden paylaşılan linkler hâlâ ödeme kabul edebilir; hepsi kapalı varsayılmamalı.
- **Production Drive OAuth/root/refresh:** `NOT RUN`, production credential/kullanıcı izni eksik. Staging bağlantısı kopyalanmadı.
- **Webhook / Cron:** Webhook route mevcut fakat Live secret eksikliği nedeniyle 503 ile kapalı; imza doğrulanmış Live olay testi `NOT RUN`. `*/15 * * * *` Cron **PASS**: doğal çalışmada 2026-10-30 14:30:43 UTC heartbeat, delete/orphan/session hata sayıları 0.
- **Backup / rollback:** `.qa/go-live-20261030/` Git dışı kaynak/Worker/D1 yedeği; D1 export SQLite içine başarıyla yüklenerek doğrulandı. İlk geri dönüş aynı kodda `APPLICATIONS_ENABLED=false`; kapalı uyumlu Worker `844436e4-c38b-4548-9e16-fed38fa9e1cf`. Veritabanı/ödeme kayıtları silinmez, webhook/Cron kapatılmaz.
- **Apple regression:** Yerel test `PASS`: legacy app Privacy açıklamaları, support/contact yolları ve ana sayfa contact bölümü korunuyor. Footer'da yalnız yayımlanan şartların “Proposed” etiketi kaldırıldı; yollar değişmedi. Mevcut ana site Privacy/Company/Support/Contact HTTP kontrolleri 200 ve eski app açıklamaları korunuyor. V2 ana sitede ve Worker origin'inde yayımlandı; gerçek HTTP ve bundle hash doğrulandı.

| Güncel kontrol | Sonuç | Kanıt / sınır |
|---|---|---|
| Worker testleri | PASS | 72/72; retention düzeltmesi sonrası 6/6 hedefli test |
| Typecheck / format / diff / secret taraması | PASS | Secret değerleri Git'e alınmadı; yedekler ignore |
| Site / sözleşme | PASS | 1111 kontrol, 23 sayfa; v2 SHA-256 ve eski v1 hash korunması |
| Production gerçek Turnstile + anonim müşteri başvurusu | PASS | HTTP 201, sentetik `7c28f39d-2bdd-410a-b061-df605cd1f57d`; v2 hash; charged=false |
| Required consent ve business-use checkbox | PASS | Ayrı, boş; kabul verilmeden gönderim kapalı |
| Production D1 kanıtı | PASS | 1 sentetik application, 0 orders; terms/quote hash, kabul zamanı doğrulandı |
| Mobil 390px | PASS | Yatay taşma yok; dosya/Checkout panelleri gizli |
| Production doğal Cron | PASS | 14:30:43 UTC heartbeat; 0 hata, elle cleanup çağrılmadı |
| GitHub main push / yeni ana site yayını | PASS | Bluefin token depoya özel Keychain'e bağlandı; MAMMUX korundu. Pages built, v2 Terms/Refund/Privacy ana sitede HTTP200 |
| Production API güvenliği | PASS | Yanlış origin 403, Checkout 503, anonim admin Access 302; 302 yetkili API testi yerine sayılmadı |
| Son policy .html adresleri | PASS | Worker'da doğrudan 200; ilk auto-redirect hatası düzeltildi |
| Gerçek Live ödeme/webhook/invoice/Drive/teslim | NOT RUN | Zorunlu gerçek bağlantılar/vergi dayanağı eksik; staging testleri bunlar sayılmadı |
| Production yetkili admin browser oturumu | NOT RUN | Mevcut Access policy ve yerel JWT testi doğrulandı; yeni kullanıcı oturumu açılmadı |
| Gerçek 30/90 gün | NOT RUN | Önceki staging simülasyonları korundu; bu yayının genel engeli yapılmadı |

**Tek toplu insan/erişim listesi:** (1) Production Live Stripe key + production webhook secret güvenli Worker Secrets'a; gerçek merchant ID ve mevcut Live katalog/vergi/fatura erişimi. (2) Production Google OAuth client/secret, doğru callback ve sahibinin Google izni; ayrı private root/publishing kontrolü. (3) İlk müşteri/project/service için belgeli uygulanabilir transaction-tax kuralı/tescil dayanağı. (4) Gerçek dosyalar için güncel yerel tarama/karantina ve operatör işleme prosedürü. Secret'lar sohbete gönderilmez. Bunlar geldikten sonra per-order tax/Live/Drive production bağlama ve hedefli test işi tamamlanmadan yalnız bayrakla ödeme açılmaz.

Ayrıntı ve kontrollü geçiş/rollback: [Production açılış raporu](docs/production-launch-2026-10-30.md). Gerçek kanıt: `docs/production-browser-2026-10-30.json`, `docs/production-smoke-2026-10-30.json`, `docs/production-final-audit-2026-10-30.json`.

---

# Tarihsel kayıtlar — aşağıdaki hazırlık/yasak/onay durumları güncel yayın sonucu değildir

# Yayın adayı doğrulaması — 2026-10-29 (Asia/Samarkand)

## Güncel kalan testler ve yayın kararı — 30 Ekim 2026

**Staging doğrulamaları ilerledi; production için hazır onayı verilmedi.** Bu bölüm güncel sonuçtur; aşağıdaki tablolar tarihsel test adımlarını korur.

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Gerçek Stripe webhook yeniden teslimi ve idempotency | PASS | completed event yeniden gönderildi; pendingWebhooks=0; tek D1 olay kaydı, paid_at/tutar/invoice korunuyor |
| Gerçek Stripe expired Checkout/webhook | PASS | Ayrı ödenmemiş fixture EXPIRED_UNPAID; Endive expired event PROCESSED, pending_webhooks=0 |
| Sandbox receipt/fee/bill-to | PASS | 199 USD charge, 6.07 USD fee, 192.93 USD net; receipt varlığı; US billing. Sandbox balance pending; gerçek settlement değil |
| Chromium + WebKit otomatik arayüz | PASS | 320/375/768/1440, reduced-motion, 29 axe kontrol grubu; 0 violations. Manuel incomplete ve gerçek cihaz testleri ayrı |
| Kontrast ve WebKit dar ekran hataları | PASS | 1.15:1 bildirim kontrastı ve 320px paket seçici taşması düzeltildi; yalnız staging yayımlandı |
| Intake, webhook imzası, CORS, anonim admin koruması | PASS | Sırasıyla 503,400,204/403,302; intake kapalı |
| 20 eşzamanlı health isteği | PASS | Son deneme 20/20, p95 4260ms; ilk ağ timeout denemesi ayrıca FAIL kanıtıyla korunuyor; upload kapasitesi değildir |
| Gerçek async ödeme success/failure | NOT RUN | Mevcut Checkout yalnız card; gecikmeli yöntem yok. Yerel simülasyonlar gerçek Stripe olayı olarak sayılmadı |
| Yerel kontroller | PASS | 33 Worker test, 1112 site assertion, typecheck/format/diff |

Ayrıntılı güncel PASS / FAIL / NOT RUN tablosu, kanıt dosyaları ve bütün kalan yayın gereklilikleri: [Staging canlıya geçiş eksikleri](docs/staging-release-gaps-2026-10-30.md).

Canlıya geçiş için: kararlı ağda performans/yük kontrolü; gerçek iOS/VoiceOver ve manuel axe incomplete incelemesi; dış alarm/uzak hata-retry ve backup restore tatbikatı; restricted file policy ve operatör saklama/tarama prosedürü; vergi, yasal terimler/refund ve şirket fatura bilgilerinin onayı; App Store Connect/mail sağlayıcı teyidi; ardından ayrı açık production yayın onayı gerekir. Bunlar staging ödeme testinin geçmesiyle otomatik onaylanmış olmaz.

Son staging sürümü `818d75e6-6c24-45cf-8b14-9f842f674168`. APP_ENV=test; PORTAL_ENABLED=false; LEGAL_APPROVED=false; INVOICE_CREATION=false; TAX_MODE=unconfigured. Geçici STAGING_VALIDATION_ENABLED bayrağı son deploy'da yok; test yönetim uçları kapalı. Webhook ve 15 dakikalık Cron korunuyor. Production/DNS/Mercury/Apple/Stripe Live değişmedi; secret/cookie/JWT raporlanmadı; push/merge yok.

## Tarihsel: Son doğrulama — 30 Ekim 2026, 08:00 Semerkant (03:00 UTC)

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Yenilenen Chrome staging Admin API oturumu | PASS | /api/v1/admin/operations HTTP200; healthy, alerts=[] |
| Ödenmiş süresi dolmuş dosya | PASS | Order 966850e0-bace-4638-9440-b14524e5ce6f / file 8ddad3b7-0766-400a-a6d3-bacedc163c66: HTTP410, error=files_expired |
| Ödenmemiş süresi dolmuş dosya | PASS | Order 039d322c-c207-4824-87bc-810d5e41de20 / file 8ca7e27f-4bf1-4ab2-8842-4d075c1ae550: HTTP410, error=files_expired |
| Staging sipariş kabulü kapalı | PASS | /health HTTP200, mode=test, enabled=false |
| Cron sağlık kontrolü | PASS | Admin operations: overdue=0, retrying=0; cleanup hata sayaçları 0 |

Kanıt: `docs/staging-ttl-final-2026-10-30.json`, ölçüm 03:00:13 UTC. İstekler mevcut Chrome test penceresindeki portal sayfasından yapıldı; Terminal'e cookie/JWT aktarılmadı, oturum değerleri okunmadı veya raporlanmadı. Cloudflare SSO dönüşü tamamlandıktan sonra API JSON belgesinin fetch kısıtı nedeniyle kontrol portal sayfasından tekrarlandı. İlk başarısız tarayıcı istekleri PASS sayılmadı.

Önceki gerçek Cron/D1/R2 silme kanıtıyla birlikte **12 saat sonrası erişim reddi ve fiziksel silme kontrolleri tamamlandı**. Tam 12. saat sınır anında HTTP ölçümü yapılmadı; bu sonuç süre dolduktan sonraki gerçek HTTP410 gözlemidir. Diğer tarihsel NOT RUN testler (async ödeme olayları vb.) bu sonuçla tamamlanmış sayılmaz.

Bu tur yalnız salt okunur staging istekleri ve yerel rapor güncellemeleri yapıldı. Webhook/Cron yapılandırmaları, staging intake kapalı durumu ve production kaynakları değiştirilmedi. Önceden kaldırılan günlük otomasyon yeniden açılmadı.

## Tarihsel TTL takip sonucu — 30 Ekim 2026, 02:47 UTC

| Kontrol | Sonuç | Kanıt |
|---|---|---|
| Gerçek 43200 saniye süre | PASS | Her iki siparişin created_at / expires_at farkı 43200; süreler değiştirilmedi |
| Cron sonrası D1 silme kaydı | PASS | Her iki dosya DELETED; deleted_at=2026-10-30 01:30:38 UTC; paid sipariş PAID_FILES_EXPIRED, unpaid EXPIRED_UNPAID; retries=0 |
| Fiziksel R2 silinmesi | PASS | Önceki HTTP200 nesnelerin ikisi de artık HTTP404; docs/staging-ttl-audit-20261030T024730Z.json |
| Cron heartbeat | PASS | 02:45:42 UTC tamamlanma; deleteFailures/orphanDeleteFailures/sessionFailures=0 |
| Yetkili admin dosya erişimi HTTP410 | NOT RUN | 02:47:58 UTC iki istek de Access HTTP302; oturum yenilenmeli. 302 TTL kanıtı değildir |
| Staging intake kapalı | PASS | Runtime health mode=test, enabled=false; docs/staging-ttl-access-2026-10-30.json |

Silme expiry sonrasında ücretli dosya için 11 dk 38 sn, ödenmemiş dosya için 11 dk 18 sn gecikmeyle ilk planlanan Cron'da gerçekleşti. Gözlem 02:47 UTC'de yapıldı; bu tam sınır anında HTTP erişim kesilmesini kanıtlamaz. Manuel silme, cleanup tetikleme, deploy veya production değişikliği yapılmadı. Sadece yetkili admin HTTP410 doğrulaması kullanıcı Access girişini bekliyor. Otomatik D1/R2 takibi tamamlandığı ve kalan adım kullanıcı girişine bağlı olduğu için günlük takip kaldırıldı; tüm testler tamamlandı denmiyor.

## Önceki staging sonucu — 29 Ekim 2026

Bu bölüm 29 Ekim durumudur; güncel TTL takibi yukarıdadır; aşağıdaki OAuth/Access 403 kayıtları tarihsel denemelerdir ve artık engel değildir. Yetkili `bluefin-cf` yardımcısının Global API Key kimlik doğrulamasıyla staging Access oluşturuldu. Anahtar değeri görüntülenmedi. Production, DNS, Mercury, Stripe Live ve Apple URL'leri bu çalışmada değiştirilmedi.

| Kontrol | Sonuç | Gerçek kanıt / kapsam |
|---|---|---|
| Staging Access + Allow e-posta + ayrı AUD | PASS | docs/staging-access-2026-10-29.json; yalnız staging /api/v1/admin/*; gerçek kullanıcı girişi |
| Turnstile, site key, secret ve RATE_LIMIT_SALT | PASS | docs/staging-turnstile-2026-10-29.json; Stripe secret'ları korunarak yalnız staging secrets |
| Gerçek create-order hostname/action; replay ve yanlış action reddi | PASS | docs/staging-live-readiness-2026-10-29.json |
| Sandbox hesabı ve test modu | PASS | acct_1UVrQ3BxU4PsnoX0 runtime eşleşmesi; docs/staging-closed-2026-10-29.json |
| İki sentetik XER yükleme | PASS | HTTP201; gerçek 43200 saniye TTL; docs/staging-order-test-2026-10-29.json |
| Gerçek Sandbox Checkout ve webhook / D1 ödeme | PASS | 199 USD; PAID; checkout.session.completed PROCESSED; docs/staging-payment-evidence-2026-10-29.json |
| Acacia REST + Endive Snapshot | PASS | REST 2025-02-24.acacia korundu; gerçek işlenen event ve endpoint 2026-09-30.endive; yalnız completed akışı gerçek test edildi |
| PDF invoice üretimi ve görsel kontrol | PASS | Stripe invoice paid=true, total=19900 USD; PDF bir sayfa, sentetik müşteri/adres ve P6 Audit doğru. Yerel .qa/sandbox-invoice.pdf Git dışı |
| Admin ödeme/indirme/teslim alma | PASS | İndirmeden mark-retrieved 409; unpaid indirme 403; paid indirme 200 ve byte eşleşmesi; mark-retrieved 200 |
| Müşteri private workspace resume | PASS | Gerçek form ile PAID ve 199 tutarı görüldü; docs/staging-admin-tests-2026-10-29.json |
| Yerel Worker / site / typecheck / format | PASS | 33 Worker test; 1112 assertion / 23 sayfa; typecheck ve format geçti |
| Cron heartbeat | PASS | */15 * * * * etkin; operations healthy; cleanup hata sayaçları 0. Bu henüz fiziksel TTL silme kanıtı değildir |
| Gerçek 12 saat sonrası erişim kesilmesi | NOT RUN | 30 Ekim 01:19:00 / 01:19:20 UTC henüz gelmedi; yerel zaman simülasyonları gerçek test yerine sayılmadı |
| Gerçek Cron sonrası fiziksel R2 silinmesi | NOT RUN | Ayrı kontrol bekliyor; docs/staging-ttl-followup.md |
| Gerçek async success/failure, expired event ve webhook replay | NOT RUN | Yerel testler mevcut; bu gerçek completed ödemesi diğer event türlerini kanıtlamaz |
| Test sonrası staging sipariş kabulünü kapatma | PASS | Runtime intakeEnabled=false; POST orders 503; webhook imza kontrolü aktif (unsigned 400 invalid_signature); admin 200 |

Son deployment **9d14386f-ca80-4e80-9e00-74559e27444e**. APP_ENV=test, PORTAL_ENABLED=false, LEGAL_APPROVED=false, INVOICE_CREATION=false, TAX_MODE=unconfigured. Cron ve webhook açık bırakıldı. Yeniden açmak için `.build` içindeki eski active config'i kullanmayın. Testler sırasında manuel sıfır vergi yalnız sentetik Sandbox işlemi içindi; canlı vergi/hukuki onay değildir.

PDF görünümü okunabilir; Stripe'ın PDF şablonu ödenmiş API durumuna rağmen “vadesi gelen tutar” ve ödeme bağlantısı gösteriyor. Bu belge invoice üretimini kanıtlar, paid makbuzu görünümü olarak onaylanmadı. Sandbox satıcı adres/e-posta varsayılanları production faturası için onay değildir.

12 saatlik test için uygulamada otomatik takip kuruldu: `bluefin-staging-12-saat-ttl-do-rulama`, 06:20 günlük, bitince durdurulacak. Tam sınır testi kullanıcı Access oturumu gerektirebilir; fiziksel R2/D1 denetimi ayrı yürütülebilir. Makine uyku/oturum kısıtı olursa NOT RUN korunacak. Sonuçlar görülmeden staging tamamlandı veya production-ready denmez.

Git push/merge yapılmadı. Mevcut yerel production config değişiklikleri korunmuş, production deploy yapılmamıştır.

## Tarihsel: önceki OAuth staging denemesi — 29 Ekim 2026

Bu eski tablo OAuth yetkisinin yetersiz olduğu denemeyi kaydeder; güncel sonuçlar yukarıdadır. Gerçek test yapılmayan işlemler tamamlanmış sayılmaz.

| Kontrol / işlem | Sonuç | Kanıt / açıklama |
|---|---|---|
| OAuth whoami | FAIL | Cloudflare API timeout; oturumun geçersiz olduğunu kanıtlamaz |
| Access uygulamalarını OAuth ile listeleme | PASS | GET başarılı; tam staging domain eşleşmesi yok |
| Staging admin Access uygulaması oluşturma | FAIL | POST `/access/apps`: HTTP 403, code 1010, `auth.forbidden` |
| Yeni staging AUD alma/yapılandırma | NOT RUN | Uygulama oluşturulamadı; production AUD kullanılmadı |
| Gerçek Turnstile widget, frontend site key, secret | NOT RUN | Zorunlu Access yetki kontrolünde duruldu |
| Gerçek create-order action/hostname testi | NOT RUN | Turnstile tarayıcı doğrulaması yapılmadı |
| RATE_LIMIT_SALT üretimi ve Worker Secret yazımı | NOT RUN | Bu denemede üretilmedi/yazılmadı |
| Çalışan Worker Sandbox account ID ve bağlantı kontrolü | NOT RUN | Yerel acct_ kimliği runtime doğrulaması değildir |
| Gerçek Acacia REST / Endive Snapshot uyumluluğu | NOT RUN | Session/ödeme oluşturulmadı |
| Checkout, webhook teslimi, D1 ödeme kaydı, PDF invoice | NOT RUN | Gerçek Sandbox testi yapılmadı |
| Staging admin login/işlemleri | NOT RUN | Access uygulaması yok |
| 12 gerçek saat erişim kesilmesi | NOT RUN | TTL testi başlatılmadı |
| Cron ve fiziksel R2 silme | NOT RUN | Cron açılmadı, gerçek silme testi yapılmadı |
| Test bitiminde intake'i yeniden kapatma | NOT RUN | Intake bu denemede hiç açılmadı |
| Production koruma / kaynakları yeniden oluşturmama | PASS | Production/DNS/Mercury/Apple/Stripe Live mutasyonu yapılmadı |
| Gizli değerleri koruma | PASS | Stripe secret değerleri okunmadı/değiştirilmedi; OAuth değeri yalnız bellekte kullanıldı, çıktı veya Git'e yazılmadı |

Eksik yetki: Cloudflare hesabı `fc9c616595b1d9b6edb82fca91501e47` üzerinde **Access: Apps and Policies Write**. Mevcut OAuth Worker yönetimine ve Access okumaya izin verse de uygulama oluşturma isteği reddediliyor. Turnstile için ayrıca bir yetki hatası gözlenmedi; test edilmediği için eksik olduğu iddia edilmiyor.

Güvenli çözüm: sahibi bu hesaba sınırlı ve kısa ömürlü Access Apps/Policies Write API token'ını güvenli yerel ortamda yetkilendirebilir (değeri sohbet/Git'e koymadan) veya dashboard'da yalnız `bluefin-project-portal-staging.bluefintuna-llc.workers.dev/api/v1/admin/*` için yeni self-hosted uygulama ve `ozsan_tuna@yahoo.com.tr` Allow politikası oluşturup gizli olmayan AUD bilgisini paylaşabilir. Global API Key gerekmez. Yetki sağlanmadan farklı kimlik bilgisi aranmadı ve güvenlik kontrolü gevşetilmedi.

Makine okunur kayıt: `docs/staging-completion-status-2026-10-29.json`. Bu denemede deploy/migration/secret yazımı/ödeme/Cron/Git push yapılmadı. Önceki local test PASS kayıtları bu tur yeniden çalıştırılmış değildir. Önceki staging secret adları kontrolü iki Stripe secret'ının varlığını göstermişti; bu, değerlerinin doğruluğu veya şu anki Sandbox bağlantısı için kanıt değildir.

## Önceki yayın adayı kayıtları (tarihsel)

**Yerel inceleme adayı; production-ready değil.** Mevcut feature branch/PR #4 devamı. Uzak migration, deploy, DNS, secret değişikliği, Cron aktivasyonu, canlı ödeme veya main merge yapılmadı. Worker/D1/R2 yeniden oluşturulmadı.

## Yeniden çalıştırılan yerel kontroller

| Komut / kontrol | 29 Ekim sonucu |
|---|---|
| Node / npm | v24.19.0 / 10.8.2 |
| `npm ci --ignore-scripts --prefix cloudflare/worker` | PASS; güncel lockfile temiz kurulumu |
| `npm audit --prefix cloudflare/worker --audit-level=low` | PASS; 0 vulnerability, 49 package audit |
| `npm run typecheck` | PASS; Worker ve browser TypeScript |
| `npm run format:check --prefix cloudflare/worker` | PASS |
| `npm run test:worker` | **31 PASS, 0 fail, 0 skipped** |
| `npm run bundle --prefix cloudflare/worker` | PASS |
| `npm run migrate:local --prefix cloudflare/worker` | 0002 yerel olarak uygulandı (6 komut); final tekrarda pending migration yok. Remote yok |
| `npm run build` | PASS; 20 canonical +2 alias +404 |
| `npm test` | **1112 assertion / 23 sayfa PASS** |
| `git diff --check` | PASS |
| Protected baseline SHA-256 | CNAME, legacy privacy/company source, company-logo.png, site.webmanifest byte-identical |
| Yerel Wrangler smoke | health 200 enabled false; orders 503 portal_not_enabled; admin operations 503 admin_not_configured; test-scheduled 200 |

Tam komut çıktıları: [release-local-tests-2026-10-29.json](docs/release-local-tests-2026-10-29.json). Yerel HTTP sonuçları: [smoke JSON](docs/release-local-smoke-2026-10-29.json).

**Bulunan ve düzeltilen test altyapısı hatası:** yeni gerçek runtime testi ilk çalışmada eski doğrudan Miniflare workerd binary'si nedeniyle compatibility_date 2026-10-28'i kabul etmedi (29 pass /1 fail). Test motoru Wrangler'ın zaten kullandığı **workerd 1.20261023.1** sürümüne pinlendi; compatibility date veya güvenlik testi gevşetilmedi. Temiz kurulum ve tam suite yeniden geçti. Bu ilk başarısızlık gizlenmedi.

## Test kapsamı

- 7 SKU fiyat/baz aktivite/gün, +1/+49/+50/+51/son izinli/ilk review, tüm materyaller 1/50/51 satır, revision/incompatible/duplicate/unknown/bad numeric ve tek paket.
- Sunucu quote/consent sürümü/hash, eski fiyat/policy hash reddi ve yeni teklif review, missing documents, client total manipülasyonu, checkout freeze, tekrar açık session kullanımı; cancelled dönüşü/expired session yeni ödeme oluşturmaz.
- Invoice false/true parametreleri, buyer email/address, customer creation, invoice metadata, automatic tax flag; verified paid_total/paid_tax/invoice ID persistence; negatif tax ret. **Gerçek PDF üretilmedi, açılmadı ve e-postalanmadı.**
- Stripe raw HMAC/time, yanlış ortam/account/currency/amount/session/metadata, forged signature, duplicate concurrent events, async pending/failure/success ve delayed payment. Ağ servisleri sentetik mock.
- Capability hash/isolation/read-upload-delete; uydurma token ret, gerçekten ele geçirilmiş bearer'ın kapsam içi erişim verebildiği açık kabulü; TTL sonrası erişim ret.
- Access RS256 signature/issuer/audience/email allowlist/expiry/forged; paid-only private download, expiry, download evidence olmadan retrieved ret, ücretsiz tek reupload ve DRAFT reupload erken retrieval ret.
- File allowlist/MIME/signature/path/category, missing/forged Content-Length, oversize, cancelled stream/retry, Office/ZIP rejection; gerçek malware yok.
- Atomik 100 MiB/20 file kota ve global iki upload sınırı. **Gerçek yerel Workers runtime: iki eşzamanlı 20 MiB stream PASS; üçüncü 409.** Uzak Workers planı load/memory testi değildir.
- Tam simulated 12h sınırı, expiry sırasında upload, cleanup delete retry/orphan/idempotency/scheduled handler; optional Telegram lease, monitor heartbeat/backlog/exhausted retry/PII yokluğu.

## Tarayıcı, erişilebilirlik ve Apple

- 320/375/768/1024/1440 px: horizontal overflow yok, tek H1, preview create disabled, eski mailbox outage metni yok. [DOM kanıtı](docs/release-browser-evidence-2026-10-29.json); [ekranlar](docs/screenshots/release-2026-10-29/).
- Basic With Resources, 76 aktivite +concrete: tarayıcı preview **$1,223.00**.
- Keyboard Tab package→activities, visible solid outline. Altı örnek görünür metin/background kontrastı **6.45–14.23:1**; [ölçümler](docs/release-contrast-2026-10-29.json). Bu tüm bileşenlerin tam WCAG/screen-reader audit'i değildir.
- 375px RTL fixture: document width=375, overflow yok. EN dışı dil doğrulanmış değildir. Reduced-motion stylesheet mevcut; OS preference toggled/real-device motion testi yapılmadı.
- Browser console errors: son yerel etkileşimlerde yok. Gerçek browser upload/Stripe/Access E2E kapalı API nedeniyle PENDING; yerel API/runtime testleri ayrı kanıttır.
- Yeni JS 24,412 byte /gzip 7,526; CSS 3,202 /gzip 1,148; portal HTML 10,955 /gzip 4,180. Asset bütçesi; Lighthouse/field score iddiası yok.
- Live read-only GET: `/`, `/privacy.html`, `/company.html`, `/support`, `/support/`, `/support.html` 200; homepage contact anchor var. Eski privacy paragrafları yerelde korunuyor. App Store Connect app-by-app özel ayarları **owner verification required**.
- `support@bluefintuna.life` incoming **RESOLVED per owner 2026-10-29**, bağımsız mesaj gönderilmedi. Outbound/reply/SPF/DKIM/DMARC ayrı follow-up; inbound arıza diye listelenmiyor.

## Uzak durum / çalıştırılmamış kontroller

[HTTP evidence](docs/release-http-evidence-2026-10-29.json): Worker health varsayılan Python UA ile 403/1010; tanımlayıcı UA ile 200 **Hello World!**. API yayımlanmış değil. [Cloudflare 1010 açıklaması](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/) ile uyumlu browser-signature tanısı; güvenlik ayarı değiştirilmedi. `wrangler whoami` expired token nedeniyle başarısız; hesap/binding/version/remote schema doğrulanmadı.

- [ ] Ayrı owner hesap/binding/schema/backup ve izolasyon planı onayı.
- [ ] Ayrı remote migration/deployment/secret/Access değişiklik onayı; sonra gerçek auth E2E.
- [ ] Gerçek Stripe test Checkout/webhook/receipt/PDF invoice/fee/bill-to/tax doğrulaması.
- [ ] Gerçek Turnstile/Access ve iOS Safari cookie/login/preflight; tam screen-reader/contrast ve gerçek performans testi.
- [ ] Gerçek 12 saat test, Cron onayı ve R2 delete retry/monitoring/watchdog.
- [ ] Gerçek Worker kapasite ve operatör tarama/şifreli working storage/final deliverable/retention prosedürü.
- [ ] XLSX/DOCX OPC, XLS OLE ve ZIP inspection/scanner desteği uygulanmadı; mevcut restricted file policy owner kabulü veya ayrı geliştirme gerekir. XLSM ayrıca açık onay ister.
- [ ] Legal/refund/B2B-B2C/tax/calendar/metadata retention review ve onay.
- [ ] Her uygulama için App Store Connect ayar teyidi; outbound/reply ve SPF/DKIM/DMARC takip testi.
- [ ] Optional Telegram gerçek delivery veya bilinçli kapalı kalma; external alert delivery kurulumu.
- [ ] Açık production go-live onayı. PR incelemeye hazır olmakla production hazır olmak farklıdır.

## Yayın / geri dönüş

[HANDOFF.md](HANDOFF.md), [remote runbook](docs/remote-test-runbook.md), [ops/billing](docs/ops-and-billing-runbook.md) sırasını izleyin. Checked-in flags development/portal false/legal false/invoice false/tax unconfigured, cron empty, frontend API_ORIGIN empty. Mevcut test-only CI workflow deploy etmez; PR CI sonucu ayrıca kontrol edilir.

Rollback normal revert ve kayıtlı uygun Worker version üzerinden, ayrı onayla; intake kapatılır ama outstanding webhook/cleanup devam eder. D1/R2 silinmez, TTL uzatılmaz, aktif dosyalar varken Hello World'e dönülmez. Main/DNS/legacy payment links/payout değişmedi.


### 2026-10-30 — Drive OAuth button visibility correction
- PASS: Moved Private working storage / Connect personal Drive above the order-loading controls in the staging admin UI. Closed intake notice now explicitly allows authorized admin Drive setup.
- PASS: TypeScript checks and isolated staging asset build. Staging deployment version `603b1589-2473-414d-b109-490534f17904`.
- PASS: Deployment retains `PORTAL_ENABLED=false`, `LEGAL_APPROVED=false`, existing staging D1/R2 and 15-minute Cron. No production deployment.
- NOT RUN: Real Google consent, connected OAuth verification, real Drive transfer and customer delivery E2E remain pending. Owner reported NOT_CONNECTED; this is not an OAuth success.
- Temporary delivery policy gate is for synthetic staging tests only, not production legal approval.


### 2026-10-30 — Access fetch recovery
- PASS: Anonymous staging admin status returns HTTP 302. This supports Access redirect as a possible fetch failure; the owner's browser network trace was not captured, so root cause is not conclusively verified.
- PASS: Added same-tab Access login return endpoint (admin JWT required, fixed same-origin redirect, no user-controlled target). Admin UI provides a renewal link and actionable fetch error. OAuth POST retains Origin/state/PKCE protection.
- PASS: Typecheck, isolated staging build, all 44 Worker tests (including unauthorized login and open-redirect rejection). Initial sandbox test launch was blocked by IPC permissions; authorized rerun passed.
- PASS: Staging-only deployment `abbdf1e7-76ca-46f8-bdc0-4a61d11c2cd1`; intake remains closed and existing Cron retained.
- NOT RUN: Owner-browser recovery, Google consent and real Drive delivery E2E still await user interaction; not marked complete. Production untouched.


### 2026-10-30 — Real Google OAuth connection confirmed
- PASS: Owner completed Google consent and reported admin status CONNECTED. Independent read-only staging D1 query confirmed drive_credentials.status=CONNECTED, updated_at=1793349555. No refresh-token/cipher/secret fields read.
- PASS: drive_jobs currently empty; no transfer success inferred from OAuth connection alone.
- NOT RUN: Real synthetic final upload and delivery E2E. Automation browser failed the initial protected status fetch before upload; its Access session is separate from the owner's browser. A same-tab Access login return was opened for this test session.
- First Cloudflare read timed out; second read succeeded without mutations. Production, intake, webhook and Cron settings unchanged.


### 2026-10-30 — Real Drive XER delivery E2E
Supersedes the temporary browser-session blocker immediately above: navigating the protected login-return endpoint restored the existing test browser session without copying credentials.
- PASS: Real Google Drive upload returned 201 for synthetic plain-text XER file `38b6ecca-9503-41e0-99a7-a2180a23a6c3` on previously verified Sandbox-paid order `966850e0-bace-4638-9440-b14524e5ce6f`. SHA256 `87cb53eb7ae60dec064e2d1a4b24362e18272f4db15484d4bf5234e748531339`. No new charge.
- PASS: Approved synthetic byte-reviewed text fixture and published a one-day release with independent passcode. Real Stripe paid-session and Drive revision checks ran through the normal publish endpoint. No antivirus-engine scan claimed; this is an internally generated plain-text fixture. Initial attestation punctuation was correctly rejected; valid reference succeeded.
- PASS: Fresh independent HTTP client with no Google/Access cookies activated the invitation (200), downloaded XER (200), and verified full downloaded SHA256. Raw invitation/passcode/session were held only in memory and never printed or persisted.
- PASS: Reusing the single-use invitation returned 401. Admin revoke returned 200; subsequent customer download returned 401. Test release left revoked.
- NOT RUN: Real R2-to-Drive input transfer, PDF/XLSX delivery, real new retention-deadline cleanup and complete extended Drive failure/recovery matrix remain pending. Existing earlier R2 12-hour proofs are separate and are not evidence of these new Drive tests.
- Intake remains closed; production and existing Cron/webhook settings unchanged.


## 2026-10-30 — Drive kalan staging entegrasyonları: son doğrulama

Bu bölüm, önceki Drive R2/PDF/XLSX/retention NOT RUN kayıtlarının güncel sonucudur; önceki tarihli kanıtları silmez. Tam matris: [Drive staging entegrasyon raporu](docs/drive-staging-integration-report-2026-10-30.md).

- **PASS — gerçek staging:** OAuth, Stripe doğrulanmış ücretsiz yeniden yükleme, PAID kilidi, değişmeyen 43200 saniye R2 TTL, otomatik Cron → D1 job → gerçek Drive aktarımı, SHA-256. Cron öncesinde iş yokken 09:30 UTC Cron tek VERIFIED job oluşturdu; ilk aktarım webhook veya manuel retry ile başlatılmadı.
- **PASS — gerçek staging:** PDF/XLSX/XER upload + approval + Publish; Google/Access hesabı olmayan bağımsız müşteri istemcisinden üç dosya HTTP 200, tam boyut/hash eşleşmesi. Başka sipariş 404, davet tekrar kullanımı ve Revoke sonrası indirme 401. Müşteri yanıtlarında Google paylaşım URL'si/Drive ID alanı/OAuth tokenı yok.
- **PASS — gerçek staging:** Cron sonrası retry aynı tek job ve attempts=1 bıraktı. Unpaid gerçek staging siparişinde Drive final upload 403. Google metadata kontrolleri private/ownedByMe koşullarını doğruladı; yeni paylaşım izni oluşturulmadı.
- **PASS — gerçek admin UI:** PDF file input, Upload, Approve, Publish ve Revoke düğmeleri Chrome ile çalıştırıldı. Project/Transfer/Published/Downloads/Archive Expiration durumları görüldü. Önizleme bilgileri isim, MIME, byte boyutu, SHA-256 ve onay tarihidir; güvenilmeyen dosyalar sayfa içinde çalıştırılmaz.
- **PASS — uzak staging zaman simülasyonu:** Publish 30 günlük erişim ve 90 günlük arşiv değerlerini doğru hesapladı. Yalnız sentetik siparişin davet/delivery/retention deadline'ları geçmişe alındı: davet 401; mevcut geçerli customer session ile teslim indirme 410. Mevcut gerçek Cron fiziksel arşivi sildi; ayrı admin endpointte 9/9 Drive nesnesi 404. R2 kaynağı hâlâ 200 ve aynı hash.
- **PASS — yerel staging hata simülasyonları:** bağlantı kopması, invalid_grant, kota/izin 403, yarım upload, checksum uyuşmazlığı, lease, backoff/retry, shared parent reddi, 30/90 gün exact boundaries, silme sonrası D1 retry. Gerçek Google bağlantısı revoke edilmedi ve gerçek kota doldurulmadı.
- **PASS — yerel kalite:** 54/54 Worker test, typecheck, staging build, 1112 site assertion / 23 sayfa. İlk test fixture biçimi ve UI locator bekleme hataları düzeltildi; son sonuçlar yeşil.
- **NOT RUN — süre gözlemi:** gerçek 30/90 gün beklenmedi. Yeni R2 dosyasının gerçek 12 saat gözlemi henüz yapılmadı; geçmişteki ayrı gerçek 12 saat kanıtı korunuyor. Simülasyonlar elapsed-time PASS olarak sunulmaz.
- **NOT RUN — dış sağlayıcı yıkıcı hata testleri / production:** gerçek Google hesap revoke/kota doldurma, production deploy, Stripe Live ve hukuki politika onayı yapılmadı. Otomatik antivirüs hizmeti yok; sentetik fixture yapı incelemesi genel amaçlı AV taraması değildir.

**Mekanizma:** Webhook artık Drive enqueue hatası yüzünden başarısız sayılmaz. 15 dakikalık Cron PAID dosyaları D1 kalıcı kuyruğunda uzlaştırır. Her iş actual Stripe ödeme/merchant/tutar/currency/refund/dispute kontrolü, unique order/file/type, lease, backoff ve SHA-256 ile yürür. Retry/FAILED/TTL yaklaşımı admin alarmında gösterilir; e-posta gönderimi eklenmedi.

**Son staging durumu:** sürüm `3b3ab474-9a8c-4592-946e-50fec8f1de78`; `APP_ENV=test`, `PORTAL_ENABLED=false`, `LEGAL_APPROVED=false`. Geçici tek-sipariş test penceresi tamamen kaldırıldı; customer status 503 ve /health.enabled=false. Drive/Delivery ve yalnız sentetik staging policy gate açık; production onayı değildir. Test teslimleri REVOKED veya EXPIRED; simülasyon siparişinin Drive klasörü purged. Önceki sentetik ana siparişin dosyaları kendi staging retention Cron'uyla temizlenmeye devam eder. Webhook ve `*/15 * * * *` Cron korunur.

**Production öncesi açık konular:** kişisel Drive veri işleme/saklama politikası; 30/90 gün hukuki onayı; Google OAuth production consent ayarları; manuel refund/dispute hold ve alarm takibi; gerçek dosyalar için tarama süreci. Global API Key, Stripe/Google secret, cookie/JWT ve customer invite değerleri raporlara veya Git'e eklenmedi.


## 2026-10-30 — Ortak sözleşme ve Stripe zorunlu kabul doğrulaması

Kaynak belge baştan sona incelendi. İnceleme/onay paketi: [Owner/legal review](docs/OWNER_LEGAL_REVIEW_SERVICE_AGREEMENT.md). Ortak sürüm `service-terms-2026-10-30-v1`, durum **DRAFT**, yürürlük tarihi boş. Hukuki veya işletme sahibi onayı verilmiş sayılmaz.

| Kontrol | Sonuç | Kanıt / sınır |
|---|---|---|
| Service Terms, Refund, Privacy eki uyumu | PASS | Tek sürüm/hash; eski Apple gizlilik açıklaması aynen korunur. 90 günlük arşivin publication başlangıcı ayrıca onaya sunuldu. |
| 7 ana hizmet + pilot + 4 ek + 10 malzeme ortak sözleşmesi | PASS | `data/agreement-product-coverage.json` içinde 22 eşleme; kapsam server sipariş özetinde. Pilot satışı uygulanmış değildir; Update malzemeleri quote-only kalır. |
| Portal varsayılan boş checkbox, eksik/eski kabul reddi | PASS | Gerçek staging UI ve HTTP 400; quote değişiminde/bfcache dönüşünde kabul sıfırlanır. |
| Stripe required kabul ve boş kutuyla ödeme reddi | PASS | Gerçek Sandbox Checkout hata mesajı ve invalid checkbox; `docs/agreement-stripe-rejection-2026-10-30.json`. |
| Kabul sonrası gerçek Sandbox ödeme/webhook/D1 | PASS | Sipariş `38b9ba5f-4387-4080-91d3-416c272a3562`: PAID; sürüm/hash, portal zamanı, Session, ACCEPTED, doğrulama/event zamanı kayıtlı. `docs/agreement-staging-real-2026-10-30.json`. |
| D1 kanıt değişmezliği, retry/idempotency, yanlış Stripe kabulü | PASS | Yerel Worker testleri; yeni staging migration 0004. Kart/secret verisi tutulmaz; geçmiş siparişler yeni şartları kabul etmiş sayılmaz. |
| Yerel regresyon | PASS | 58/58 Worker test, typecheck; son frontend build sonrası 1115 assertion/23 sayfa ve agreement artifact/renderer/Apple koruma testi. |
| 7 mevcut Payment Link zorunlu onayı | FAIL | 7/7 public Checkout config `terms_of_service=none`; Stripe kendi Terms linki Bluefin kabulü değildir. Yalnız salt okunur inceleme, hiçbir Live ödeme/ayar değişikliği yok. |
| Diğer 15 ürünün Payment Link envanteri | NOT RUN | URL/plink ID veya güvenli salt okunur envanter yok. Linklerin bulunmadığı iddia edilmez. |
| Mevcut Payment Link satışlarını D1 kabul kaydına bağlama | NOT RUN | Mevcut linklerde portal order eşlemesi yok; required tek başına ledger oluşturmaz. Portal routing veya ayrıca incelenmiş entegrasyon gerekir. |
| Her 22 ürün için gerçek ayrı ödeme | NOT RUN | Yedi paket/ek kapsamı yerel test edildi; bir gerçek Sandbox başarılı ödeme ve ayrı gerçek ret testi yapıldı. |
| Hukuki/owner onayı ve production/Stripe Live rollout | NOT RUN | Açık onay bekliyor; Draft kaldırılmadı, canlı satış açılmadı. |

**Payment Links:** [ayrıntılı bulgular](docs/payment-links-consent-review-2026-10-30.md), [çalıştırılmamış değişiklik planı](docs/payment-links-consent-patch-plan.json). Eksik 15 link için yalnız URL/ID ve consent ayarının güvenli envanteri gerekir; secret paylaşımı gerekmez.

**Son staging:** `8909714a-ff28-4cab-be74-9a0219148580`; `APP_ENV=test`, `PORTAL_ENABLED=false`, `LEGAL_APPROVED=false`, `/health.enabled=false`, müşteri endpointi 503. Geçici test penceresi kaldırıldı. `docs/agreement-final-guards-2026-10-30.json` salt okunur doğrulama zamanı 11:32:40 UTC. Webhook ve 15 dakikalık Cron korunur; sentetik test dosyaları değişmeyen 12 saat TTL/normal temizlik sürecine tabidir. Production Worker/D1/R2, DNS, Mercury, Stripe Live ve Apple URL'lerine dağıtım/değişiklik yapılmadı; Git merge/push yapılmadı. Önceden bulunan çalışma ağacı değişiklikleri bu göreve mal edilmez.

**Canlıya geçiş engelleri:** owner/legal final metin ve yeni APPROVED sürüm/yürürlük tarihi; tüketici cayma/erken ifa, vergi ve satıcı bilgileri; kişisel Drive ve 30/90 gün saklama onayı; Schedule Score kapsam/SKU/teslim akışı; Update mapping incelemesi; eksik Payment Link envanteri, required kabul ve D1 eşlemesi. Önceki Drive raporundaki production eksikleri de geçerlidir.


## 2026-10-30 — Portal / Catalog / D1 mimarisi (staging)

Ayrı çıktılar: [A — gerçek ürün/fiyat eksikleri](docs/A-product-price-gaps.md), [B — Link geçiş planı](docs/B-payment-link-portal-migration.md), [C — readiness/rollback](docs/C-production-readiness-rollback.md). Makine envanteri: `data/stripe-product-inventory.json`.

- **PASS — gerçek Sandbox envanteri:** Access yenilendikten sonra acct_1UVrQ3BxU4PsnoX0 doğrulandı. 7 aktif Product + 7 USD Price bulundu; ID/amount/active kaydedildi. 15 diğer Product/Price eksik. Özellikle EXTRA-50-UPDATE-R $150 Sandbox'ta yok, yerel fiyatlandırmada var. Live katalog durumu UNKNOWN; Product ve Payment Link karıştırılmadı. Yeni Stripe ürün veya Payment Link oluşturulmadı.
- **PASS — uygulama:** Dinamik price_data kaldırıldı. 7 doğrulanmış Sandbox Price, yalnız ilgili test hesabında açık ID eşlemesiyle kullanılır. Diğer SKU'lar için doğrulanmış lookup_key gerekir; eksik/inaktif/farklı tutar/para birimi/ortam/ürün eşleşmesi fail-closed. Site SKU + miktar/BOQ kapsamı immutable scope içinde kalır. Draft sözleşme yürürlüğe sokulmadı.
- **PASS — gerçek normal paket:** yeni sipariş `93355bdd-6949-4891-96c3-e00e57577dc0`; Catalog Price ile Checkout, test ödeme, signed webhook → D1 PAID / ACCEPTED / sürüm/hash/Session/event kaydı doğrulandı. Kanıt `docs/catalog-checkout-real-2026-10-30.json`. Return sayfası ödeme kanıtı olarak kullanılmadı.
- **PASS — gerçek staging:** boş checkbox, eksik/eski consent HTTP 400. Tarihsel PAID siparişinde D1 ledger bulunmadan final upload 403 `fulfillment_consent_required`; geçmiş kabul oluşturulmadı. Kanıt `docs/catalog-legacy-guard-real-2026-10-30.json`.
- **PASS — yerel Miniflare:** 61/61 Worker testi; normal paket/çoklu ek/yanlış ek/client fiyat müdahalesi/eksik-eski kabul/duplicate webhook/yanlış order ve Session/refund hold/failed-cancelled ödeme. Yeni testlerde farklı Link Session bağlanamaz, eski sürümlü ledger'sız sipariş PAID olamaz, iş kuyruğu/upload engellenir; eksik ve değiştirilmiş Catalog Price 503 döner. Typecheck, 1115 site assertion/23 sayfa, agreement/Apple legacy koruma testleri PASS.
- **NOT RUN — gerçek dış sağlayıcı kapsamı:** çoklu ek Checkout (15 Product/Price eksik), gerçek yeni Sandbox Payment Link satışı ve gerçek refund/cancelled ödeme; bunların yerel testleri gerçek Stripe sonucu değildir. Yeni normal siparişin Cron/Drive aktarımı ayrıca gözlenmedi. Stripe custom checkbox invalid durumunu native required/aria ile ölçen bu turdaki alt test NOT RUN; önceki ayrı gerçek ret kanıtı korunur.
- **FAIL — mevcut Live Link kabul hazırlığı:** önceki salt okunur 7/7 `terms_of_service=none` bulgusu geçerli; bu turda hiçbir link silinmedi/değiştirilmedi. API active UNKNOWN, tarihli public kullanılabilirlik kanıtı raporda. 22 ayrı link yaklaşımı terk edildi; eski linkleri devreden çıkarma planı henüz uygulanmadı.
- **NOT RUN — production/owner/legal:** tüm yayın ve final sözleşme onayları açık. 22 Live Product/Price bilgisi tahmin edilmedi. Pilot teslim kapsamı ve Update malzeme review kapısı korunur.

**Son dağıtım yalnız staging:** `35068155-dcd7-4383-847b-c4831e16347c`; geçici 10 dakikalık test penceresi kaldırıldı; PORTAL_ENABLED=false, LEGAL_APPROVED=false. Webhook ve */15 Cron korunur. Production/DNS/Mercury/Stripe Live/Apple URL'leri değişmedi. Eski PAID kayıtlara otomatik fulfillment artık kapalıdır; bu istenen fail-closed davranıştır, önceki tarihsel test sonuçları geriye dönük değiştirilmedi. D1 migration/backfill bu turda yapılmadı. Yeni sentetik dosya normal 12 saat temizliğine tabidir.


## 2026-10-30 — Eksik 15 Sandbox Product/Price ve kalan gerçek testler

Bu bölüm önceki çoklu eklenti/Payment Link/refund-cancel NOT RUN kayıtlarını günceller; önceki kanıtları silmez. [Makine test sonucu](docs/sandbox-extended-results-2026-10-30.json), [A — katalog](docs/A-product-price-gaps.md), [B — geçiş](docs/B-payment-link-portal-migration.md), [C — readiness/rollback](docs/C-production-readiness-rollback.md).

| Kontrol | Sonuç | Gerçek kanıt |
|---|---|---|
| Eksik 15 Product + 15 Price oluşturma | PASS | Yalnız acct_1UVrQ3BxU4PsnoX0, sku metadata + lookup_key; toplam 22/22. sandbox-provision ve stripe-sandbox-catalog JSON. |
| Tekrar oluşturma/idempotency | PASS | 15/15 aynı ID, createdProduct=false ve createdPrice=false. sandbox-provision-retry JSON. |
| Çoklu ek gerçek ödeme | PASS | 2bafb4ae-2784-4bd8-8852-da471faa9b98: $1,322; Basic R + 50 aktivite + concrete (1 BOQ satırı) + 1 revizyon. Dört gerçek Price, D1 immutable scope/ACCEPTED/PAID. sandbox-multi-paid-evidence JSON. |
| Gerçek refund | PASS | re_3UWEenBxU4PsnoX017FulXvU succeeded 132200 cent. verifiedTransferPayment → payment_on_hold. Gerçek Cron dört işte payment_on_hold kaydetti; 5 işin hiçbiri VERIFIED değil. sandbox-refund ve sandbox-d1-final-evidence JSON. |
| Cancel/expiry | PASS | e2cdcb02-14bd-4ee4-909a-1d050daacaf6: geri dönüş tek başına iptal değildir; Stripe Session expire ardından gerçek webhook EXPIRED_UNPAID, paid_at null, Drive işi 0. sandbox-cancel-evidence JSON. |
| Doğrudan Payment Link | PASS | Stripe complete/paid + terms accepted; hedef 112e60d6-c9f3-41c7-a263-8966aab6e676 hâlâ DRAFT, kabul/ödeme olayı/Drive işi 0. Stripe kabulü D1 kabulüne çevrilmedi. |
| Geçici Link kapatma | PASS | Yalnız bu turda oluşturulan plink_1UWEi3BxU4PsnoX09iNiqZtt active=false. 7 Live Link değişmedi. |
| Yerel kalite | PASS | 62/62 Worker testi, typecheck, 1115 site assertion/23 sayfa, agreement/Apple legacy testi. |
| Refund sonrası önceden yayınlanmış teslim erişimi | NOT RUN | Otomatik refund-event D1 projeksiyonu/önceden yayınlı dosya revoke akışı ayrı production engeli. D1 tarihsel order PAID olarak kalır; bu REFUNDED statüsü testi değildir. |
| Production, Live, hukuki/owner onayı | NOT RUN | Canlı yayın yok; tüm sözleşmeler DRAFT. Live ID eksikleri açık. |

**Test düzeltmeleri:** Payment Link ödeme formunda ülke seçimi posta kodunu boşalttı; ilk deneme unpaid kaldı. Aynı Session'da posta kodu tamamlanarak test geçti; kopya ödeme oluşturulmadı. Çoklu ödeme alt testinde Stripe özel checkbox'ını native required/aria ile ölçme sonucu NOT RUN olarak korunur; Stripe accepted alanı ve D1 ledger gerçek API'den doğrulandı. İlk son-guard ağ hatası tekrar denendi; başarı kanıtı ayrı JSON'dadır.

**Son staging sürümü:** `aff03fa2-74f5-449d-97cb-9a4941ed5dac`. PORTAL_ENABLED=false, LEGAL_APPROVED=false; STAGING_CONSENT_TEST_UNTIL ve SANDBOX_CATALOG_TEST_UNTIL kaldırıldı. Webhook ve 15 dakika Cron açık; sentetik dosyalar normal 12 saat cleanup'a tabi. Test linki kapalı; test Product/Price kayıtları Sandbox'ta korunuyor. Pilot ve Update materyal satış kısıtları kaldırılmadı. Production Worker/D1/R2, Stripe Live, Mercury, DNS ve Apple Privacy/Support URL'leri değişmedi; yeni kaynak/migration veya main merge yapılmadı.


## 2026-10-30 — Yayınlanmış teslimde refund sonrası otomatik erişim iptali

Önceki “refund sonrası yayınlı teslim erişimi NOT RUN” maddesi bu staging sonucu ile kapanır. Ayrıntı ve sınırlar: [refund erişim iptali raporu](docs/refund-delivery-revocation-2026-10-30.md).

- **PASS — gerçek Sandbox:** yeni sentetik sipariş `a34c98c0-fae4-4848-863a-5d9a537d26e6`, $199 ödeme ve D1 kabulünden sonra final XER upload/approve/Publish. Bağımsız müşteri istemcisinde indirme 200, 95 byte ve SHA-256 eşleşmesi.
- **PASS — gerçek refund webhook:** `charge.refunded` mevcut Sandbox endpointine eklendi; dört Checkout olayı ve Endive/Acacia sürümleri korundu. Refund `re_3UWFjcBxU4PsnoX00pRDwsZU` sonrası, müşteri kontrolü tetiklemeden teslim REVOKED. D1 event `evt_3UWFjcBxU4PsnoX00Zxc9m3J` kaydı iptalin gerçek webhook'tan geldiğini doğrular.
- **PASS — erişim kesilmesi:** mevcut customer session ile normal/Range indirmeleri 401; eski davet 401; regenerate/republish 403 payment_refunded. D1 customer_sessions=0, customer_invites=0, refund_events=1. Token/cookie/değerleri raporlanmadı veya Git'e yazılmadı.
- **PASS — kayıt ve temizlik:** özgün PAID/ACCEPTED geçmişi korunur; güncel refund hold ve event ayrı authoritative D1 tablolarındadır. 0005 additive migration yalnız staging D1'e uygulandı. Retention tarihi aynı, archive_hold null; refund R2 12 saat TTL'yi veya Drive arşiv temizliğini durdurmaz. Admin hold alanı refund gösterir.
- **PASS — yerel:** 66/66 Worker testi, typecheck, 1115 site assertion/23 sayfa, agreement ve Apple legacy koruma testi. Duplicate/partial refund, imza reddi, child cascade, Cron ve download fallback, Stripe kesintisi fail-closed ve publish/refund yarışı test edildi.
- **NOT RUN — gerçek hata/süre gözlemleri:** kısmi refund, Stripe kesintisi ve webhook kaybı yalnız yerel simülasyon; yeni 12 saat/90 gün bekleme yapılmadı. İndirilmiş dosya geri alınmaz; başlamış stream'in her byte'ında denetim yok. Eski davet testi tüketilmiş davet üzerindedir; yeni kullanılmamış davet senaryosunun ayrı gerçek UI testi yapılmadı, D1 bütün davetleri silme kanıtı mevcut.
- **NOT RUN — production/onay:** Production Worker/D1/R2, Stripe Live, Mercury, DNS, Apple URL'leri değişmedi. Sözleşmeler DRAFT; owner/legal ve canlı yayın onayı verilmedi.

**Son staging:** `35bc08b7-3750-4e31-ada7-753878d3680b`; PORTAL_ENABLED=false, LEGAL_APPROVED=false; geçici test süreleri kaldırıldı. Webhook (refund dahil) ve */15 Cron açık. `docs/refund-final-guards-2026-10-30.json` son kapalı intake doğrulamasını içerir. Refund tablosunu/davet iptalini rollback sırasında silmeyin; eski Worker'a dönerek güvenlik kapısını kaldırmayın.

**Kanıt:** `docs/refund-delivery-real-2026-10-30.json`, `docs/refund-webhook-d1-real-2026-10-30.json`, `docs/sandbox-refund-webhook-enable-2026-10-30.json`. İlk ödeme otomasyonu arka plan sekmesinde bekledi; ödenmemiş sipariş upload'ının doğru 403 reddi ayrı ilk-deneme dosyasında korundu. Aynı Checkout öne alınıp tamamlandı, kopya ödeme yaratılmadı.
