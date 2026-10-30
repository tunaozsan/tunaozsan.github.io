# Staging sonuçları ve canlıya geçiş eksikleri — 30 Ekim 2026

## Karar

**Canlıya geçiş için hazır onayı verilmedi.** Staging sipariş kabulü kapalıdır; canlı ödeme açılmadı. Production Worker/D1/R2, DNS, Mercury, Apple bağlantıları değiştirilmedi. Tarihsel NOT RUN satırlarının bir bölümü önceki gün tamamlandı; güncel kapsam aşağıdadır.

## Bu tur gerçek staging testleri

| Kontrol | Sonuç | Kanıt / kapsam |
|---|---|---|
| Gerçek Stripe completed olayını yeniden teslim | PASS | Stripe CLI'nin resmi `/events/{event}/retry` yolu, mevcut Sandbox endpoint'i; docs/staging-resend-2026-10-30.json; ardından pendingWebhooks=0 |
| Tekrar teslim sonrası D1 tutarlılığı | PASS | Aynı event ID tek kayıt; 19900 USD cents, paid_at ve invoice ID değişmedi; PAID_FILES_EXPIRED korundu; docs/staging-evidence-2026-10-30.json |
| Gerçek Checkout expired olayı | PASS | Yeni, ödeme yapılmayan sentetik fixture Checkout oluşturulup Stripe expire API ile sona erdirildi; Endive evt_1UW6N8BxU4PsnoX0xlmSpaWv D1 PROCESSED; order EXPIRED_UNPAID; pending_webhooks=0 |
| Ödeme/receipt/fee/bill-to kontrolü | PASS | Sandbox charge paid/captured; amount 19900, fee 607, net 19293 USD cents; receipt URL varlığı (değeri çıkarılmadı), billing country US. Balance pending; gerçek banka settlement kanıtı değildir |
| CORS allowed / foreign preflight | PASS | Staging origin OPTIONS204; farklı origin OPTIONS403 origin_denied |
| Kapalı intake / unsigned webhook / anonim admin | PASS | POST orders503 portal_not_enabled; webhook400 invalid_signature; Access302. 302 yetkili TTL kanıtı olarak kullanılmadı |
| Chromium otomatik axe + responsive | PASS | 29 axe kural grubu, 0 violations; 320/375/768/1440 taşma yok; reduced-motion eşleşiyor. axe incomplete kontrolleri manuel inceleme bekler |
| WebKit otomatik axe + responsive | PASS | Son yayımdan sonra 29 axe kural grubu, 0 violations; 320/375/768/1440 taşma yok; gerçek iOS değildir |
| 20 eşzamanlı salt okunur health isteği | PASS | Son tekrar 20/20 HTTP200, p95 4260ms. İlk deneme FAIL: 14/20, p95 15010ms, istemci timeout; first-attempt kanıtı korunuyor. Bu upload kapasitesi/SLA sertifikası değildir |
| Worker / site / typecheck / format | PASS | 33 Worker testi; 1112 assertion / 23 sayfa; typecheck, format ve diff kontrolü |

Expired fixture order: `45f0be70-dc6b-4488-a380-b3ca25fd06a1`. Dosya yüklenmedi, ödeme alınmadı, invoice oluşturulmadı. Fixture doğrudan staging test aracından oluşturuldu: bu, müşteri formu akışının yeni bir uçtan uca tekrarı değildir. Gerçek webhook işleyicisi, gerçek Stripe Session sorgusu ve mevcut staging D1 kullanıldı. Önceki 12 saat dosya kayıtları değiştirilmedi.

İlk axe taramasında 5 bildirim/link öğesinde 1.15:1 kontrast hatası bulundu. Portal bildirim zemini açık renge çevrildi. WebKit paket seçicisinde 320px görünümde 16px native seçenek metni taşması bulundu; appearance/text-overflow ve görünür ok işaretiyle düzeltildi. Son tarayıcı kanıt dosyaları `docs/staging-ui-chromium-2026-10-30.json` ve `docs/staging-ui-webkit-2026-10-30.json` içindedir. Tam WCAG uyumluluğu veya fiziksel iPhone testi iddia edilmez.

## Kalan NOT RUN / karar ve erişim gerektiren maddeler

