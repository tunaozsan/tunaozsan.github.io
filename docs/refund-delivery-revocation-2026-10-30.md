# Refund sonrası otomatik teslim erişim iptali — staging

Durum: **gerçek Sandbox uçtan uca PASS**. Production'a uygulanmadı; tüm sözleşmeler DRAFT. Önceki raporlardaki “yayınlanmış teslimde refund sonrası erişim iptali” açığı bu staging sonucu ile kapanır.

## Uygulama

- Mevcut Sandbox webhook endpointine `charge.refunded` eklendi. Dört Checkout olayı korundu. Webhook Snapshot sürümü `2026-09-30.endive`, REST sürümü `2025-02-24.acacia` değişmedi. Production webhook ayarı değiştirilmedi.
- Normal HMAC, zaman, ortam ve account kontrollerinden sonra charge/account gerçek Stripe API'den tekrar okunur. PaymentIntent → Stripe Session → önceden bağlanmış D1 order eşleşmesi ve quote/tutar kontrol edilir. Metadata tek başına sipariş oluşturamaz.
- Yeni `payment_refund_holds`, `payment_refund_events`, `payment_refund_checks` tabloları yalnız staging D1'e eklendi. Başarılı tam veya kısmi iade; asıl sipariş ve doğrudan ücretsiz re-upload çocuklarının teslimlerini REVOKED yapar, davetleri ve customer session kayıtlarını aynı D1 batch içinde siler. Sürüm yalnız ilk revokasyonda artar; duplicate olay erişimi açamaz.
- İlk ödeme/consent geçmişi korunur. `orders.status=PAID` tarihsel ödeme bilgisidir; güncel iade durumu ayrı D1 refund hold/event kaydıdır. Admin panelinin hold alanı `refund` gösterir. Re-publish/regenerate işlemleri de engellenir.
- Webhook gecikirse müşteri aktivasyonu ve her indirme öncesinde gerçek Stripe refund kontrolü yapılır. Provider hatasında dosya verilmez. Google cevabı alındıktan sonra byte'lar gönderilmeden önce kontrol tekrarlanır.
- Cron yayınlanmış teslimleri en eski kontrol zamanına göre en fazla 10 siparişlik partilerle uzlaştırır. İade nedeniyle Drive `hold_reason`/retention tarihi değiştirilmez; mevcut 90 günlük fiziksel arşiv temizliği ve 12 saatlik R2 TTL korunur.
- Eşzamanlı publish'in refund sonrası geç tamamlanması halinde kalıcı refund hold erişimi yine reddeder ve REVOKED durumunu tekrar uygular. Otomatik un-refund/yeniden erişim açma yolu yoktur.

## Gerçek Sandbox kanıtı

Sipariş: `a34c98c0-fae4-4848-863a-5d9a537d26e6`; tutar 19900 USD cent. Sentetik XER teslimi: `e88ca15b-4628-4826-a7b0-d452b4f1078f`.

| Kontrol | Sonuç |
|---|---|
| Gerçek Checkout/test kartı ödeme ve D1 kabul | PASS |
| Admin sentetik final upload / approve / Publish | PASS |
| Google/Access oturumu olmayan bağımsız müşteri aktivasyonu | PASS — 200 |
| İade öncesi indirme, boyut ve SHA-256 | PASS — 200, 95 byte, eşleşme |
| Gerçek Stripe refund | PASS — `re_3UWFjcBxU4PsnoX00pRDwsZU`, succeeded |
| Müşteri yeni istek göndermeden otomatik REVOKED | PASS — admin salt okunur kontrolde görüldü |
| İptalin gerçek webhook kaydı | PASS — `evt_3UWFjcBxU4PsnoX00Zxc9m3J`, D1 refund_events=1 |
| İade sonrası mevcut session ile download / Range | PASS — ikisi de 401 |
| Eski davetle aktivasyon | PASS — 401; bu davet daha önce kullanılmıştı, tek başına yeni/kullanılmamış davet testi sayılmaz |
| Admin regenerate / republish | PASS — 403 payment_refunded |
| Tüm session ve davet kayıtlarının iptali | PASS — D1 counts 0 / 0 |
| Retention değişmemesi / archive_hold boş kalması | PASS |

Kanıtlar: `refund-delivery-real-2026-10-30.json`, `refund-webhook-d1-real-2026-10-30.json`, `sandbox-refund-webhook-enable-2026-10-30.json`.

Admin poll'da 232 ms revokasyon gözlemi refund API yanıtından sonraki ölçümdür; ödeme sağlayıcısından itibaren SLA veya maksimum iptal süresi değildir. Gerçek kayıtta yayın zamanı 1793366493, refund first_seen 1793366501.

## Yerel testler ve sınırlar

66/66 Worker testi PASS: imzalı/bozuk imzalı refund, duplicate event, kalıcı hold, kısmi refund, parent/child cascade, webhook olmadan indirme reddi, Stripe kesintisinde fail-closed, Cron fallback, retention koruması ve publish/refund yarışı dahil. Typecheck, 1115 site assertion ve Apple legacy koruma testi PASS.

**NOT RUN:** kısmi refund, sağlayıcı kesintisi ve webhook kaybı gerçek dış sistemde tetiklenmedi; bunlar yerel simülasyonlardır. Yeni 12 saat/90 gün gerçek bekleme yapılmadı. Production/Live/hukuki/owner onayları yok.

Daha önce indirilmiş dosyalar müşterinin cihazından geri alınamaz. İptal, yeni aktivasyon ve download/Range isteklerini keser; başlamış bir HTTP stream'in her byte'ında Stripe sorgusu yapılmaz. Provider kesintisinde yeni indirmelerin geçici 5xx ile kapanması bilinçli güvenlik davranışıdır.

İlk otomasyon denemesi arka plandaki Checkout sekmesinin element kararlılığı kontrolünde bekledi; ödeme oluşmadığı için final upload 403 döndü (`refund-delivery-initial-unpaid-2026-10-30.json`). Sekme öne alınarak aynı Session tamamlandı; yeni/kopya ödeme açılmadı. Eski “buton disabled” yorumu doğrulanmadı, ilgili alt kontroller NOT RUN korunur. İlk yerel testte eski 409 beklentisi yeni 403 refund reddine uyarlandı; nihai regresyon yeşil.

Referans: [Stripe refund olayları](https://docs.stripe.com/api/events/types), [Stripe refunds](https://docs.stripe.com/refunds). Teknik erişim iptali uygulanması hukuki sözleşme onayı anlamına gelmez.
