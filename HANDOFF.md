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

# Türkçe teslim — 29 Ekim 2026

## Already Created

Mevcut kaynaklar yeniden oluşturulmadı. Branch `feature/bluefin-secure-payment-portal`, mevcut PR #4 üzerinde devam edildi; başlangıç `caad21abc969931e28e0a94019d9224a77eaa844`, main tabanı `466e0fbee90c9aa7193b1ae742cab487c718f20e`. Onaylı logo/CNAME/Apple kaynak metni korunuyor.

**Gelen destek e-postası çözüldü:** `support@bluefintuna.life` sahibi tarafından 2026-10-29 tarihinde doğrulandı. Bağımsız dış gönderici testi yapmış gibi raporlanmıyor. Eski hata banner'ları kaldırıldı. Outbound/reply smoke ve SPF/DKIM/DMARC incelemesi ayrı küçük takip işi; gelen posta artık blocker değildir. Dosya teslimi yine e-postaya bağlı değildir.

**Uzak Worker tanısı:** tanımlayıcı User-Agent ile `/health` HTTP 200, `Hello World!`; varsayılan Python User-Agent ile 403/1010. Cloudflare 1010 açıklaması browser-signature kontrolüyle uyumlu. Koruma değiştirilmedi. Mevcut public route henüz bu API'yi sunmuyor. `wrangler whoami` token expired nedeniyle başarısız; account/binding/version/D1 veri durumu yetkili dashboard'da doğrulanmalı. Kanıt: [HTTP raporu](docs/release-http-evidence-2026-10-29.json).

## Implemented in Code

Önceden hazırlanmış kod korunarak şu boşluklar tamamlandı:

- Fatura feature flag false/true, bill-to email/address, customer creation, invoice metadata ve vergi davranışı test edildi. Flag default false; invoice ID yalnız verified session'da mevcutsa kaydedilir. PDF içeriği/delivery gerçek Stripe hesabında henüz doğrulanmadı.
- Doğrulanmış paid total/tax ve Stripe invoice reference için additive `0002_release_evidence.sql`. Admin ve müşteri durumunda gerçek paid total, admin'de aktivite sayısı/retrieval ve reupload ayrımı.
- Açık checkout yeniden kullanımı yine consent ister; expired/completed session tekrar yönlendirilmez. Wrong account/metadata, tampered totals, async fail/success/late events ve duplicate webhook kapsamı genişletildi.
- Global en çok iki eşzamanlı 20 MiB upload rezervasyonu; gerçek lokal Workers runtime'da iki büyük upload ve üçüncü isteğin reddi test edildi. XER kategorisine PDF koyarak zorunlu XER'ı atlatma kapatıldı. Forged Content-Length, abort/retry, MIME ve Office ret testleri eklendi.
- `GET /api/v1/admin/operations`: Access korumalı cleanup heartbeat, delete backlog/retry, geciken/tükenen bildirim, retrieval uyarıları. Dış alarm servisi kurulmadı.
- PAID hazır durumda tüm dosyaların download girişimi kaydı olmadan retrieved teyidi verilemez. Operatör indirilen/taranan çalışma kopyasını ayrıca doğrular; DRAFT reupload erken retrieved olamaz.
- Policy bundle `portal-draft-2026-10-29` ekranda gösterilir ve quote hash/consent ile doğrulanır. Terms/privacy/refund/retention birlikte review gerektirir.
- E-posta hata metinleri kaldırıldı; mailto ve telefon kaldı. 7 paket fiyatı/teslim günü değiştirilmedi. Apple privacy/support/contact URL'leri ve orijinal policy paragraf regression'ları korunuyor.

## Pending Owner Setup

Detaylı, sıralı ve durma koşullu talimat: [Uzak test runbook](docs/remote-test-runbook.md). Aşağıdaki uzak mutasyonların **hiçbiri çalıştırılmadı**:

