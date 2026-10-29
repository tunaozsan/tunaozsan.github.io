# Fiyat kabul matrisi — 2026-10-29

İlk denetimde `data/services.json` ve Worker `src/catalog.ts` yeni brief ile eşleşti. **Hiçbir fiyat veya canlı Stripe katalog/Payment Link değiştirilmedi.** Tek sipariş = tek SKU; arrays/unknown SKU/istemci total alanı reddedilir. Tüm hesaplar sunucuda integer USD cents.

| SKU | USD | Baz aktivite | İş günü | İlave +50 blok sınırı | Blok USD |
|---|---:|---:|---:|---:|---:|
| p6_audit | 199 | 150 | 5 | 0 (teklif) | Self-service yok |
| baseline_basic_nores | 499 | 75 | 5 | 2 | 100 |
| baseline_basic_withres | 799 | 75 | 7 | 2 | 175 |
| baseline_detailed_nores | 999 | 200 | 10 | 4 | 100 |
| baseline_detailed_withres | 1499 | 200 | 12 | 4 | 175 |
| update_nores | 399 | 200 | 4 | 4 | 100 |
| update_withres | 649 | 200 | 5 | 4 | 150 |

`ceil(max(0, requested-base)/50)`: +1/+49/+50 bir blok, +51 iki blok. Audit veya sınır aşımında gösterilen rakam bağlayıcı teklif değildir; `scopeReview` ödeme kapısını kapatır. Basic +100, Detailed/Update +200 üzerinde yazılı teklif. Teslim süresi tam ve kullanılabilir girdiler/kapsam teyidinden sonra başlar; ödeme tek başına süreyi başlatmaz.

With Resources yalnızca MH ve Cost'tur; fiziksel materyaller standart kapsam dışı. Concrete, rebar, formwork, structural steel, piping kategorileri baseline initial için 249 USD/kategori; update existing için 119 USD/kategori. Her kategori 1–50 BOQ satırı; 51+ review. Update materyali her durumda mevcut atama için operatör doğrulaması gerektirir; self-service ödeme açılmaz. Without Resources ve audit materyal kabul etmez. Duplicate kategori reddedilir. Update With Resources mevcut MH/Cost ataması teyidi olmadan quote-only. Recovery ve initial MH/cost setup otomatik satın alınmaz.

Ek revizyon 99 USD/adet, MVP üst sınırı 3; audit kabul etmez. Bu mevcut sınır ticari owner onayına tabidir. Client BOQ/iş tanımları, ölçülen miktarlar, çizimler, MH/cost bütçeleri, birim fiyatlar ve update actual verisini sağlar. Quantity takeoff, estimating, bütçe oluşturma, claims veya üçüncü taraf onayı dahil değildir.

## Test kanıtı

`portal.test.ts`: 7 baz fiyat/aktivite/teslim gününü karşılaştırma; her SKU için baz/+1/+49/+50/+51/son izinli/ilk kapsam dışı; beş materyalde 1/50/51 satır ve 249/119 fiyatı; incompatible/duplicate/unknown/0/negative/fractional/NaN/Infinity; client total ve çoklu paket manipülasyonu. Tarayıcı: Basic With Resources 76 aktivite + concrete = **1,223 USD**.

Quote hash immutable cart/toplam/policy bundle sürümünü içerir, 15 dakika geçerlidir. Bundle `portal-draft-2026-10-29` scope/terms/privacy/refund/retention onayını temsil eder; checkbox öncesi sürüm ekranda görünür. Checkout mevcut katalog/policy hash ve saklı subtotal tutarlılığını da doğrular; değişmiş fiyat/policy için yeni server quote ve inceleme gerekir. Stale/hash/false consent reddedilir; mevcut checkout tekrarında da onay kontrolü vardır. Dosyalar checkout'ta kilitlenir. Webhook amount/currency/session/account/quote kontrolünü yeniden yapar. İptal dönüşü açık session'ı yeniden kullanır; expired/completed session yeniden ödeme URL'si olarak verilmez. Scope değişirse yeni teklif gerekir.

Tax varsayılan `unconfigured`, invoice false. Tax otomatikse final total = subtotal + nonnegative integer tax; negatif tax/discount/shipping/farklı total reddedilir. Doğrulanmış paid total/tax ve varsa Stripe invoice ID ayrı saklanır. Bunlar mock test kanıtıdır; gerçek Stripe test Checkout/PDF/receipt gate'i açık kalır.
