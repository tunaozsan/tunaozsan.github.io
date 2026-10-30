# Payment Links — zorunlu kabul denetimi

30 Ekim 2026, herkese açık Stripe checkout sayfaları yalnız okunarak incelendi. Ödeme gönderilmedi; Live API anahtarı kullanılmadı; hiçbir Stripe ayarı değiştirilmedi. Sayfalarda email/ödeme formunun gerçekten yüklendiği kontrol edildi. Public yapılandırmada consent_collection.terms_of_service=none; Bluefin sözleşmesi için checkbox yok. Görünen isteğe bağlı kutu yalnız bilgileri kaydetme içindir. Stripe'ın kendi Terms/Privacy bağlantıları, Bluefin hizmet sözleşmesi kabulü değildir.

| Paket | Gerçek Payment Link ID | Zorunlu sözleşme |
|---|---|---|
| AUDIT-150 | `plink_1UV74WBzdKYgwVw6EYEHxMeJ` | **MISSING** — `none` |
| BASE-BASIC-NR-75 | `plink_1UVAC5BzdKYgwVw6aKsnuS6z` | **MISSING** — `none` |
| BASE-BASIC-R-75 | `plink_1UVAGtBzdKYgwVw6WTiViWrl` | **MISSING** — `none` |
| BASE-DETAIL-NR-200 | `plink_1UVAElBzdKYgwVw6DvU7Biee` | **MISSING** — `none` |
| BASE-DETAIL-R-200 | `plink_1UVAJ4BzdKYgwVw6nVq5vgGQ` | **MISSING** — `none` |
| UPDATE-NR-200 | `plink_1UVAL1BzdKYgwVw6uosQvzep` | **MISSING** — `none` |
| UPDATE-R-200 | `plink_1UVAMfBzdKYgwVw6pow909cB` | **MISSING** — `none` |

[Makine okunur kanıt](payment-links-consent-audit-2026-10-30.json). İlk denemede email alanının HTML type varsayımı yüzünden timeout oldu; doğru ID/name seçicisiyle yedi sayfa başarıyla yeniden kontrol edildi. Son bulgular eksik onayı gösterir; başarısız ilk sayfa okuması kanıt sayılmadı.

## Onay sonrası plan — uygulanmadı

1. İşletme sahibi ve yetkili hukuk danışmanı ortak Terms, Refund ve portal Privacy supplement metnini; yürürlük tarihini, satıcı adresini, vergileri ve 30/90 gün saklama politikasını onaylar.
2. Sandbox ve Live public business details ayrı kontrol edilir: Service Terms `https://bluefintuna.life/service-terms.html`, Privacy `https://bluefintuna.life/privacy.html`, Refund `https://bluefintuna.life/refund-policy.html`. Şu an Draft belgeler production satış onayı değildir.
3. Ayrı açık Live onayından sonra yalnız ilgili plink kimliklerine `consent_collection[terms_of_service]=required` uygulanır. [Tam, çalıştırılmamış API patch planı](payment-links-consent-patch-plan.json).
4. Her yeni/aktif linkte zorunlu kutu, gerçek Terms URL ve tamamlanan Session.consent doğrulanır. Bir Product Catalog kaydı oluşturmak bu ayarı yapmaz.

## Envanter sınırı ve eklentiler

Depoda yedi ana paketin URL'si mevcut. Schedule Score pilotu, dört aktivite/revizyon eklentisi ve on Baseline/Update malzeme ürünü için bağımsız Payment Link URL/ID envanteri sağlanmamış. Bunların Stripe hesabında hiç bulunmadığı iddia edilmez; bu 15 olası linkin zorunlu onayı **NOT RUN / UNKNOWN**. Eksik yetki/veri: Live account salt-okunur Payment Links+Products envanteri veya Dashboard'dan yalnız ID/URL/consent alanlarını içeren güvenli dışa aktarma. Gizli anahtar paylaşılması gerekmez.

Eklentiler ayrı sözleşme almaz. Uygun parent paket, blok/revizyon sayısı ve kategori/BOQ satırları aynı sunucu sipariş özetine girer. Bağımsız add-on linki, parent uygunluğunu doğrulayamadığından etkinleştirilmemeli. Schedule Score için gerçek SKU/teslim tanımı ve link bilinmiyor: satış yolu **BLOCKED**. Update materyalleri mevcut mapping incelemesi tamamlanmadan **quote-only** kalır.

Mevcut dış Payment Links, portalın D1 sipariş/kabul akışına otomatik bağlanmaz. Bunları olduğu gibi kullanmak D1 kanıtını üretmez. Production öncesi öneri: siparişi portalda oluşturup kapsamı sunucuda doğrulayan dinamik Checkout kullanmak; linkler korunacaksa Session/client_reference_id ve webhook mapping için ayrı onaylı entegrasyon geliştirmek. Yeni tabloya mevcut Link satışları için geçmiş kabul uydurulmadı.

Teknik kaynak: [Stripe Checkout Session consent alanları](https://docs.stripe.com/api/checkout/sessions/object). Metin bağlantısı göstermek ile consent_collection üzerinden aktif kabul toplamak ayrı kontrollerdir.