| Kontrol | Durum | Neden / canlıya geçmeden yapılacak işlem |
|---|---|---|
| Gerçek async_payment_succeeded / async_payment_failed | NOT RUN | Worker Checkout yalnız `card` gönderiyor. Gecikmeli ödeme yöntemi yok; Stripe'ın gerçek delayed event'i bu akışta üretilemiyor. Mevcut 33 yerel test async işleyicisini simüle ediyor. Kart dışı ödeme desteği isteniyorsa ayrı staging yöntem/Checkout geliştirmesi ve gerçek Sandbox E2E gerekir. Kart-only kapsam kararı açıkça kaydedilmeli; sahte event gönderip gerçek Stripe PASS yazılmadı |
| Gerçek iPhone Safari Access cookie/login ve upload | NOT RUN | WebKit emülasyonu fiziksel iOS değildir; fiziksel cihaz üzerinde sahibi/QA doğrulamalı |
| Ekran okuyucu ve tüm kontrast/etkileşim durumları | NOT RUN | Axe otomatik taraması sadece incelenen kapalı portal görünümünü kapsar; incomplete sonuçları, açık form/hata/dosya yükleme durumları ve VoiceOver manuel test edilmeli |
| Uzak eşzamanlı büyük dosya yükleme kapasitesi | NOT RUN | Yerel runtime iki 20MiB/üçüncü ret testi geçti; ilk uzak health burst başarısız, tekrarı başarılı. Kararlı ağdan gerçek dosya throughput/Worker limitleri ayrıca ölçülmeli |
| Uzak R2 sağlayıcı hatası, delete retry, watchdog/alarm teslimi | NOT RUN | Gerçek başarılı 12 saat Cron silme geçti; sağlayıcı hata enjeksiyonu ve dış alarm kanalı testi yapılmadı. Yerel retry testleri gerçek uzak kesinti kanıtı değildir |
| D1 yedekten geri dönüş tatbikatı | NOT RUN | Ayrı güvenli geri yükleme hedefi ve operasyon prosedürü gerektirir; mevcut production veya staging DB üzerine restore yapılmadı |
| Gerçek vergi tutarı / otomatik vergi ve canlı invoice yasal bilgileri | NOT RUN | Önceki ödeme sıfır vergiyle sentetik testti. TAX_MODE=unconfigured; vergi kaydı, müşteri ülkeleri, B2B/B2C ve şirket fatura bilgileri sahibi/uzman onayı gerektirir |
| Refund, service terms, retention, takvim ve operatör prosedürü | NOT RUN | Hukuki/işletmesel onay otomatik testle verilemez. Terimler halen draft; dosya tarama, şifreli çalışma alanı, final teslim ve saklama prosedürü onaylanmalı |
| Office/ZIP/makro dosya tarama desteği | NOT RUN | Restricted file policy şu an bu tipleri reddeder. Mevcut kapsamın kabulü veya scanner/OPC/OLE geliştirmesi gerekir; XLSM kendiliğinden açılmadı |
| App Store Connect uygulama bazlı URL ayarları | NOT RUN | Mevcut Apple URL'leri korunuyor; özel App Store Connect ayarlarına erişim/doğrulama yok |
| Outbound/reply mail ve SPF/DKIM/DMARC teslim testi | NOT RUN | Incoming sorun sahibi tarafından çözülmüş olarak kayıtlı. Alıcı/mail sağlayıcı erişimi olmadan gerçek gönderim testi yapılmadı |
| Telegram / dış alarm | NOT RUN | Telegram bilinçli olarak yapılandırılmamış; operatörün kanal seçimi ve güvenli secrets gerekir. Başka kişilere mesaj gönderilmedi |
| Production rollout ve rollback | NOT RUN | Bu tur yetkisi yok; mevcut prod durumu bu staging raporundan türetilmez. Ayrı açık onay ve güncel production/binding/secret kontrolü gerekir |

## Güvenlik ve yayın durumu

Son staging deployment: `818d75e6-6c24-45cf-8b14-9f842f674168`. APP_ENV=test; PORTAL_ENABLED/LEGAL_APPROVED/INVOICE_CREATION=false; TAX_MODE=unconfigured; Cron `*/15 * * * *` korunuyor. Webhook aktif ve imza istiyor. Geçici admin test aracı yalnız APP_ENV=test + STAGING_VALIDATION_ENABLED=true + gerçek Access admin + same-origin + Sandbox hesap eşleşmesinde çalışır; **son deployment'ta bu test bayrağı yok, araç kapalıdır**. Gizli anahtarlar Worker dışına çıkarılmadı; Cookie/JWT/session token raporlanmadı. Git push/merge ve production deploy yapılmadı.

İlk arayüz deployment denemesi ağ hatası verdi; tekrar başarılı oldu. Bazı tarayıcı yüklemelerinde de ağ timeout oluştu; başarısız denemeler başarı sayılmadı. Başarılı ücret/test çıktıları sadece Stripe Sandbox'a aittir; Mercury tahsilatı veya production fiyat/fee garantisi değildir.

Kaynaklar: [Stripe gecikmeli ödeme olayları](https://docs.stripe.com/payments/existing-customers?platform=web&ui=stripe-hosted), [Stripe CLI event resend uygulaması](https://github.com/stripe/stripe-cli/blob/master/pkg/cmd/resource/events_resend.go).
