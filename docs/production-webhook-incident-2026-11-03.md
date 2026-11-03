# Production Stripe webhook incident — 3 Kasım 2026

**Çözüldü.** Production kodu `7939186`, Worker sürümü `2de87357-01c6-4c76-ae0b-0a308df21632` (%100). Mevcut webhook endpointi ve imza doğrulaması korunmuştur. [Olay bazlı kanıt ve sonuçlar](production-webhook-incident-2026-11-03.json).

## Gerçek neden ve etki

31 Ekim 2026 06:39:25–06:43:49 UTC arasında eski Payment Links geçişi sırasında ödenmemiş açık Checkout Session'ları kapatıldı. Stripe bunlar için `checkout.session.expired` olayları üretti. Bu eski Session'lar portal D1 siparişinden oluşturulmadığı için `metadata.order_id` ve `client_reference_id` boştu. Worker, geçerli imzayı doğruladıktan sonra portal siparişi bulamayarak **HTTP400 `unknown_order`** döndürüyordu. Stripe event kaynağındaki `retire-session-…` idempotency referansı önceki kontrollü geçişle örtüşüyor.

**16 benzersiz olay** etkilendi. Kullanıcının e-postasındaki 95, inceleme başlangıcındaki Dashboard'da 112 olan sayı yeniden teslimat denemeleridir; ödeme veya benzersiz olay sayısı değildir. İlk olayın Stripe origin zamanı 06:39:26 UTC, API created değeri 06:39:25 UTC'dir. Örnek başarısız olay `evt_1UWVwvBzdKYgwVw6a2WcpNQO`, deneme `wc_1UXZKwBzdKYgwVw6ibZDL4hN`, HTTP400 `unknown_order`.

Stripe Live API bütün sayfaları tamamlanmış sonuçlarda **0 charge, 0 PaymentIntent, 0 refund; 37 Checkout Session'ın tümü expired/unpaid** gösterdi. Etkilenen 16 Session'ın PaymentIntent'i null. D1'de önceden var olan tek sipariş `EXPIRED_UNPAID`, Session bağlantısı ve paid_at null; 0 kabul, 0 ödeme, 0 refund kaydı. **Tahsil edilmiş fakat işlenmemiş finansal olay bulunmadı; hayalî ödeme veya inceleme kaydı açılmadı.** Kabulü olmayan gerçek bir ödeme gelirse mevcut ayrı `payment_reviews` koruması geçerlidir; otomatik fulfillment yapılmaz.

## Uygulanan güvenli düzeltme

- Raw body Stripe-Signature, zaman penceresi, Live mode ve hesap kontrolleri değiştirilmedi.
- Yalnız bilinen sekiz eski Payment Link'in `expired/unpaid`, PaymentIntent'i null, portal referansı olmayan Session olayları ayrı sınıflandırılır. Merchant ve ilgili Session, mevcut Stripe Live API üzerinden yeniden okunup doğrulanır. Başka link, ödeme alınmış veya portal siparişine bağlı Session bu yola giremez.
- Doğrulama sonrası mevcut D1 `audit_events` tablosuna event ID başına tek atomik kayıt yazılır. Yeni order, sözleşme kabulü, PAID, fatura, Drive işi veya migration oluşturulmaz. Sağlayıcı veya DB hatası 2xx ile gizlenmez.
- Webhook/refund işleyişi müşteri intake kapısından bağımsızdır; kapalı intake testi yerel production wrapper üzerinde PASS. Mevcut doğrudan Checkout politikası bu olay nedeniyle değiştirilmedi.

## Doğrulama

