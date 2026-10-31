# B — Geçiş uygulandı: 8 eski Link kapalı, başvuru/Portal yolu mevcut

31 Ekim 2026: yedi orijinal Link ve Schedule Score pilot Link'i kontrol edildi. Toplam 16 açık unpaid Session expire edildi; 8 Link inactive, open=0, pending=0, paid=0. [Kesin URL/ID ve link bazında kanıt](legacy-links-retired-2026-10-31.json). Yeni ödeme ürün/link kopyası, geçmiş ödeme silme veya geriye dönük D1 consent yok.

Inactive message müşteriyi https://bluefintuna.life/project-portal/ adresine yönlendirir. Bu yol şu anda başvuru alır. Onaylı immutable kapsam + belgeli vergi değerlendirmesi + tek kullanımlık davet + gerçek yeni portal kabulü ile order/Checkout yolu teknik olarak yayımlandı. Henüz doğrulanmış müşteri kapsamı yok; tahsilat kapalı. Eski Link'leri geri açmak rollback'in otomatik parçası değildir. Aşağıdaki uygulanmadı/aktif ifadeleri tarihsel raporlardır ve bu bölümle güncellenmiştir.

---

# B — Payment Link → Portal Checkout geçiş planı (UYGULANMADI)

Yeni satın alma yolu: Portal → Package → Add-ons → Project Reference → server Scope/Quote → boş başlayan zorunlu kabul → Catalog Price ile Checkout → doğrulanmış webhook → D1 PAID → R2/Drive → teslimat.

22 ayrı Payment Link oluşturulmayacak. Mevcut yedi link silinmedi/değiştirilmedi. 30 Ekim 11:11 UTC public checkout yüklenmesi kullanılabilirliğe dair tarihli kanıttır; Stripe API `active` alanı okunmadığından authoritative active durumu UNKNOWN.

| Ürün | Mevcut URL | Payment Link ID | Kabul / D1 |
|---|---|---|---|
| AUDIT-150 | https://buy.stripe.com/00weVcbpf19k0BUbJ82Nq00 | plink_1UV74WBzdKYgwVw6EYEHxMeJ | terms=none; portal order/session bağı yok |
| BASE-BASIC-NR-75 | https://buy.stripe.com/cNi4gy50R6tE0BU3cC2Nq02 | plink_1UVAC5BzdKYgwVw6aKsnuS6z | terms=none; portal order/session bağı yok |
| BASE-BASIC-R-75 | https://buy.stripe.com/cNidR8fFv4lwbgybJ82Nq04 | plink_1UVAGtBzdKYgwVw6WTiViWrl | terms=none; portal order/session bağı yok |
| BASE-DETAIL-NR-200 | https://buy.stripe.com/cNi6oGbpff0a98q7sS2Nq03 | plink_1UVAElBzdKYgwVw6DvU7Biee | terms=none; portal order/session bağı yok |
| BASE-DETAIL-R-200 | https://buy.stripe.com/5kQeVcctj8BMckC6oO2Nq05 | plink_1UVAJ4BzdKYgwVw6nVq5vgGQ | terms=none; portal order/session bağı yok |
| UPDATE-NR-200 | https://buy.stripe.com/aFaaEW3WN6tE2K2fZo2Nq06 | plink_1UVAL1BzdKYgwVw6uosQvzep | terms=none; portal order/session bağı yok |
| UPDATE-R-200 | https://buy.stripe.com/5kQ28q3WN7xI4Sa3cC2Nq07 | plink_1UVAMfBzdKYgwVw6pow909cB | terms=none; portal order/session bağı yok |

## Doğrudan satış neden güvenilir şekilde bağlanamaz?

Payment Link yeniden kullanılabilir; aynı e-posta, müşteri referansı veya değiştirilebilir URL parametresi bir portal siparişinin yetkilendirmesi değildir. Session order_id metadata tek başına yeterli değildir: önceden D1'e bağlanmış Session, immutable kapsam/quote hash, portal kabul zamanı/sürüm/hash ve Stripe accepted sonucu gerekir. Stripe checkbox kabulünü D1 portal kabulüne dönüştürmek veya geçmiş kayıt eklemek yasaktır.

Yerel staging-runtime testinde farklı Link Session ID reddedilir; bağlanmış Session'a sahip fakat D1 kabulü silinmiş tarihsel sipariş de 409 ile reddedilir. Gerçek Sandbox Payment Link satışı bu turda NOT RUN (bu turda yeni Sandbox Link oluşturulmadı). Hiçbir Live ödeme denenmedi. D1 kaydı bulunmayan olayların webhook retry/operatör incelemesi gerekebilir; fulfillment başlatılmaz.

## Aşamalı geçiş

1. Owner/legal final sürüm onayı; Sandbox katalog ID/lookup_key mutabakatı ve gerçek E2E.
2. Yeni Portal yolunu staging'de tüm uyumluluk ve fiyat reddi kontrolleriyle doğrula. D1 kapsamı authoritative; Stripe tutarı bağımsız olarak karşılaştırılır.
3. Açık production izninden sonra yalnız site satın alma CTA'larını portala yönlendir. Bu turda site linkleri değiştirilmedi.
4. Eski Link satışlarını ayrı reconciliation kuyruğunda incele; otomatik fulfillment ve geriye dönük kabul yok. Geçmiş müşteriler için owner kararına göre açık yeni teklif/kabul veya iade prosedürü.
5. Trafik, açık Checkout Session ve eski satış mutabakatı tamamlandıktan sonra ayrıca owner izniyle eski linkleri deactivate et (silme). Geri dönüş sayfası portalı anlatır. Tarih/owner kararı henüz yok.
6. Stripe hosted eski URL'ye kendi sitenizden redirect kuralı uygulanamaz; Dashboard'daki deaktivasyon mesajı/yönlendirme imkânını onaylı uygulama öncesinde doğrula.


## Gerçek Sandbox geçiş/izolasyon kanıtı — 30 Ekim 2026

Tek geçici test linki `plink_1UWEi3BxU4PsnoX09iNiqZtt` oluşturuldu (22 ayrı link yaklaşımı uygulanmadı). Link metadata'sına gerçek sentetik DRAFT sipariş ID'si konuldu. Stripe ödemesi complete/paid ve terms accepted olduğu halde D1 siparişi DRAFT kaldı; portal kabul kaydı, payment_events ve Drive işi 0. Return URL başarı sayfası da siparişi ödenmiş saymadı. Test sonunda link active=false. Yedi Live linke dokunulmadı. Kanıtlar: sandbox-link-status, sandbox-link-close ve sandbox-d1-final-evidence JSON dosyaları. Stripe'ın teslim denemesi HTTP logu ayrıca çekilmedi; gerçek ücret/consent ve D1 son durumları ile yerel session-binding ret testi birlikte raporlanır.
