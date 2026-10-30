# C — Production readiness ve rollback (NO GO)

Production izni verilmez. Draft yürürlükte değildir; owner/legal onayı açık. Stripe Live, Mercury, DNS ve Apple yolları değişmedi.

## Yayın öncesi engeller

- 22 ürün için ortam bazlı gerçek Product/Price/active ve SKU lookup_key doğrulaması. Live ID'ler tahmin edilmez, Sandbox ID'leri Live'a kopyalanmaz.
- Yeni Catalog Price yolunda normal paket gerçek Sandbox ödeme/webhook/D1 PASS (93355bdd-6949-4891-96c3-e00e57577dc0). Çoklu ek için gerçek katalog kayıtları eksik: E2E NOT RUN. Bu yeni siparişin Cron/Drive transferi ayrıca gözlenmedi. Önceki dinamik fiyatla yapılmış testler yeni yolun testi sayılmadı.
- Gerçek Sandbox doğrudan Link ve refund senaryoları; eski linklerin satış mutabakatı.
- Final APPROVED sözleşme sürümü, yürürlük tarihi, tüketici/erken ifa, vergi ve Drive saklama onayı; pilot kapsamı ve Update malzeme incelemesi.
- Önceki güvenlik, tarama, fatura ve saklama konuları HANDOFF'ta açık kalır.

## Rollback

1. Önce sipariş kabulünü kapat; webhook ve Cron'u kapatma. Açık Session'ları ve ödeme olaylarını kaybetme.
2. D1 backup/export ve Worker version kaydını al; kabul tablosunu düşürme/sıfırlama, geçmiş kabul uydurma.
3. Önceki Worker sürümü yeni zorunlu D1 kapısını içermiyorsa doğrudan geri dönme: kapalı intake + mevcut consent guard ile düzeltme sürümü kullan. Katalog mapping hatasında fiyatı tahmin ederek fallback yapma.
4. İş kuyruğunu tut; ödenmiş ancak consent'siz tarihsel siparişleri manuel incele. R2 12 saat temizliği ve mevcut Drive saklama işleri devam eder.
5. Eski Live linkleri otomatik yeniden açma. Geri dönüş için ayrı owner onayı ve yeni güvenlik değerlendirmesi gerekir.

## Test kapsamı

Yerel Worker/Miniflare: normal paket, çoklu ek, uyumsuz ek, client fiyat değişikliği, eksik/eski consent, duplicate webhook, yanlış order/session, refund hold, failed/cancelled payment; eksik D1 kabulünde enqueue/upload reddi ve eksik Catalog Price'ta fail-closed PASS. Gerçek yeni Sandbox Catalog/Payment Link E2E: NOT RUN — 15 Sandbox Product/Price eksik; gerçek doğrudan Link/refund senaryosu henüz yürütülmedi. Bu ayrım yayın kararı açısından zorunludur.

Gerçek eksik/eski consent retleri ve checkbox başlangıcı PASS; yeni ödeme için Stripe native invalid/aria testi NOT RUN (Stripe özel checkbox kullanıyor); önceki ayrı Stripe ret kanıtı korunur. Gerçek tarihsel PAID siparişinde D1 kabulü olmadan admin upload 403 PASS; backfill yapılmadı.


## Son Sandbox doğrulaması — önceki NOT RUN maddelerini günceller

- PASS: 15 eksik Product/Price oluşturuldu, tüm 22 kayıt doğrulandı; idempotent tekrar 0 kopya.
- PASS: gerçek çoklu ek Checkout ($799 + $175 + $249 + $99 = $1,322), dört Catalog Price satırı, signed webhook ve D1 ACCEPTED/PAID.
- PASS: gerçek tam Sandbox refund succeeded; transfer payment_on_hold; Cron tarafından dört iş hold hatasıyla RETRY, beşinci iş henüz pending; VERIFIED iş yok.
- PASS: cancel dönüşü sonrası gerçek Stripe expire ve webhook → EXPIRED_UNPAID; paid_at null, Drive işi yok.
- PASS: gerçek Payment Link ödeme/terms kabulü D1 portal kabulü sayılmadı; geçici link devre dışı.
- Açık: D1 order durumunda tarihsel PAID bilgisi korunuyor; otomatik refund event → muhasebe/hold projeksiyonu ve önceden yayınlanmış teslimlerde refund sonrası erişim iptali bu turda uygulanmadı/test edilmedi. Yeni aktarım ve publish öncesi Stripe kontrolü bunların yerine geçmez. Production öncesi bu akışın tasarımı ve doğrulaması gerekir.
- NOT RUN: Live envanter/deploy, owner/legal onayı ve yeni gerçek 12 saat bekleme. R2 TTL değişmedi. Pilot/Update scope kapıları ve Draft korunur.

62 Worker testi, typecheck, 1115 site assertion ve Apple legacy koruma testleri PASS. Test araçları süreli ve admin korumalıdır; son yapılandırmada süre değişkenleri tamamen kaldırıldı. Production readiness hâlâ **NO GO**.


## 30 Ekim — refund erişim iptali açığı staging'de kapandı

[Gerçek Sandbox raporu](refund-delivery-revocation-2026-10-30.md): yayınlanmış teslim iade öncesi indirildi; gerçek charge.refunded webhook D1 hold/event kaydetti ve tüm davet/oturumları iptal etti. Sonraki indirme/Range 401, re-publish/regenerate 403. Önceki otomatik refund-event projeksiyonu ve yayınlı teslim revoke eksikleri staging için PASS olarak güncellendi. Runtime request kontrolü ve Cron fallback eklendi; kayıtlı retention değişmedi. Bu sonuç production izni değildir. Final sözleşme ve owner/legal onayları, Live katalog doğrulaması ve diğer yayın ön koşulları açık kalır. Rollback'te 0005 tablolarını silmeyin ve refund guard'ı olmayan sürümü aktif satışla açmayın.
