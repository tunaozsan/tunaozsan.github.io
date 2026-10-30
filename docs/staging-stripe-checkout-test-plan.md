# Staging Stripe Checkout / webhook test planı — 29 Ekim 2026

Tarihsel başlangıç planı (aşağıdaki durumlar çalışma öncesini anlatır). Güncel sonuç: gerçek Checkout/completed webhook/D1/PDF/admin testleri PASS; 12 saat testi bekliyor. HANDOFF.md güncel tablosuna bakın.

Başlangıç durumu: PLAN; Checkout oluşturulmadı, test ödemesi başlatılmadı, portal açılmadı, deploy yapılmadı. Production Stripe, Mercury, DNS, production Worker/D1/R2 değişmedi.

## Kontrol edilen bilgiler

Kullanıcı endpoint'in Active olduğunu bildirdi:
`https://bluefin-project-portal-staging.bluefintuna-llc.workers.dev/api/v1/stripe/webhook`

Sandbox: Bluefin Tuna Portal Staging, `acct_1UVrQ3BxU4PsnoX0`.
Snapshot version: `2026-09-30.endive`.
Olaylar: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`.
Bu Stripe dashboard bilgileri kullanıcı beyanıdır; bağlı Stripe API üzerinden bağımsız okunmadı. Active endpoint, başarılı teslim/işleme kanıtı değildir.

Yalnız staging `wrangler secret list --config wrangler.staging.jsonc` sonucu:
- STRIPE_SECRET_KEY: mevcut, secret_text.
- STRIPE_WEBHOOK_SECRET: mevcut, secret_text.
- TURNSTILE_SECRET_KEY ve RATE_LIMIT_SALT: listede yok.

Secret değerleri okunmadı veya gösterilmedi. İsimlerin varlığı, doğru Sandbox anahtarı veya doğru endpoint signing secret'ı olduklarını kanıtlamaz. İlk kontrol OAuth refresh ağ hatasıyla sonuçlandı; salt okunur tekrar başarılı oldu. Önceki boş secret listesi tarihsel kayıttır.

## Kod ve sürüm karşılaştırması

`cloudflare/worker/src/payments.ts` içindeki tüm Stripe REST çağrıları açıkça `Stripe-Version: 2025-02-24.acacia` gönderiyor. Yeni webhook Snapshot payload'u Endive sürümünde. Webhook sürümü ile REST header sürümü bağımsızdır; sadece endpoint'in sürümünü değiştirmek REST çağrılarını yükseltmez.

Handler dört bildirilen event türünü de destekliyor. Raw body imzası ve timestamp, test/live ortamı, varsa event.account kontrol ediliyor. Snapshot'tan event.id/type/livemode, data.object.id ve data.object.metadata.order_id okunuyor. Session, Worker'ın kendi anahtarıyla Acacia sürümünde tekrar sorgulanıyor; local order/session eşleşmesi, quote_hash, client_reference_id, tutar, para birimi, tax/discount/shipping ve paid/complete kontrol ediliyor. `event.api_version` için açık doğrulama yok. Endive payload uyumluluğu gerçek teslimle henüz kanıtlanmadı.

Checkout isteği `payment_method_types[0]=card` gönderiyor. Stripe'ın resmi Endive changelog'una göre bu parametre Endive'da 400 üretir. Mevcut Acacia çağrısında kullanımı, yeni webhook sürümü yüzünden kendiliğinden bozulmaz. Sürüm header'ını tek başına yükseltmeyin.

İlk testin hedefi mevcut Acacia REST + Endive Snapshot kombinasyonudur. Endive'a hizalama daha sonra ayrı staging kod değişikliği olarak ele alınmalı: eski parametre kaldırılmalı, Dashboard-managed veya allowed_payment_method_types ile desteklenen yöntemler seçilmeli, gerçek Session response'undaki yöntemler doğrulanmalı, tüm request/response alanları yeniden test edilmelidir. Production pin bu testte değişmez.

Kaynaklar:
- https://docs.stripe.com/api/versioning
- https://docs.stripe.com/changelog/endive/2026-09-30/remove-payment-method-types-checkout-sessions
- https://docs.stripe.com/webhooks

## Portal açılmadan tamamlanacak kontroller

1. Ayrı staging Access uygulaması, yalnız `/api/v1/admin/*`, owner allowlist; yeni AUD ve gerçek login/JWT testi. Mevcut son kayıt oluşturma için 403 auth.forbidden; yerel AUD boş. Production AUD kullanılmaz.
2. Turnstile widget, staging public site key + Worker secret; hostname/action `create-order` kontrolü. Staging'e özel rastgele RATE_LIMIT_SALT secret. Secret değerleri raporlanmaz.
3. Runtime Sandbox account ID'nin `acct_1UVrQ3BxU4PsnoX0` olarak uygulanması doğrulanır. Bu kimlik şu an yerel config'de mevcut; son belgelenen deploy kimlik eklenmeden yapılmıştır. Dashboard değişikliği varsayılmaz.
4. Sandbox anahtarı yalnız Worker içinde kullanılarak account eşleşmesi doğrulanır; anahtar prefix'i test olmalı, Session/event livemode false olmalı. Secret değerini insana veya test loguna döndürmeyin.
5. D1/R2 staging kimlikleri, private bucket, same-origin frontend/CSP/CORS, doğru success/cancel URL'leri; production adresine API çağrısı olmaması.
6. Sandbox terms URL/consent ayarı ve tax test tercihi tamamlanır. `TAX_MODE=unconfigured` iken ready=false kalır. İlk manuel sıfır-vergi test senaryosu açıkça belirlenmeli; owner_reviewed_manual kendi başına vergi hesaplamaz. Automatic tax ayrı test edilir.
7. Bu kontroller tamamlanıp test penceresi onaylanana kadar PORTAL_ENABLED=false, LEGAL_APPROVED=false, invoice false ve Cron kapalı kalır. Sonrasında yalnız staging test akışı açılır; bu bir production/legal release onayı değildir. Webhook handler'ın portal flag'inden bağımsız çalıştığı dikkate alınır; pending olaylar staging'de izlenir.

## Gerçek Session üzerinden test akışı (henüz çalıştırılmadı)

1. Sentetik müşteri bilgisi ve XER/CSV/PDF dosyalarıyla portal API'sinden gerçek staging siparişi oluşturun. Capabilities, tam müşteri bilgileri ve dosya içeriklerini kanıta yazmayın.
2. Server quote, required file kategorileri ve current terms consent tamamlanır. `/api/v1/orders/<id>/checkout` akışından Session oluşturulur; Dashboard'dan bağımsız Session veya Payment Link kullanmak uçtan uca test sayılmaz.
3. Worker /account kimlik eşleşmesini ve Session metadata'sını doğrular. Workbench'te request API sürümü Acacia, Session livemode=false, currency=usd, doğru order_id/quote_hash/client_reference_id ve sunucu subtotal kontrol edilir. İade/başarı adresleri staging olmalı.
4. Stripe hosted Checkout'ta yalnız resmi test kartı kullanılır. Başarılı ödeme dönüş sayfasına güvenilmez; gerçek Endive Snapshot delivery ve Worker'ın tekrar sorguladığı Session sonucuyla D1 PAID oluşmalı.
5. Dört katman ilişkilendirilir: order ID → Session ID → event ID / api_version → D1 payment_events ve orders. Kanıtlar secrets/capability/PII içermemeli. Aynı event tekrar teslim edildiğinde tek ödeme kaydı ve tek bildirim oluşmalı.

| Senaryo | Beklenen sonuç |
|---|---|
| Başarılı test kartı | Verified complete+paid Session; doğru paid_total/tax; D1 PAID; webhook 2xx |
| Aynı checkout isteğini tekrar deneme | Aynı açık Session/URL; ikinci ücret veya Session yaratılmaması |
| Test kartı ret / kullanıcı iptali | PAID olmaması; dönüş URL'si ödeme kanıtı sayılmaması |
| Açık Session süresinin bitmesi | Gerçek expired event; Session GET expired; EXPIRED_UNPAID |
| Endive Snapshot | Gerçek event.api_version ve gerekli id/metadata alanları doğrulanır; parsing hatası yok |
| Webhook yeniden teslim | Aynı event ID duplicate; paid state geriye düşmez |
| İmzasız/bozuk imzalı istek | Non-2xx; D1 ödeme durumunda değişiklik yok |
| Yanlış miktar/account/session fixture | Önce yerel güvenlik testinde ret; gerçek Stripe event'i sahtelenmiş gibi sunulmaz |
| Invoice açık/kapalı | Ayrı test Session'ları; invoice referansı ve gerçek PDF doğrulaması; receipt PDF invoice yerine geçmez |

Mevcut Checkout card-only olduğundan async_payment_succeeded/failed olaylarının gerçek teslimini zorlamayın. Bu yollar için ayrı onaylı staging senaryosunda uygun gecikmeli test ödeme yöntemi gerekir. Aksi halde yalnız yerel fixture kapsamı olarak raporlanır. `stripe trigger` ile ilgisiz metadata oluşturan olay gerçek uçtan uca kanıt değildir.

Expired senaryosu doğal süre sonunda gözlenebilir; hızlandırmak için yalnız belirli açık TEST Session'ın Stripe API ile expire edilmesi ayrıca test adımı olarak kaydedilir. Ücretli Session expire edilmez. 12 saatlik R2 erişim TTL'si kısaltılmaz veya uzatılmaz.

## Bitirme ölçütleri ve kayıt

- Gerçek Session + imzalı Endive event + Acacia retrieve + D1 sonucunun eşleşmesi.
- Tüm Stripe işlemleri test ortamında; production'a hiçbir istek veya anahtar aktarımı yok.
- Access/Turnstile negatif testleri ve file-limit testleri tamam.
- Invoice testinde gerçek test PDF incelenmiş; automatic tax kullanılıyorsa ayrı doğrulanmış.
- 12 saat temizleme sonraki ayrı staging Cron penceresinde, gerçek zamanla gözlenecek. Şu an başlamadı.
- Kanıt tablosunda her satır PASS/FAIL/NOT RUN, UTC zaman, kod/deploy sürümü, order/session/event ID, http sonucu ve redakte edilmiş D1 durum özeti bulunacak. Secret veya bearer capability saklanmayacak.

Bu tur kod/config veya remote kaynak değiştirilmedi; yalnız kontrol ve plan dokümantasyonu yapıldı. Önceki 32/1112 test sonuçları tarihsel kanıttır; bu tur gerçek Stripe testi veya yerel test rerun yapılmış gibi raporlanmaz.
