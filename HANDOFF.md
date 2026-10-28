ALREADY CREATED BY OWNER (DO NOT CREATE AGAIN)
  Worker: bluefin-project-portal-api
  Worker URL: https://bluefin-project-portal-api.bluefintuna-llc.workers.dev
  D1: bluefin-project-db
  D1 UUID: c21cc680-8df5-4f81-b411-20d18b0e5f37
  Worker D1 Binding: DB
  R2: bluefin-project-uploads
  Worker R2 Binding: UPLOADS
  R2: Standard / Public Access Disabled
  Stripe Live: Bluefin Tuna LLC; Mercury USD payout already linked
  GitHub Pages: bluefintuna.life, privacy.html, company.html and /#contact

NOT YET VERIFIED OR CONFIGURED (BLOCK LIVE GO-LIVE UNTIL DONE)
  D1 application migration applied remotely
  Worker actual API (current deployment may still be Hello World)
  STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in production Worker
  Valid Stripe webhook endpoint and test events
  Protected admin sign-in / Cloudflare Access setup
  Cron Trigger after scheduled() test
  Live flow 12h TTL tests and monitoring
  Legal/Apple links and checkout policy review
  Domain support@bluefintuna.life mailbox (550 bounce needs fixing)
  Telegram bot notifications (optional)

# Türkçe teslim — 28 Ekim 2026

## Already Created

Yukarıdaki envanter sahibin master belgesinden aynen alınmıştır; dashboard durumunu bağımsız doğruladığımız anlamına gelmez. Yeni Worker/D1/R2 oluşturulmadı. Mevcut Worker URL'sine salt okunur `/health` isteği **403 Forbidden** döndürdü; güncel kodun Hello World mü, Access koruması mı olduğu bu yanıttan anlaşılamıyor. Cloudflare hesabı ve production binding'leri yetkili dashboard oturumunda kontrol edilmelidir. DNS, Stripe payout hesabı, production secrets ve Cron değiştirilmedi.

## Implemented in Code

- `cloudflare/worker/`: gerçek D1/R2 bağlarıyla yerel olarak çalışan API, migration, sipariş kabiliyeti, Turnstile, kota/rate limit, sunucu fiyatı, Stripe Session/HMAC webhook, Access JWT admin, 12 saatlik erişim kontrolü ve cleanup.
- `/project-portal/`: tek paket, uyumlu eklentiler, proje bilgileri, dosya kategorileri, yükleme ilerlemesi/iptali, sunucu özeti ve onay. Arka uç yokken dürüst önizleme; aktif yükleme/ödeme yok.
- `/payment/success/`, `/payment/cancel/`: API'den doğrulanan durum; URL'ye gelmek ödeme sayılmaz. `/admin/`: imzalı Access JWT gerektiren API; statik kabuk gizli veri içermez.
- Ödenmiş ancak süresi dolmuş siparişte operatör doğrulamasıyla ücretsiz yeniden yükleme; yeni 12 saatlik oturum. Yalnızca erişim kodu olan müşteri talep oluşturabilir, yeni erişimi admin verir.
- Eski Apple URL'leri ve orijinal privacy metni, CNAME, manifest ve eski logo korunuyor. Privacy'ye ayrı taslak portal açıklaması eklendi. Mailbox arızası destek sayfalarında açıkça belirtiliyor.
- Onaylı yazısız koyu yüzgeç logo korunuyor. Yeni portal buz beyazı / lacivert / mavi, erişilebilir etiketler ve responsive düzen kullanıyor. EN tek yayın dili; doğrulanmamış çeviri gösterilmiyor. RTL yerleşimi test edildi; çevrilmiş dil desteği tamamlandı diye sunulmuyor.
- Statik yedi eski Stripe linki geçmiş yapılandırma olarak dosyada saklı; bu branch'in hizmet butonları yeni portal akışına gider. Mevcut canlı siteye dokunulmadı. Eski Stripe linklerini devre dışı bırakmak ayrı sahibin işlemidir.

## Pending Owner Setup — canlı akışı engeller

