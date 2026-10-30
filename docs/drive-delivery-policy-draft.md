# Drive çalışma kopyası ve müşteri teslimi — onay bekleyen ek politika taslağı

Bu metin mevcut Apple Privacy/Contact/Support sayfalarını değiştirmez; yayımlanmış hukuki onay değildir. Yalnız sentetik staging testlerinde kullanılacaktır.

- İlk yüklenen R2 belgeleri: sipariş oluşturulmasından itibaren 12 saat erişim; mevcut Cron fiziksel silmesi değişmez.
- Ödeme doğrulandıktan sonra özel çalışma kopyası, işletme sahibinin kişisel Google Drive hesabındaki yalnız uygulamanın oluşturduğu klasöre alınır. Kişisel diğer Drive içeriği taranmaz. Google API kapsamı drive.file; müşteriye Google paylaşımı verilmez.
- Önerilen çalışma kopyası saklama: hizmet süresince ve teslimden sonra en fazla 90 gün; yayın formunda süre açıkça seçilir. Google sağlayıcısının veri işleme/konum/alt işleyen koşulları, müşteri hakları ve muhasebe kaydı süresi sahibi/uzman tarafından ayrıca incelenmelidir.
- Önerilen müşteri erişimi: yayından sonra en fazla 30 gün. Davet 24 saat içinde bir kez etkinleşir, oturum en fazla 1 saattir. Süresi dolan oturumda operatör yeni davet oluşturur; eski davetler/oturumlar iptal olur. Bağlantı hak sahipliği e-posta hesabı sahipliği doğrulaması değildir. Manuel gönderim yalnız Stripe satın alma iletişim e-postasına yapılır.
- Opsiyonel ikinci kod bağımsız kanaldan gönderilir; link ile aynı e-postada gönderilirse 2FA olarak tanıtılmaz.
- Final dosyalar XER/PDF/XLSX ikili dosyalardır. Admin, izole çalışma alanında dosyaları tarar; temiz tarama raporunu ve tam SHA-256 hash'ini onaylar. Otomatik antivirüs hizmeti bu sürümde yoktur. XLSM, genel ZIP ve Google-native belgeler teslim kapsamına alınmaz.
- Yayınlanan Drive dosyasının belirli binary revision'ı sabitlenir; müşteri yalnız backend proxy üzerinden o revision'ı indirir. Orijinal içerik sonradan değişirse yeniden inceleme gerekir. İndirme başlatıldı kaydı, eksiksiz alındı veya müşteri kabulü demek değildir.
- Refund/chargeback/hesap ele geçirilmesi/başarısız hizmet/silme isteğinde operatör hold ve revoke uygular. Publish sırasında mevcut Stripe refund/dispute durumu tekrar kontrol edilir; sonraki olaylar için otomatik yeni Stripe event aboneliği bu sürümün kapsamı değildir. Bu operasyon boşluğu production öncesi onaylanmalı veya otomatikleştirilmelidir.
- Hold altında otomatik Drive silme durur; hukuki saklama gereksinimi ile müşteri silme talebi operatörce çözülmelidir. Veritabanı işlem/audit kayıtları dosyadan ayrı saklanır. Yedek geri dönüşünün silinmiş erişimleri tekrar açmaması için kontrol gerekir.
- Otomatik müşteri e-postası gönderilmez. Admin oluşturulan mesajı kendi çalışan e-posta hesabından gönderir. Link/kodlar destek kaydına, analitiğe, sohbete veya Git'e yazılmaz.
