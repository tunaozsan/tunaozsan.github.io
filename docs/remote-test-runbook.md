# Uzak test işletim planı — 2026-10-29

**Bu belgedeki uzak mutasyonlar NOT EXECUTED.** Her adım için ayrı açık owner onayı gerekir. Mevcut Worker, D1 ve R2 dışında kaynak oluşturmayın. Sıra değiştirilmez; başarısız preflight'ta durun.

## 1. Salt okunur durum ve 403 teşhisi

Çalıştırılan yerel `npx wrangler whoami`: token expired, non-interactive refresh başarısız. Cloudflare login başlatılmadı; account ID/binding/deployment version/uzak schema doğrulanmadı. Owner güvenli terminalinde oturumu yenileyip hesabı doğrulamalı; chat'e token yazmamalı.

`GET https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/health`:
- User-Agent `Python-urllib/3.9`: HTTP 403, `error code: 1010`.
- Tanımlayıcı User-Agent `Bluefin-Tuna-release-verification`: HTTP 200, **Hello World!**, text/plain.

Kanıt: `release-http-evidence-2026-10-29.json` (safe headers/Ray IDs). Bu bir çalışan portal API değildir. Farklı istemci yanıtı Cloudflare'ın [1010 / workers.dev Browser Integrity Check açıklamasıyla](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/) uyumludur. Genel korumayı kapatmak çözüm olarak uygulanmadı/önerilmez. Sonraki tanı isteğinde uygulamayı dürüstçe tanımlayan User-Agent kullanın; Access 401/403 ile bu sınır hatasını karıştırmayın.

```sh
cd cloudflare/worker
# Owner tarafından kimlik doğrulama ve hesap incelemesi; bu teslimde login yapılmadı:
# npx wrangler login
# npx wrangler whoami
# npx wrangler deployments list
# npx wrangler d1 info bluefin-project-db
# npx wrangler d1 execute bluefin-project-db --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
# npx wrangler d1 migrations list bluefin-project-db --remote
# curl -i -A 'Bluefin-Tuna-release-verification' https://bluefin-project-portal-api.bluefintuna-llc.workers.dev/health
```

Dashboard'da Worker `bluefin-project-portal-api`, D1 `bluefin-project-db` UUID `c21cc680-8df5-4f81-b411-20d18b0e5f37` binding `DB`, R2 `bluefin-project-uploads` binding `UPLOADS`, Standard/private doğrulanır. Başka hesap/UUID, beklenmedik veri, public R2 veya schema farkında DUR. Backup/export kişisel veriler içerebilir; approved encrypted storage ve erişim kontrolü olmadan repo/Downloads'a dökmeyin. D1 mevcut veri boş varsayılmaz.

## 2. İzolasyon, backup ve rollback onayı

Aynı production adlı kaynaklara test deploy gerçek availability ve veriyi etkiler. Mevcut veriyi inspect edin, D1 backup/time-travel imkânını ve geri dönüş noktasını dashboard'da doğrulayın, mevcut Worker version ID'yi kaydedin. Owner bu riski ve bakım penceresini kabul etmeden test deploy/migration yok. Yeni staging kaynak istenirse ayrıca onay gerekir; otomatik oluşturulmadı. Local Miniflare birincil test ortamıdır. Test ve canlı event/key/data eşzamanlı karıştırılmaz.

## 3. Şema / test Worker — ayrı onay kapıları

```sh
# NOT EXECUTED — yalnızca backup/schema ve owner onayından sonra:
# npx wrangler d1 migrations apply bluefin-project-db --remote
# npx wrangler deploy
```

0001 mevcut tabloları, 0002 paid_total/paid_tax/invoice ID ve global iki upload trigger'ını ekler. 0002 additive ama tekrar elle çalıştırılmaz; Wrangler migration ledger kullanılır. Mevcut kolonlar/trigger farklıysa durun; IF NOT EXISTS'in şemayı doğruladığını varsaymayın. Config dosyasındaki diğer binding'leri kaybetmeyin. Başlangıç `PORTAL_ENABLED=false`, `LEGAL_APPROVED=false`, boş Cron; yeni API JSON `/health` enabled false beklenir. Upload/checkout 503 beklenir, R2 public URL olmamalı.

## 4. Test anahtarları, Turnstile, Access — ayrı onay

Secrets güvenli owner terminalinden gizli prompt/dash secret alanıyla, hiçbir değer komutta/PR/logda yazılmadan:

```sh
# NOT EXECUTED — ayrı secret değişikliği onayından sonra, sadece TEST değerleri:
# npx wrangler secret put STRIPE_SECRET_KEY
# npx wrangler secret put STRIPE_WEBHOOK_SECRET
# npx wrangler secret put TURNSTILE_SECRET_KEY
# npx wrangler secret put RATE_LIMIT_SALT
```

