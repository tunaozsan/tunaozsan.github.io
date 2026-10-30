# Drive müşteri teslim portalı — staging entegrasyon raporu

Tarih: 30 Ekim 2026. Ortam: yalnız `bluefin-project-portal-staging`. Production Worker/D1/R2, Stripe Live, Mercury, DNS ve Apple Privacy/Support URL'lerinde bu çalışmada değişiklik yapılmadı.

## Gerçek staging testleri

| Kontrol | Sonuç | Kanıt / kapsam |
|---|---|---|
| Google OAuth bağlantısı | PASS | Gerçek Google onayı ve D1 CONNECTED; sonraki gerçek Drive çağrıları başarılı. Tokenlar rapora alınmadı. |
| Stripe doğrulanmış ödeme | PASS | Önceki gerçek Sandbox-paid siparişin ücretsiz yeniden yüklemesi. Yeni ödeme yok. Transfer, parent Checkout Session ödeme/tutar/para birimi/merchant ve refund/dispute durumunu gerçek Stripe API üzerinden tekrar doğruladı. |
| PAID kilidi ve R2 yüklemesi | PASS | Sentetik sipariş `9d49e04a-676d-4529-8f0a-07847486dc55`; normal upload+quote akışı PAID yaptı. Sipariş ve dosya süreleri değiştirilmedi. |
| Otomatik R2 → Drive | PASS | Cron öncesi iş yoktu; 09:30 UTC çalışmasında job oluştu, tek denemede VERIFIED. Webhook veya manuel retry/cleanup ile ilk aktarım başlatılmadı. |
| Dosya bütünlüğü | PASS | 92 byte XER: R2 kaynağı, aktarılan Google checksum ve bağımsız fixture SHA-256 eşleşti. |
| Gerçek tekrar çalıştırma | PASS | Cron sonrası admin Retry due transfers: aynı tek job, attempts=1; ikinci aktarım/kopya yok. |
| Ödenmemiş siparişin Drive yüklemesi | PASS | Gerçek unpaid staging siparişinde admin final upload HTTP 403. Kuyruğun unpaid/DRAFT reddi ayrıca yerel testte doğrulandı. |
| PDF / XLSX / XER final yükleme ve Publish | PASS | Gerçek Drive, normal admin API, exact-byte onay, sabit binary revision ve Stripe paid session denetimi. |
| Google hesabı olmadan indirme | PASS | Google veya Cloudflare cookie'si olmayan yeni bağımsız HTTP istemcisi: üç dosya HTTP 200, boyut ve SHA-256 eşleşmesi. |
| Başka siparişin dosyası | PASS | Gerçek müşteri oturumundan diğer gerçek siparişin file ID'si HTTP 404. |
| Davet tekrar kullanımı / Revoke | PASS | Tek kullanımlık davet tekrarında 401; admin iptali sonrası mevcut oturumdan indirme 401. |
| Müşteriye Drive bilgisi sızmaması | PASS | Müşteri liste yanıtı Google URL, Drive ID alanı, revision ID veya OAuth tokenı içermedi; indirme Bluefin üzerinden proxy. Uygulamanın kendi file UUID'si kullanılmaya devam eder. |
| Private Drive klasörleri | PASS | Upload/approve/publish/download yollarında gerçek Google metadata shared=false ve ownedByMe=true kontrolü geçti. Paylaşım izinleri oluşturulmadı. |
| Gerçek admin tarayıcı akışı | PASS | PDF dosya seçme/yükleme, scan attestation, Publish Delivery ve Revoke düğmeleri gerçek Chrome ile tamamlandı. Davet görüntülendi ama loglanmadı; son durum REVOKED. İlk locator bekleme hatası test harness içinde düzeltildi. |
| Admin durum görünümü | PASS | Gerçek Chrome ekranında Project Status, Drive Transfer Status, Delivery Published, Downloads, Customer Access Expiration, Archive Expiration görüldü. İndirme sayısı “başlatıldı” olarak adlandırılır, tam teslim alındığı iddia edilmez. |
| Staging sipariş kabulü | PASS | PORTAL_ENABLED=false, LEGAL_APPROVED=false, /health.enabled=false. Tek siparişe özel capability korumalı en fazla 15 dakikalık pencere kaldırıldı; ilgili customer endpoint tekrar 503. |

Dosyalar: [gerçek test sonuçları](drive-integration-real-2026-10-30.json), [Cron öncesi](drive-cron-before-2026-10-30.json), [Cron sonrası](drive-cron-after-2026-10-30.json), [son güvenlik ayarları](drive-final-guards-2026-10-30.json), [gerçek admin UI testi](drive-admin-ui-real-2026-10-30.json).

## Zaman simülasyonu ile gerçek süre gözlemini ayırma