| Kontrol | Sonuç | Kanıt / sınır |
|---|---|---|
| Gerçek Stripe Live yeniden teslimatı | PASS | 16/16 olay Dashboard Resend ile HTTP200, Delivered / Recovered; 3 Kasım 08:32:04–08:43:25 UTC |
| Aynı olayın tekrar teslimatı | PASS | `evt_1UWVwnBzdKYgwVw6n2j9Jdu7`, 08:43:48 UTC, HTTP200 `duplicate:true`; D1'de yine tek kayıt |
| Stripe API son mutabakat | PASS | `delivery-success=false` boş, has_more=false; özgün 16 eventin pending_webhooks=0 |
| D1 son mutabakat | PASS | 16 tekil audit kaydı; 1 eski unpaid order; PAID/kabul/ödeme/refund/review/Drive job/fatura sayıları 0 |
| Worker canlı izleme | PASS | 17 gerçek Stripe isteği HTTP200, exception=0; negatif imzasız curl isteği HTTP400 invalid_signature |
| Yerel güvenlik/regresyon | PASS | 157/157 Worker testi ve typecheck. Eşzamanlı duplicate, imza/zaman/mode/account, provider/DB hata, bağlı Session ve mevcut refund/consent/capture yolları |
| Access ve konfigürasyon | PASS | Access yalnız `/api/v1/admin` ve `/api/v1/admin/*`; webhook kapsanmıyor. Public vars, secret isimleri, D1/R2 binding ve Cron yayın öncesi/sonrası aynı |
| Geçmiş Worker telemetry | NOT RUN — kayıt yok | Observability önceden kapalı; aynı tarih aralığı sorgusu 0 kayıt döndü. Tarihsel log varmış gibi sunulmadı; neden Stripe'ın gerçek HTTP400 yanıtlarından belirlenir |
| Yeni Live ödeme / iade / self-payment | NOT RUN — istenmedi | Yeniden gönderilenler yalnız gerçek eski unpaid expiry olaylarıdır; yeni ödeme oluşturulmadı |
| Site assertion tekrar çalıştırma | NOT RUN — kapsam dışı | UI/Apple dosyaları değişmedi; önceki 1115 PASS kanıtı korunur |

Python urllib ile yapılan ayrı imzasız tanılama isteği Cloudflare tarafından HTTP403 / 1010 ile Worker'a ulaşmadan reddedildi. Standart curl isteği Worker'dan HTTP400 `invalid_signature` aldı. Bu istemciye özgü tanılama sonucu, gerçek Stripe olaylarının HTTP400 `unknown_order` kök nedeni değildir. Access/WAF kuralları gevşetilmedi. Tarihsel WAF logları mevcutmuş gibi raporlanmadı; gözlenen Stripe yanıtları ve canlı Worker tail isteklerin uygulamaya ulaştığını doğrular.

## Korunanlar, geri dönüş ve takip

Migration ledger **0001–0010 aynı**, migration tekrarlanmadı. Cron `*/15 * * * *`, 12 saatlik TTL, R2, webhook secret, refund kuralları, Mercury payout, DNS, Apple Privacy/Support/Contact yolları değişmedi. Eski Payment Links inactive kalır; yeni link/ürün/endpoint oluşturulmadı. Sözleşme v2/hash ve ödeme politikası aynı.

Geri dönüş Worker sürümü `c8487b6d-1fdd-46a8-846e-7242623bf4fd`, önceki main `53a3d8e` (runtime kaynak `546665a`). D1'i geri yüklemeyin veya audit/ödeme geçmişini silmeyin. Bu eski sürüm expiry sınıflandırma hatasını geri getirir; geri dönüş gerekirse aynı korumayı içeren ileri düzeltme tercih edilmeli ve Stripe tekrarları izlenmelidir.

Bu incident için kalan zorunlu kullanıcı işlemi yok. Stripe eski başarısız denemeleri geçmişte göstermeye devam edebilir; bu, son teslimatın başarısız olduğu anlamına gelmez. Stripe e-posta uyarısının kapanış zamanını ayrıca gözlemlemedik. Ham yerel kanıtlar `.qa/webhook-incident-20261103/` içinde Git dışındadır; cookie, JWT, API key ve webhook signing secret rapora veya Git'e yazılmadı.
