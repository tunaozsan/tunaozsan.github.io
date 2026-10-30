> Güncel durum (2026-10-30): Owner v2 yayımını benimsedi. v1 aşağıda tarihsel DRAFT olarak korunur. Bağımsız hukuk/vergi incelemesi NOT_PERFORMED. Bkz. [production raporu](production-launch-2026-10-30.md).

# İşletme sahibi ve hukuk incelemesi — ONAY BEKLİYOR

Ortak sürüm: `service-terms-2026-10-30-v1` · Durum: **DRAFT / yürürlükte değil**.

Bu dosya onay talebi için inceleme paketidir; işletme sahibi veya hukuk danışmanı onayı verildiği anlamına gelmez. Canlı Stripe değişiklik planı çalıştırılmadı, production satışları açılmadı.

## İncelenecek metinler

- [Staging Service Terms](https://bluefin-project-portal-staging.bluefintuna-llc.workers.dev/service-terms.html)
- [Staging Refund Policy](https://bluefin-project-portal-staging.bluefintuna-llc.workers.dev/refund-policy.html)
- [Staging Privacy — mevcut açıklamalar + ayrı Draft portal eki](https://bluefin-project-portal-staging.bluefintuna-llc.workers.dev/privacy.html)
- [Ortak sürümün tam metin paketi](../data/legal/service-terms-2026-10-30-v1.json)
- [22 ürün/kapsam eşlemesi](../data/agreement-product-coverage.json)
- [Yedi Payment Link için bulgular ve onay sonrası plan](payment-links-consent-review-2026-10-30.md)

## Eski yapı ile önerilen değişiklik

| Alan | Önce | Bu Draft önerisi |
|---|---|---|
| Sözleşme sürümü | Web taslağı 28 Ekim; portal `portal-draft-2026-10-29` | Service Terms + Refund + portal Privacy supplement aynı sürüm/hash paketi |
| Kapsam | Yedi paket ve farklı açıklama metinleri | Tek sözleşme; seçilen paket, miktar/blok, revizyon ve malzemeler sipariş özetinde |
| Süreler | R2 12 saat; sonraki çalışma saklaması belirsiz | R2 12 saat korunur; önerilen müşteri erişimi 30 gün ve Drive arşivi 90 gün; production onayına bağlı |
| 90 günün başlangıcı | Verilen belgede “completed delivery” | Mevcut kodla uyum için **onaylı finalin yayınlanması**; indirme/iş kabulü tamamlandı sayılmaz. Bu değişiklik özellikle owner/legal onayı bekler. |
| Veri işleyenler | Cloudflare/Stripe eki; Google Drive yok | Private kişisel Google Drive, minimum drive.file, token saklama, müşteri proxy indirmesi ve sınır ötesi veri incelemesi açıklanır |
| Privacy kabulü | Checkbox Privacy metnine de “agree” diyordu | Terms + Refund aktif sözleşme kabulü; Privacy ayrı bildirim, genel hak feragati değil |
| Kanıt | Siparişte consent_version/consent_at/Session ID | Ayrı değişmez kabul kaydı; sözleşme hash’i, kapsam snapshot’ı, portal zamanı, Session, Stripe accepted doğrulama zamanı ve event referansı |
| Legacy app policy | March 30, 2026 tarihli açıklamalar ve destek kanalları | Metinleri aynı; yeni portal eki ayrı Draft. Privacy/Contact/Support yolları değişmedi. |
| Mevcut Payment Links | Hepsinde public config `none`, satıcı sözleşmesi kutusu yok | Onay sonrası her gerçek plink için required planı; uygulanmadı |

## Onaylanması gereken kararlar

- [ ] Doğru satıcı unvanı, gerekli açık işletme adresi ve iletişim bilgileri.
- [ ] B2B/B2C kapsamı, uygulanacak hukuk/yetki, zorunlu tüketici cayma ve erken ifa kuralları. Genel checkbox ayrı erken ifa/onay feragatinin yerine geçmez.
- [ ] Vergi/fatura kayıtları, tahsilat ve iade işlem süreleri, yasal zorunluluklar.
- [ ] Dört–on iki iş günlük sürelerin başlangıcı; önerilen UTC Pazartesi–Cuma takvimi, tatiller ve pause kuralları.
- [ ] 50 aktivitelik bloklar, revizyon kapsamı, 50 BOQ satırı/kategori ve parent paket şartları.
- [ ] 12 saat R2 / 30 gün müşteri erişimi / 90 gün Drive arşiv politikası; 90 gün için publication anchor; incident gecikmeleri ve hukuki hold istisnaları.
- [ ] Sipariş/kabul/muhasebe kayıtlarının ayrı, kesin ve hukuken gerekçelendirilmiş saklama süreleri.
- [ ] Kişisel Google Drive hesabı, veri işleyen sözleşmeleri, veri aktarımı ve güvenlik tedbirlerinin uygunluğu.
- [ ] Schedule Score $1 pilotunun gerçek teslimi, limitleri ve dürüst kapsamı. Henüz SKU/teslim akışı yok, satış kapalı.
- [ ] Update malzemelerinde existing mapping incelemesini kimin/nasıl yapacağı. Şu an quote-only; zorunlu onay tek başına bu kontrolü kaldırmaz.
- [ ] Her Payment Link için required kutu ve Terms URL kontrolü; bağımsız add-on satışlarının önlenmesi; Link satışlarının D1 sipariş/kanıt eşlemesi veya portal Checkout'a geçiş.
- [ ] Yürürlük tarihi, final metin ve yeni APPROVED sürüm; ayrıca production dağıtımı/Stripe Live değişikliği için açık yetki.

**Owner onayı:** Bekleniyor. **Hukuki onay:** Bekleniyor. **Production izni:** Verilmedi.

## Teknik sınırlar

Portal kabul zamanı sunucu isteği zamanıdır. Stripe, kabulün tam tıklanma anını ayrı bir timestamp olarak sağlamadığından `stripe_verified_at` doğrulama anını, `stripe_event_created_at` Stripe olay zamanını ifade eder. Bu kayıtlar nitelikli elektronik imza veya tüketici haklarından feragat olarak sunulmaz. Stripe secret/card verileri ve gereksiz IP/user-agent bu kabul tablosuna kaydedilmez.

Aynı sürüm altında kabul edilmiş metin değiştirilmeyecek; final onay için yeni sürüm/hash ve yeniden inceleme gerekir. Eski siparişler yeni sözleşmeyi kabul etmiş sayılmayacak.
