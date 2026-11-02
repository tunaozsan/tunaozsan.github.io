# New Mexico işlem vergisi dayanağı — 2 Kasım 2026

Bu not bir işletme sahibi beyanını resmî kaynakla karşılaştırır; muafiyet belgesi, bağımsız CPA görüşü veya belirli bir müşteri siparişinin onayı değildir. Foreign-owned U.S. Disregarded Entity sınıflandırması ve Stripe US → Mercury USD modeli değiştirilmedi.

## Mevcut dayanak ve sınırı

**PASS — resmî eşik doğrulandı.** Fiziksel varlığı olmayan satıcı için önceki takvim yılında NM'ye kaynaklanan vergiye tabi hasılatın **en az 100.000 USD** olması ekonomik nexus ölçütüdür. 2026 değerlendirmesinde önceki yıl 2025'tir. [NM TRD, Gross Receipts Tax Economic Nexus](https://www.tax.newmexico.gov/businesses/determining-nexus/), [3.2.1.12(A) NMAC](https://www.srca.nm.gov/parts/title03/03.002.0001.html).

**İşletme sahibi olguları:** NM adresi yalnız posta/registered-agent; NM'de ofis, çalışan ve fiilen verilen hizmet yok; 2025 NM kaynaklı satış 0 USD; satışlar çevrimiçi Primavera P6 danışmanlığı. Bu olgular doğru ve fiziksel varlık sonucu uygulanabilir ise **bildirilen 0 USD, 2026 için bu ekonomik nexus eşiğini karşılamaz**. Bu koşullu çıkarım, BTIN'in mevcut olmadığını, NM'de hiçbir ayrı bildirim yükümlülüğü bulunmadığını veya dünyadaki bütün siparişlerin vergisiz olduğunu kanıtlamaz. Stripe registrations boşluğu ve `not_collecting` bu sonucun kaynağı değildir.

Hizmetin ilk kullanım yeri ayrıca önemlidir. NM dışındaki hizmetin ürününün ilk kullanımı NM dışında ise ilgili NM kuralı bunu NM'de ilk kullanımdan ayırır; inşaatla ilişkili hizmetlerde proje yeri özel önem taşır. P6 paketinin pazarlama adı tek başına sınıflandırma yapmaya yetmez. [3.2.1.21 ve 3.2.1.23 NMAC](https://www.srca.nm.gov/parts/title03/03.002.0001.html), [3.1.4.13 NMAC — hizmet ve inşaat proje yeri kuralları](https://www.srca.nm.gov/parts/title03/03.001.0004.html).

## Belgesi bulunmayan hususlar

- **NOT RUN / belge sağlanmadı:** Kuruluş sağlayıcısının daha önce NM vergi hesabı açıp açmadığı; varsa BTIN, vergi türü, yürürlük tarihi ve hesabın durumu. Yoksa sağlayıcının/TAP'ın kayıt durumunu gösteren teyidi. Yeni kayıt oluşturulmadı.
- **NOT RUN / belge sağlanmadı:** Registered-agent hizmetinin yalnız idari/posta işlevi gördüğüne ve NM'de satış temsilciliği/operasyon yürütülmediğine ilişkin mevcut sözleşme/teyit; beyan edilen 2025 hasılatın muhasebe kaydı. Bunlar otomatik olarak başka eyaletler için sonuç üretmez.
- **NOT RUN / ilk sipariş yok:** Gerçek müşterinin fatura ülke/eyaleti, B2B niteliği, proje ülkesi/eyaleti, hizmetin niteliği ve ilk kullanım yeri ile o işleme uygulanacak tahsil/tahsil etmeme kararı. Bu bilgiler yeni başvuruda zorunludur; eski eksik başvuru kabulü geriye dönük doldurulmaz.

## İlk sipariş için tek operatör işlemi

Admin, müşterinin tamamlanmış başvurusunu inceleyip aynı kapsam ve bütün ilgili konumlar için gerçek yazılı işlem-vergi kararının referansını, belgenin SHA-256'sını ve gerekçesini kaydeder. Belgeyi özel muhasebe dosyasında saklar. Karar tahsil gerektiriyorsa uygulanan aktif kayıt doğrulanır; tahsil etmeme kararıysa bunun dayanağı ayrıca açıkça beyan edilir. `not_collecting` tek başına kabul edilmez. Bu owner kontrolü bağımsız uzman incelemesi diye kaydedilmez. Belirsizlik varsa yalnız o başvuru `TAX_REVIEW_REQUIRED` kalır.

Bu kayıt onayından sonra Admin'in özel tek kullanımlık daveti mevcut upload → Checkout → doğrulanmış capture → D1/PDF → Drive → teslim yolunu açar. Adres, kullanım bilgisi, kapsam veya sözleşme değişikliği yeni başvuru/değerlendirme gerektirir. Onay ödemeyi kendi başına almaz. Yeni yılda önceki yıl hasılatının değişmesi ayrıca değerlendirilir; 2025 beyanı süresiz muafiyet değildir.