`APP_ENV=test`, gerçek test hesabı `STRIPE_ACCOUNT_ID`, `sk_test_`, test endpoint whsec; güçlü salt. Gerçek kullanıcı kabulü yok; sadece sentetik dosyalar. Portal/Legal flag'in test amaçlı true olması canlı hukuk onayı anlamına gelmez ve yalnızca onaylı izole test penceresinde kullanılabilir. Checked-in production vars değişmedi.

Turnstile allowed hostname gerçek site, action `create-order`; public key frontend config, secret Worker. Success, expired, yanlış hostname/action ve yeniden deneme test edilir. Captcha korumasını bypass etmeyin.

Access uygulaması yalnız `/api/v1/admin/*`; issuer/audience ve owner e-posta allowlist. Public `/health`, customer API ve `/api/v1/stripe/webhook` Access login'e yönlenmemeli. OPTIONS preflight gerekirse yalnız OPTIONS için kontrollü istisna; gerçek admin request her zaman JWT doğrular. Allowed / other email / expired / forged / direct workers.dev denenir. Test helper `adminKeys` yalnız injected local dependency, production default remote JWKS kullanır.

## 5. Origin ve Safari

Ayrı DNS/route onayıyla aynı-site `api.bluefintuna.life` düşünülebilir; mevcut apex/CNAME/GitHub Pages değişmez. `portal-config.js` API_ORIGIN, layout CSP connect-src, Worker exact CORS birlikte incelenir. Workers.dev üçüncü taraf Access cookies Safari'de kısıtlanabilir. Login'i API domaininde yapıp admin shell'e dönün; gerçek Safari/iOS ile cookies/preflight test edilir. CSRF origin kontrolünü kaldırmayın; wildcard CORS yok.

## 6. Stripe test + PDF invoice

Endpoint `<APPROVED_API_ORIGIN>/api/v1/stripe/webhook`, checkout.session.completed / async_payment_succeeded / async_payment_failed / expired. Pinlenen API `2025-02-24.acacia` uyumluluğunu dashboard/test request'te doğrulayın. İmzayı replay ederken header timestamp'i geçerli tutun; `stripe trigger` rastgele sipariş metadata'sıyla tamamlanmış E2E sayılmaz. Gerçek test checkout'tan oluşan order/session'i izleyin. Duplicate event, delayed event, wrong account/currency/amount, cancellation, expiry, network retry, pending/failure/success test edin.

Invoice false/true ve tax reviewed-manual/automatic test matrisini `ops-and-billing-runbook.md` ile çalıştırın. Gerçek PDF/bill-to/tax/email/fees kontrol edilmeden production invoice enable yok. Mercury payout ve eski linkler değişmez.

## 7. 12 gerçek saat, cleanup ve monitoring

Yerel simulated clock sonucu uzak 12 saat gözlem yerine geçmez. Onaylı test ortamında creation/expiry UTC zamanını kaydedin. 11:59:59 ve 12:00:00 yeni read/download sınırını paid/unpaid test edin; ödeme TTL uzatmaz. Ardından fiziksel R2 silmeyi ve hata sonrası retry/orphan recovery'yi izleyin.

```json
// NOT APPLIED — scheduled test, izolasyon ve ayrı Cron onayından sonra:
{"triggers":{"crons":["*/15 * * * *"]}}
```

Cron UTC, sadece bu Worker. `/api/v1/admin/operations` Access korumalı aggregate monitor: heartbeat >30dk, silme backlog'u, notification >15dk gecikme/8 retry, son saatte alınmamış paid dosyalar. Dashboard'u manuel gözlemleyin; approved redacted alert collector/paging ayrıca kurulmalı. Service-token email claim'i olmadan mevcut human allowlist'i geçmez; sırf monitor için auth gevşetmeyin. Monitoring consumer daha sonra ayrı tasarlanıp onaylanır. Secret/body/filename/URL capability loglamayın.

## 8. Durdurma / geri dönüş

Yanlış account/binding, public bucket, yanlış tutar/tekrar charge, unauthorized admin, erken/geç access cutoff veya kayıp cleanup durumunda yeni intake'i kapatın; canlıya geçmeyin. Webhook ve cleanup bekleyen işlemleri işlemeye devam etsin. Önceden kaydedilen doğrulanmış Worker sürümüne dönmek ayrı operasyon onayı gerektirir; aktif dosyalar varken Hello World'e dönüp cleaner'ı kaybetmeyin. D1/R2 silinmez, TTL uzatılmaz, destructive down migration yok. Statik değişiklik normal PR revert ile; main merge ve public release ayrıca onaylanır.