| Kontrol | Sonuç | Açıklama |
|---|---|---|
| 30/90 gün yapılandırma hesabı | PASS | Gerçek Publish form/API: expires_at-published_at = 30×86400; retention_at-published_at = 90×86400. |
| Kullanılmamış süresi dolmuş davet | PASS — simülasyon | Yalnız sentetik siparişin invitation deadline'ı geçmişe alındı; gerçek staging endpoint 401. |
| 30 günlük teslim sınırı | PASS — simülasyon | Yalnız test delivery deadline'ı geçmişe alındı; hâlâ geçerli session ile gerçek download 410. |
| 90 günlük Drive temizliği | PASS — simülasyon + gerçek Cron | Yalnız sentetik project retention deadline'ı geçmişe alındı. Mevcut gerçek Cron klasörü sildi. Ayrı admin verification API ile klasörler/dosyalar dahil 9 nesnenin hepsi Google API'de 404. |
| Erişim kesme ve fiziksel silme ayrımı | PASS | Önce download 410; sonrasında bağımsız fiziksel nesne yokluğu. 302/503/expired session fiziksel silme kanıtı olarak kullanılmadı. |
| R2 12 saat koruması | PASS | 43200 saniye değişmedi; Drive simülasyonu sonrasında R2 dosyası 200 ve aynı hash. Önceki gerçek 12 saatlik R2 gözlemi eski raporlarda saklıdır. |
| Bu yeni dosyada 12 saat bekleme | NOT RUN | Henüz 12 saat geçmedi; bu çalışmadaki yeni dosya için elapsed-time sonucu üretilmedi. Mevcut Cron devam eder. |
| Gerçek 30 veya 90 gün bekleme | NOT RUN | Zaman hızlandırma/sentetik deadline testleri bu sürelerin gerçekten geçtiğini kanıtlamaz. |

[Zaman simülasyon kaydı](drive-retention-staging-simulation-2026-10-30.json). Tüm zaman alanları Unix saniyesi / UTC; admin ekranı kullanıcının yerel saatini gösterir. Production hukuki onayı yoktur; 30/90 gün politikası production'da etkinleştirilmedi.

## Hata ve kurtarma simülasyonları

Aşağıdaki testler izole yerel staging yapılandırmalı Miniflare D1/R2 ve aynı Worker koduyla; Google/Stripe yanıtları kontrollü olarak simüle edilerek çalıştırıldı. Gerçek bağlı Google hesabı iptal edilmedi, gerçek Drive kotası doldurulmadı.

| Kontrol | Sonuç |
|---|---|
| OAuth bağlantısı yok/REAUTH_REQUIRED → kalıcı RETRY → yeniden bağlantı sonrası VERIFIED | PASS — simülasyon |
| invalid_grant → credential REAUTH_REQUIRED → yeni yetkilendirmeyle kurtarma | PASS — simülasyon |
| Google 403 kota/izin sorunu → hata kodu + admin alarmı + backoff → kurtarma | PASS — simülasyon |
| Upload ortasında ağ kesilmesi → aynı ayrılmış Drive ID ile retry | PASS — simülasyon |
| Checksum uyuşmazlığı → VERIFIED reddi → doğru tekrar sonrası başarı | PASS — simülasyon |
| Aktif lease varken ikinci worker / lease bitince kurtarma | PASS — simülasyon |
| Parent klasör sonradan paylaşılmışsa yeni aktarım reddi | PASS — simülasyon |
| R2 süresi dolunca kaynak erişimi kesme / TTL uzatmama | PASS — simülasyon |
| Arşiv silindi ama D1 commit başarısız kaldı senaryosu → Google 404 ile idempotent toparlanma | PASS — simülasyon |
| Gerçek Google hesabını revoke ederek veya kotasını doldurarak test | NOT RUN — bağlı hesabı bozacak test uygulanmadı; aynı hata dalları simülasyonla test edildi. |

Kalıcı kuyruk D1'dedir: unique order/file/type, 600 saniyelik claim lease, deneme sayısı, güvenli hata kodu, 60 saniyeden başlayıp en fazla 1 saate çıkan backoff, SHA-256 ve verified_at. Cron her 15 dakikada PAID dosyaları yeniden tarar; webhook yanıtı artık enqueue veya Google erişimine bağlı değildir. Retry/FAILED ve TTL yaklaşımı admin ekranında alarm üretir; otomatik e-posta bildirimi bu sürümde yoktur. Operatör düzenli olarak paneli kontrol etmelidir.

## Yerel doğrulamalar ve üretime geçişte kalanlar

- PASS: 54 Worker testi; TypeScript typecheck; izole staging build; 23 sayfada 1112 site assertion.
- PASS: Raw secret biçimleri için değişen kaynak/rapor taraması sonuç vermedi; `.qa` ve `.build` gitignored. Secret/cookie/JWT rapora veya Git'e yazılmadı.
- PASS: Yayın öncesi örnek test anahtarının kısa biçimi nedeniyle bir test fixture'ı düzeltildi; ürün kodunda gerçek anahtar değiştirilmedi. Son test paketi tamamen yeşil.
- NOT RUN: Production deployment / canlı ödeme / production hukuki politika onayı. Bu işlemler yapılmadı ve ayrı açık onay gerektirir.
- NOT RUN: Gerçek dosyalar için otomatik antivirüs. Sentetik fixtures yapı ve içerik allowlist incelemesinden geçti; bu, genel amaçlı antivirüs taraması olarak sunulmaz. Admin exact-byte tarama/onay sorumluluğu devam eder.
- Production öncesi: kişisel Google Drive kullanımının veri işleme/saklama koşulları; 30/90 gün politikası; Google OAuth yayın/consent yapılandırması; manuel refund/dispute hold operasyonu; alarm takip sorumluluğu ve otomatik malware tarayıcı ihtiyacı kararlaştırılmalı. Bu kontrollerin hukuki onayı bu testlerle verilmiş sayılmaz.
- Kurtarma: OAuth REAUTH_REQUIRED ise Access ile admin girişinden Connect personal Drive; kota/izin alarmında sebebi düzeltip backoff süresi dolunca Retry due transfers. R2 TTL geçmişse otomatik uzatma yok; doğrulanmış ödeme üzerinden yeni güvenli re-upload gerekir.
- Şifreleme anahtarı rotasyonu mevcut D1 ciphertext ile birlikte ele alınmalı; eski anahtarı plansız değiştirmek yerine kontrollü yeniden şifreleme veya OAuth yeniden bağlantısı yapılmalı.
