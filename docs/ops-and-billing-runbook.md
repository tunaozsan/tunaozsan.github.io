# Operasyon, fatura ve teslimat — 2026-10-29

Kod inceleme adayıdır; canlı aktivasyon yok. Gelen destek e-postası sahibin 2026-10-29 bildirimine göre çözülmüştür. Bağımsız gelen/giden mesaj testi yapılmadı; outbound/reply smoke ve SPF/DKIM/DMARC kontrolü takip işidir. Dosyalar e-postadan bağımsızdır.

## Stripe test-mode fatura kontrolü — NOT EXECUTED externally

Owner onaylı izole test kurulumunda:
1. Bluefin Tuna LLC hesabı, business details, destek adresi, doğru bill-to adresi ve e-posta; tax kayıtları ve fatura ücretleri dashboard'da incelenir. Mercury payout hesabına dokunulmaz.
2. `INVOICE_CREATION=false` ile test Checkout: invoice beklenmez. Receipt ve PDF invoice farklıdır. `true` yalnız test amaçlı açık onaydan sonra: `mode=payment`, `customer_creation=always`, billing address required ve invoice_creation.enabled parametrelerini doğrulayın. İlgili order ID invoice metadata'da, şirket/paket adı açıklamada olur; private proje/dosya adı yer almaz.
3. Gerçek test ödemesini tamamlayın; imzalı webhook D1 PAID/paid_total/paid_tax kaydını oluşturmalı. Stripe Session'da varsa invoice ID saklanır. Invoice üretimi gecikebilir: ilk webhook'ta ID yoksa admin yok diye fatura başarısız varsaymaz; Stripe dashboard'da takip eder. Bu aday invoice olaylarına ayrı PDF arşivleyici eklemez, public PDF URL saklamaz ve receipt'i invoice gibi sunmaz.
4. Stripe'taki generated PDF'yi açıp merchant, buyer, line items, currency, subtotal, tax, total ve paid durumunu karşılaştırın. Gerçek PDF henüz yerelde üretildi/test edildi diye raporlanmaz. Test-mode email davranışını dashboard/docs ile kontrol edin; test-mode email gelmemesi tek başına hata kanıtı değildir. Approved test recipient ile receipt ve invoice delivery adımları kaydedilir.
5. `TAX_MODE=unconfigured` fail-closed kalır. Mali incelemeden sonra reviewed manual veya automatic tax seçimi; automatic modda adres/vergi hesaplaması, negatif/yanlış toplamların reddi ve gerçek tax liability doğrulanır. Mevcut owner_reviewed_manual modu API içinde manual tax-rate eklemez; tahsil edilmesi gereken manuel vergi varsa bu modla satış açılmamalı, doğru automatic-tax kurulumu veya ayrı uygulanmış fiyat/vergi akışı gerekir. Zero-tax veya küresel uygunluk vaadi verilmez.
6. İptal dönüşü açık Session'a döner; ikinci Session/charge oluşturulmaz. Expired/completed Session tekrar açılmaz. Async pending paid sayılmaz; failure/retry/delayed webhook aynı order'a bağlanır. Fatura problemlerinde yeniden ödeme istemeden Stripe payment ID kontrol edilir; refunds/disputes yetkili operatörce ayrıca yürütülür.

Yerel testler params/feature flag, metadata, bill-to collection, tax-inclusive total, invoice ID persistence ve yanlış hesap/imza/toplamı kapsar. Gerçek Stripe hesap kabiliyeti, PDF içeriği, email, tax ve ücret doğrulaması **PENDING**. `INVOICE_CREATION=false` checked-in kaldı; production true için ayrıca onay gerekir.