1. **Hesap ve binding kontrolü:** Yetkili Cloudflare oturumunda `wrangler whoami`; yalnızca bu Bluefin hesabı/Worker/DB/R2. Veritabanı UUID ve `DB`, `UPLOADS` adlarını `wrangler.jsonc` ile karşılaştırın. R2 Standard/private kalsın. Workers.dev 403 sebebini çözün. Yeni kaynak oluşturmayın.
2. **Migration ve API test kurulumu:** Önce mevcut D1'nin gerçekten uygulama verisi taşımadığını kontrol edin; varsa yedek ve schema değerlendirmesi yapın. Ayrı onayla `npx wrangler d1 migrations apply bluefin-project-db --remote` ve `npx wrangler deploy` mevcut kaynaklara uygulanabilir. Bu iki işlem bu teslimde **yapılmadı**. Önce `APP_ENV=test`, test anahtarları, sentetik belgeler; canlı ödemeler kapalı kalsın. Test ve canlı veri aynı DB/R2'de eşzamanlı çalıştırılmamalıdır. Test kayıtlarını güvenli şekilde ayırma/temizleme ve sıralı geçiş planını operatör onaylamalıdır. Başka staging kaynağı otomatik yaratılmadı.
3. **Admin Access:** E-posta allowlist'i olan Access uygulamasını `/api/v1/admin/*` için kurun. `ACCESS_ISSUER=https://<team>.cloudflareaccess.com`, `ACCESS_AUD`, `ADMIN_EMAILS` gerçek değerlerdir; placeholder ile açılmaz. Admin korumasını müşteri API'sine ve Stripe webhook'una yaymayın. Cross-origin preflight için sadece OPTIONS bypass düzenini kontrollü test edin; gerçek istek JWT doğrulamasını atlamamalı. Allowlisted/allowlist dışı/expired/forged JWT ile uzak test yapın. Yetkisiz doğrudan Worker URL'si yine reddedilmeli.
4. **API alan adı / admin oturumu:** Üretimde mevcut alan adı altında onaylı `api.bluefintuna.life` gibi aynı-site API kullanılması önerilir; bu PR DNS veya route oluşturmaz. Workers.dev ile browser üçüncü taraf Access cookie kısıtları admin oturumunu bozabilir. Onaylı API origin'i `assets/scripts/portal-config.js` içine ve `src/layout.mjs` CSP `connect-src` listesine koyun; CORS yalnızca gerçek site origin'lerini alsın. Access login sayfasında önce oturum açıp admin shell'e dönme akışını Safari'de doğrulayın. Bu giriş entegrasyonu sahada doğrulanmadan admin hazır kabul edilmez.
5. **Secret'lar:** Değerleri chat'e/PR'a yazmayın. Owner terminali veya Cloudflare Secrets ile `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, güçlü en az 32 karakter `RATE_LIMIT_SALT` girin. Test modunda `sk_test_`, production'da `sk_live_` zorunlu. Eski GoSafely secret'ları kullanılmaz. Public Turnstile site key'i `portal-config.js`e koyun; hostname `bluefintuna.life`, action `create-order` eşleşmesini test edin.
6. **Stripe test uçtan uca:** `STRIPE_ACCOUNT_ID` gerçek Bluefin hesabına eşit olmalı. Endpoint `/api/v1/stripe/webhook`; completed, async_payment_succeeded, async_payment_failed, expired olayları. API kodu `2025-02-24.acacia` sürümünü sabitliyor; test hesabında uyumluluğunu ve endpoint sürümünü doğrulayın. Dynamic price_data kullanıldığı için var olan Products/Prices'a gizlice bağlanmaz; satır isimleri/tutarlar sahibi tarafından eşleştirilmelidir. 199/499/799/999/1499/399/649 USD tabanlarını test edin. Gerçek test Checkout, test webhook retry, yanlış tutar/imza/mod, iade/dispute operatör prosedürü ve geciken webhook senaryoları henüz gerçek Stripe hesabında yapılmadı.
7. **Vergi/fatura:** `TAX_MODE` varsayılan unconfigured; mali inceleme sonrası `automatic` veya `owner_reviewed_manual`. Otomatik vergi için Stripe Tax kaydı/konumlarını doğrulayın. `INVOICE_CREATION=false`; ücretler ve şirket bilgileri incelendikten sonra açıkça true yapılabilir. Receipt için müşterinin e-postası Stripe'a gider; dosya transferi support mailbox'a bağlı değildir. Stripe business details/support/terms/privacy/receipt metinlerini de web sitesiyle eşleştirin. Mercury payout değişmez.
8. **Retention operasyonu:** `triggers.crons=[]` bırakıldı. Scheduled kodu yerel test edildi. Test ortamı onayından sonra yalnızca bu Worker için `*/15 * * * *` kurun; sonra gerçek test ortamında 11:59:59/12:00 erişim, fiziksel silme, Cron gecikmesi, R2 silme hatası ve orphan sweep'i gözleyin. Zamanı kısaltıp üretim TTL test edildi demeyin. Kod yeni erişimi tam 12 saatte keser; fiziksel silme kuyruk/arıza nedeniyle daha sonra olabilir. Önceden indirilmiş kopyalar geri alınamaz. Minimum işlem kayıtları ayrı tutulur. Müşteri metadata/audit saklama süresi, hukuki gerekçe ve silme prosedürü henüz onaylanmadı.
9. **Dosya güvenliği/operasyon:** XER/CSV/PDF dışı dosyalar kapalı. Antivirus yok; imza kontrolü tarama değildir. Operatör güvenli açma/tarama ortamını kurmalı. 20 MiB bounded buffer için Workers bellek/yoğunluk testi yapın. Şu an global 20 aktif workspace, IP başına 5 oluşturma/10 dakika ve her istekte ilave limit var. Hacim beklentisine göre WAF/monitoring ve kotayı değerlendirip test edin. Ticari teslimatların 12 saat içinde admin tarafından güvenli başka sisteme alınması, oradaki saklama ve final dosya teslim yöntemi yazılı hale gelmeli.
10. **Yasal/ticari inceleme:** `LEGAL_APPROVED=false`. Privacy ekinin, terms/refunds taslağının, B2B/B2C zorunlu hakların, transfer/alt işleyen açıklamalarının, süre/retention ayrımının ve calendar'ın hukuk/mali uzmanla onayı gerekir. Önerilen takvim Pazartesi-Cuma UTC; kapsamda yazılı tatil istisnaları. Recovery, initial resource setup ve cap üstü işler tekliflidir. Kodda sipariş başına en çok 3 ücretli revizyon eklenir; bu MVP sınırını onaylayın. Update material doğrulaması için self-service ödeme kapalı, operatörün kapsam değerlendirmesi gerekir. Kod otomatik ticari kabul vermez.
11. **Apple ve gerçek destek:** `support@bluefintuna.life` için 550 sorunu çözülmeli; dış adresten gönder/al/yanıt testi kaydedilmeli. Eski mailto ve telefon tutuldu; çalışıyor diye beyan edilmiyor. Her uygulamanın gerçek App Store Connect Privacy/Support URL'sini sahibi kontrol etmeli. `/privacy.html`, `/company.html`, `/#contact`, `/support`, `/support/`, `/support.html` HTTP kontrolleri geçti fakat özel App Store Connect ayarlarına erişilmedi. Uygulama bazlı veri açıklamalarını ayrıca doğrulayın.
12. **Opsiyonel Telegram:** Bot/chat provisioning yapılmadı. İstenirse secret olarak `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; yalnızca sipariş ID/paket/toplam/son tarih. Ek veya özel dosya adı yok. DB dedupe var fakat Telegram dış sisteminde kesin exactly-once yok; crash sonrası tekrar mümkün. Uyarılar için tek doğruluk kaynağı admin DB'dir. Retry tükenmesi için izleme kurun.
13. **Yayın kararı:** Yukarıdaki staging testleri, erişilebilirlik/gerçek cihaz ve onaylar tamamlanmadan `PORTAL_ENABLED=true`, `APP_ENV=production`, `LEGAL_APPROVED=true` yapılmaz. `API_ORIGIN=''` şu an ön yüzü kapalı tutuyor. Kullanıcı açıkça onayladıktan sonra ayrı deployment planı uygulanır. PR merge, DNS değişikliği, gerçek Stripe anahtarı ve Cron bu teslimin parçası olarak çalıştırılmadı.

## Ready For Release

**Kod incelemesine hazır; production ödeme yayınına hazır değil.** Yerel otomatik testler, tip kontrolü, build, gerçek lokal Workers scheduled smoke ve responsive inceleme tamamlandı; sonuçlar `RELEASE_CHECKLIST.md` içinde. Uzak Stripe/Access/Cloudflare E2E, support mailbox, Apple hesap ayarları, legal/tax, kapasite ve operasyon onayları blokerdir.

Feature branch: `feature/bluefin-secure-payment-portal`. Yayın tabanı/rollback: `466e0fbee90c9aa7193b1ae742cab487c718f20e`. Değişiklik PR olarak sunulur; main merge yok. Önceki tarihli `docs/qa-report.md` eski statik siteye aittir; bu teslim için geçerli rapor `RELEASE_CHECKLIST.md`dir.

Rollback: intake için önce `PORTAL_ENABLED=false`; webhook/cleanup mevcut ödemeler ve dosyalar için çalışmaya devam etsin. Worker sürümünü doğrulanmış önceki sürüme alın; bekleyen dosyalar varken Hello World'e dönüp cleanup'ı kesmeyin. Statik PR'ı normal revert ile geri alın, force-push kullanmayın. D1/R2'yi silmeyin, TTL'yi uzatmayın. İnceleme sonrasında gerekirse tersine schema migration tasarlayın. Uzak rollback komutu bu teslimde çalıştırılmadı.

Teknik API/schema/tehdit modeli ve yerel komutlar: `cloudflare/worker/README.md`. Secret olmadan reproducible testler çalışır.
