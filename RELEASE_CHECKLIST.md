# Yayın adayı doğrulaması — 2026-10-29 (Asia/Samarkand)

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