Referanslar: [Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create), [Receipts and paid invoices](https://docs.stripe.com/receipts). Canlı dashboard Payment Links'teki eski e-posta-ek açıklamaları, dinamik portal devreye gireceği zaman ayrı onayla gözden geçirilmeli; bu teslim linkleri değiştirmedi.

## Sipariş ve dosya teslim alma

1. Access allowlist admin girişinden sonra yalnız server-verified PAID siparişleri işleme alın. Panel order ID, SKU, aktivite sayısı, paid total/tax, invoice reference, expiry ve dosyaları gösterir. Child reupload yeni charge değildir.
2. Son saate bırakmadan her dosyayı private authenticated download ile alın. İndirme logu `download:<opaque-file-id>` olarak tutulur; bu, tamamlanmış temiz kopya garantisi değildir.
3. Approved şifreli çalışma deposunda sayım, byte boyutu, AV/izole parser taraması ve okunabilirliği doğrulayın; private filename/email'i monitoring'e göndermeyin. Makro/external content çalıştırmayın.
4. Admin `mark retrieved` düğmesi operatörün bu kontrolleri yaptığı teyididir. PAID hazır durum ve tüm READY dosyalar için download kaydı gerekir. `retrieved_at` ve audit action tutulur. Tamamlanmamış reupload DRAFT'ı alınmış diye işaretlenemez.
5. Bu çalışma deposu bu PR tarafından oluşturulmadı. Owner erişim listesi, şifreleme, coğrafi aktarım, yedek, saklama süresi, silme/silme talebi ve final deliverable transfer prosedürünü yazılı onaylamalı. 4–12 iş günü teslim için kaynakların 12 saatlik intake dışında hukuka uygun çalışma kopyası gerekir. Metadata/transaction retention için de belirli bir süre ve hukuki dayanak onayı bekliyor; sonsuz saklama uygunluğu iddia edilmez.
6. Final teslimat, önceden üzerinde anlaşılmış kimlik doğrulamalı ve sınırlı süreli transfer yöntemiyle yapılır; genel erişimli bucket/link yok. Bu portal final deliverable arşivi değildir. Müşteriye teslim teyidi ve revizyon kapsamı ayrıca kaydedilir.

## Süre dolarsa

Oturum creation +43200 saniyede yeni erişim kapanır; ödeme/indirme uzatmaz. Başlamış bir stream tamamlanabilir, önceden indirilmiş kopya geri alınamaz. Cron backlog/arıza fiziksel silmeyi geciktirebilir. Operator 12 saatten önce kopyayı almamışsa PAID_FILES_EXPIRED durumu görülür; kullanıcı bearer ile reupload talep eder. Operatör order/payment/kimlik doğrulamasını bağımsız güvenli kanaldan yapar, `issue-reupload` ile bir child üretir; yeni capability yalnız bir defa görünür. Yeni 12h süre, aynı paid total; tekrar checkout yasak. Orijinal expired dosya restore edilmez. Destek/itiraz kanalı support@bluefintuna.life; belgeler e-posta eki olarak istenmez. İade talepleri yapılan iş, anlaşma ve zorunlu haklara göre incelenir; mutlak iade yasağı yok.

## İzleme ve bildirim

`GET /api/v1/admin/operations` Access zorunlu; sadece aggregate counts/time/alerts. Admin her load'da okur:
- cleanup heartbeat eksik veya >30dk: scheduled worker/runtime/scheduler incelemesi;
- overdue/failed/stale UPLOADING dosyalar veya R2 delete failure: backlog'u araştır, TTL erişimini uzatma;
- unpaid checkout expiration retry: Stripe erişimi/idempotency incele;
- Telegram enabled iken >15dk geciken veya 8 denemeyi dolduran outbox: operatör müdahalesi;
- son 1 saatte expire olacak alınmamış PAID dosyalar: öncelikli retrieval.

Cleaner tamamlandığında heartbeat ve hata sayıları yazılır; uncaught failure heartbeat'i güncellemez. Telegram opsiyonel ve işlem otoritesi değildir. Gönderim en çok 8 retry; dış sistem crash aralığında duplicate mümkün. Paid total/order/SKU/expiry dışında müşteri veya dosya verisi yok. Cron boş olduğu için canlı bildirim gönderilmiyor. External pager/collector kurulmadı; operasyonel alarm teslimi ayrı onaylı kurulum ve test ister. Monitörün kendisinin down olduğu durum için ayrıca watchdog tasarlayın; human Access auth'u gevşetmeyin.

## Rollback

Yeni intake kapatılır, mevcut ödeme/webhook ve cleanup devam ettirilir. Yeni şemayı silmeyin; backup/önceki Worker sürüm uyumluluğu kontrolü ve rollback ayrı onayla yapılır. Bekleyen dosyaları korumak için retention'ı sessizce uzatmayın. Sonrasında gerekiyorsa yeniden yükleme/iade/destek süreci işletilir. Hiçbir uzak rollback bu teslimde çalıştırılmadı.
