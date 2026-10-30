> Güncel 29 Ekim sonucu: Access/Turnstile/Sandbox ödeme testleri tamamlandı; staging intake kapalı, Cron */15 açık. Aşağıdaki ilk kurulum planı tarihsel olabilir. HANDOFF.md güncel tablosu ve staging-ttl-followup.md esas alınmalıdır.

# Bluefin Tuna — izole staging kurulumu, 29 Ekim 2026

Yalnız staging kurulumu için verilen kullanıcı onayıyla ilerlenmiştir. Production Worker/D1/R2, DNS, Apple Privacy/Contact/Support sayfaları, Mercury ve canlı Stripe ayarlarına değişiklik yapılmamıştır. Global API Key okunmadı veya kullanılmadı. Mevcut Wrangler OAuth oturumu `ozsan_tuna@yahoo.com.tr` olarak doğrulandı.

## Kaynaklar

- Cloudflare account: `fc9c616595b1d9b6edb82fca91501e47`
- Worker: `bluefin-project-portal-staging`
- Hedef URL: `https://bluefin-project-portal-staging.bluefintuna-llc.workers.dev`
- D1: `bluefin-project-db-staging`, UUID `f87e0350-e5ef-4173-a728-a0678b882c23`, binding `DB`.
- R2: `bluefin-project-uploads-staging`, binding `UPLOADS`, Standard; r2.dev public erişimi kapalı olarak doğrulandı.
- `0001_init.sql` ve `0002_release_evidence.sql` yalnız staging D1'e uygulandı. İlk deneme ağ hatası verdi; migration kayıtlarını kullanan tekrar başarılı oldu.
- Ayrı yapılandırma: `cloudflare/worker/wrangler.staging.jsonc`.
- Staging entry point: `cloudflare/worker/src/staging.ts`; API ve Static Assets aynı origin'de çalışır. Production entry point değişmedi.
- `node scripts/build-staging.mjs` yalnız `.build/staging-assets` üretir; production HTML/config/bundle dosyalarını değiştirmez. Staging sayfaları test etiketi ve noindex taşır. Arayüz yalnız portal/admin/ödeme dönüş sayfalarını içerir; tam kurumsal sitenin kopyası değildir.

## Kapalı tutulan özellikler

`APP_ENV=test`, `PORTAL_ENABLED=false`, `LEGAL_APPROVED=false`, `INVOICE_CREATION=false`, `TAX_MODE=unconfigured`, `triggers.crons=[]`.

`ACCESS_AUD` ve `STRIPE_ACCOUNT_ID` boştur. Production audience veya live Stripe anahtarları kopyalanmadı. Test secret'ları henüz girilmedi. Admin endpoint'in `503 admin_not_configured`, sipariş oluşturmanın `503 portal_not_enabled` vermesi bu aşamada beklenir.

## Kullanıcının sıradaki adımları