1. Owner güvenli terminalde Cloudflare oturumunu yeniler; doğru hesap, Worker versiyonu, DB UUID/binding, private R2 ve gerçek D1 tablolarını salt okunur doğrular. Tokenları chat'e koymayın. D1 boş varsayılmamalı; backup ve rollback planı hazırlanır.
2. Test izolasyonu için açık onay verilir. Tek mevcut production adlı kaynaklara test deploy veri/availability riski taşır. Yeni staging kaynakları otomatik oluşturulmaz; gerekirse ayrıca onay alınır.
3. Ayrı migration onayı sonrası, `cloudflare/worker` dizininde `npx wrangler d1 migrations apply bluefin-project-db --remote`. Mevcut 0001/0002 ledger ve schema önce kontrol edilir. Sonra ayrı deploy onayı ile `npx wrangler deploy` mevcut Worker'ı değiştirir. Başlangıçta disabled flags ve boş Cron korunur.
4. Ayrı secret/config onayıyla yalnız Stripe test anahtarı, webhook test secret, Turnstile secret ve random salt güvenli Cloudflare secret mekanizmasına girilir. `STRIPE_ACCOUNT_ID`, exact origin, Turnstile hostname/action doğrulanır. Hiçbir gerçek değer repoya yazılmaz.
5. Access yalnız `/api/v1/admin/*`; issuer/audience/e-posta allowlist, yanlış/expired/forged JWT testleri. Customer API/webhook login'e zorlanmaz. Gerekiyorsa aynı-site API alan adı için ayrı DNS/route onayı; CSP/CORS/API_ORIGIN eşleştirilir. Safari cookie/login/OPTIONS testi yapılır.
6. Gerçek Stripe test Checkout, signed webhook retries, wrong totals/account, cancellation/async ve PDF invoice/bill-to/email/fees/tax doğrulanır. `INVOICE_CREATION=false`, `TAX_MODE=unconfigured` şimdilik kalır; Mercury payout ve legacy Payment Links değişmedi. [Ops ve billing runbook](docs/ops-and-billing-runbook.md).
7. Uzak scheduled testi ve ayrı Cron onayı sonrası bu Worker'a `*/15 * * * *` UTC uygulanır. Gerçek 12 saat cutoff, fiziksel silme, hata/retry/orphan, monitoring ve alarm teslimi gözlenir. Yerel fake clock gerçek 12 saat gözlem değildir.
8. Dosya politikası: **XER/CSV/PDF**. XLSX/DOCX/XLS/ZIP/makro desteği tamamlanmadı; OPC/OLE inspection ve antivirus pipeline yokken açılmadı. [Dosya risk matrisi](docs/file-security-policy.md). CSV/PDF export ya da operatörün onaylayacağı kontrollü taramalı transfer; e-posta eki veya public link yok. Gerçek Worker planı yük/bellek testi ve tarama/çalışma deposu kurulumu bekliyor.
9. Owner çalışma deposu erişimi/şifreleme/retention/final teslimat prosedürünü belirler; 12h R2 intake dışında 4–12 iş günlük işleme kopyaları için ayrı hukuki dayanak gerekir. Minimum işlem/customer metadata retention süresi hâlâ review ister. Legal/refund/B2B-B2C/tax/calendar ve müşteri hakları onaylanmadan LEGAL_APPROVED değişmez.
10. Her uygulamanın özel App Store Connect Privacy/Support URL'si owner verification required. Public legacy URL GET'leri 200 ve yerel regression geçiyor; hesap ayarları erişilmedi. Gelen e-posta resolved; outbound/reply/SPF/DKIM/DMARC takip işidir.
11. İstenirse Telegram secret'ları ayrı onayla; zorunlu değil, dosya/PII göndermez. Ops monitor kodu mevcut, external pager/watchdog ve gerçek alarm teslimi pending. EN dışı dil yayımlanmadı; [çeviri kapsamı](docs/translation-coverage.md).

## Ready For Release

**Kod incelemesine hazır; production-ready değil.** Güncel komut çıktıları ve sonuçlar [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), [yerel test kanıtı](docs/release-local-tests-2026-10-29.json) içinde. Gerçek Stripe PDF/invoice ve Access/Turnstile E2E, 12 gerçek saat, gerçek plan capacity, legal/tax/retention ve owner sign-off hâlâ kritik gate.

`APP_ENV=development`, `PORTAL_ENABLED=false`, `LEGAL_APPROVED=false`, `INVOICE_CREATION=false`, `TAX_MODE=unconfigured`, `triggers.crons=[]`, `API_ORIGIN=''` korundu. Production deployment, remote migration, live secret/payment, DNS, Cron, public release ve main merge için **eylem bazında ayrı onay** gerekir. PR güncellemesi bu onayların yerine geçmez.

Rollback: yeni intake durdurulur; bekleyen işlemler için webhook ve cleanup sürer. D1/R2 silinmez, TTL uzatılmaz; eski doğrulanmış Worker sürümüne geçiş ve normal static revert ayrıca onaylanır. Aktif dosyalar varken Hello World'e dönülmez. Ayrıntılar runbook'tadır.