1. Yeni Access uygulamasını staging hostname ve `/api/v1/admin/*` yolları için oluşturun. Sadece `ozsan_tuna@yahoo.com.tr` allowlist; yeni staging AUD paylaşılabilir. Aynı Cloudflare Access issuer kullanılabilir. Webhook `/api/v1/stripe/webhook` Access login'e yönlenmemeli. Tüm workers.dev hostname'ini otomatik olarak Access ile kapatmayın; webhook erişimini ayrıca doğrulayın.
2. Ayrı Stripe Sandbox oluşturun; yalnız onun `acct_...` kimliğini paylaşın. Gerçek kart/banka hesabı ve Mercury ayarlarına işlem yapmayın.
3. Sandbox'ta staging URL + `/api/v1/stripe/webhook` için snapshot webhook oluşturun. Olaylar: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`. Mevcut kodun Stripe API sürümüyle uyumunu doğrulayın.
4. Yalnız staging Worker Settings → Variables and Secrets alanına `STRIPE_SECRET_KEY` (sk_test_), `STRIPE_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `RATE_LIMIT_SALT` girin. Değerleri sohbet/Git/loglara koymayın. Dashboard'da değişiklik kaydı yeni deployment oluşturabilir; hedef Worker adını kontrol edin.
5. Staging'e özel Turnstile widget/site key oluşturun. Public site key frontend build'e ayrıca bağlanmalı; şu an boştur. Hostname staging host, action `create-order`.
6. Secret olmayan AUD/account/site key geldikten sonra yalnız staging config ve build güncellenecek. Portal ve legal flag test için açılmadan önce izolasyon tekrar kontrol edilecek. Production flag'leri değişmeyecek. Tax modu test senaryosuna göre seçilecek; owner_reviewed_manual otomatik vergi eklemez.
7. Stripe test Checkout/webhook, invoice false/true PDF senaryosu ve sentetik XER/CSV/PDF yükleme testleri yapılacak. Office/ZIP kapalıdır.
8. Yalnız staging için Cron açıldıktan sonra 12 gerçek saatlik cutoff ve takip eden başarılı Cron ile fiziksel silme gözlenecek. Şu anda Cron açılmadı ve 12 saat testi başlatılmadı. Ödeme TTL'yi uzatmamalı. Test bitiminde bekleyen nesneler temizlenmeden cleanup kapatılmamalı.

## Yerel doğrulama

- Typecheck: PASS.
- 32 Worker testi: PASS, 0 fail/skip; staging bağlantı izolasyonu, API'nin asset routing'e düşmemesi, kapalı admin/sipariş davranışı ve test dışı APP_ENV reddi dahil.
- 1112 statik assertion / 23 sayfa: PASS.
- Worker format kontrolü: PASS.
- Staging build: PASS.

Uzak Stripe/Access/Turnstile testleri ve 12 saatlik gözlem henüz yapılmadı. Üretim Admin API erişiminin çalıştığı, kullanıcı tarafından önceki mesajında bildirildi; bu oturumda production ayarlarına müdahale edilmedi.

## Tekrarlanabilir işlemler

Aşağıdaki komutlar yalnız staging config'i hedefler. Bunlar production deploy izni değildir.

```sh
node scripts/build-staging.mjs
cd cloudflare/worker
npx wrangler deploy --config wrangler.staging.jsonc
```

Gelecekte gerekli secret'lar gizli prompt ile de girilebilir; değer komuta eklenmez:

```sh
npx wrangler secret put STRIPE_SECRET_KEY --config wrangler.staging.jsonc
```

Secrets değişikliği deployment'ı etkiler; bu komut bu oturumda çalıştırılmadı. Config dışındaki production dosyası `wrangler.jsonc` ile deploy çalıştırmayın. Kurulum değişiklikleri yereldedir; Git push/merge yapılmamıştır.

## Yayın ve uzak smoke sonucu

Staging yayınlandı. Worker version: `d4731a11-82ab-4ec4-b337-24dae5c5a03a`.

- `/health`: HTTP 200, `mode=test`, `enabled=false`.
- `/project-portal/`: HTTP 200, staging test etiketi mevcut.
- `/assets/scripts/portal.js`: HTTP 200, staging origin mevcut; production API origin yok.
- `/api/v1/admin/operations`: HTTP 503, `admin_not_configured` (staging AUD henüz yok).
- `POST /api/v1/orders`: HTTP 503, `portal_not_enabled`; test siparişi oluşturulmadı.

Kanıt: [staging-smoke-2026-10-29.json](staging-smoke-2026-10-29.json). İlk DNS sorgusu başarısız oldu; yeniden çözümleme ve HTTP kontrolleri başarılı. İlk smoke betiğinde curl'ün 503 otomatik retry gövdelerini birleştirmesi JSON ayrıştırma hatasına yol açtı; beklenen 503 yanıtları tekrar edilmeyen son kontrolde doğrulandı. Bu hata Worker hatası değildi. Yerel typecheck ve tüm testler başarılı; gerçek staging Access girişi, Stripe ödemesi, dosya yükleme ve 12 saat testi hâlâ bekliyor.

## Son durum — Sandbox kimliği ve eksik yetkiler

Kullanıcı ayrı `Bluefin Tuna Portal Staging` Sandbox'ını oluşturduğunu bildirdi. `acct_1UVrQ3BxU4PsnoX0` yalnız yerel `wrangler.staging.jsonc` dosyasına eklendi; Stripe API üzerinden hesap doğrulaması yapılmadı ve bu adımda deploy yapılmadı. Önceki boş hesap kimliği kaydı ilk yayının durumudur.

Mevcut OAuth ile Access uygulamaları listelendi. Yalnız staging `/api/v1/admin/*` için owner-only uygulama oluşturma isteği HTTP 403, code 1010, `auth.forbidden` ile reddedildi. Tekrar listeleme staging uygulaması bulunmadığını doğruladı; AUD üretilmedi. Gereken erişim: bu Cloudflare hesabında `Access: Apps and Policies Write` yetkisi olan yetkilendirme. Global API Key kullanılmadı; mevcut OAuth tokenı yalnız bellekte kullanıldı ve çıktıya/repoya yazılmadı. API izin referansı: https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/

Staging `wrangler secret list` yalnız adları okudu ve boş liste döndürdü. Stripe bağlantısı/Sandbox API yetkilendirmesi mevcut değil. Hazır secret adları:

- `STRIPE_SECRET_KEY`: yalnız belirtilen Sandbox'ın test API anahtarı.
- `STRIPE_WEBHOOK_SECRET`: yalnız staging webhook endpoint'inin signing secret'ı; API anahtarından türetilemez.

Değerler yalnız `bluefin-project-portal-staging` Worker Secrets alanına girilmeli. Sahte placeholder secret oluşturulmadı. Secret'lar sohbet, config, Git veya loglara yazılmamalı. Otomatik yapılandırma için ilgili Stripe Sandbox'ın anahtar/webhook yönetim erişimi gerekir; alternatif olarak owner bu iki değeri doğrudan staging Secrets alanına girebilir.

Yerel 32 Worker testi, 1112 site kontrolü, typecheck, format ve staging build PASS. Ödeme/yükleme/Cron kapalı; production, Mercury, DNS ve canlı Stripe değişmedi. Bu adımda yeni deployment, ödeme veya Git push yapılmadı. Kanıt: `docs/staging-authorization-status-2026-10-29.json`.
