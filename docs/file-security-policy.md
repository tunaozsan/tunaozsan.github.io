# Dosya güvenliği ve kabul politikası — 2026-10-29

**Uygulanan kapsam:** XER, CSV, PDF. XLSX, XLS, DOCX, XLSM, ZIP, XML, CAD ve MPP kabul edilmiyor. Bu, istenen Office genişlemesinin tamamlandığı anlamına gelmez. Bu adayda OPC iç yapısı/ilişkileri ve legacy OLE denetleyicisi veya antivirus servisi yoktur; yalnızca PK/CFB magic kontrolü ekleyerek Office desteği açmak savunulabilir bulunmadı. Kullanıcıya desteklenmeyen biçim önerilmez. Yeni kaynak/scanner oluşturulmadı.

| Biçim | Kodda kabul | Kontrol ve kalan risk | Güvenli alternatif |
|---|---|---|---|
| XER | Evet, text/plain veya application/octet-stream | ERMHDR başlangıcı, başlıkta binary/HTML/script reddi; P6 semantik doğrulaması/antivirus değil | Orijinal export, operatörün izole parser incelemesi |
| CSV | Evet, text/csv veya text/plain | Ayraç ve metin başlığı; formül/DDE riski sürer | BOQ'yu değer olarak dışa aktar; operatör düz metin incelemesi ve formülleri çalıştırmadan açma |
| PDF | Evet, application/pdf | %PDF- başlangıcı; gömülü JS/dosyalar ve bozuk PDF riski sürer | Gömülü dosyasız çizim/scope export; izole AV incelemesi |
| XLSX/DOCX | Hayır | OPC/ZIP güvenli parser, ilişki/aktif içerik denetimi ve tarama eksik | Tabloyu CSV, belgeyi PDF dışa aktar |
| XLS | Hayır | ZIP değildir; CFB/OLE, VBA/Excel 4 macro ve embedded object incelemesi gerekir | Kontrollü ortamda CSV/PDF export |
| ZIP | Hayır | İçerik açılmaz; encrypted/nested/symlink/bomb/çalıştırılabilir riski | Dosyaları desteklenen biçimlerde ayrı yükle |
| XLSM ve diğer makrolar | Hayır | Ayrı açık onay ve güvenlik tasarımı gerekir | Makroları kaldırıp değer tablosu export |

Her dosya 20 MiB, sipariş toplamı 100 MiB ve en çok 20 dosya. Boş/yanlış tip, path traversal, yanlış MIME ve `xer` kategorisine PDF yerleştirme reddedilir. Header tek başına güvenilir değildir. Bildirilen Content-Length büyükse erken ret; eksik veya sahte küçükse gerçek okunan byte sayısı sınırı uygular. Cancel/bağlantı kopması FAILED durumuna geçer; kısmi R2 nesnesi silinir veya cleanup retry'a kalır.

D1 trigger her in-flight dosya için 20 MiB rezervasyon yapar. **0002 migration ile tüm siparişlerde aynı anda en fazla iki upload**; üçüncü istek 409 verir. Başarılı dosya gerçek boyutuna küçülür. 15 saniye read timeout, 120 saniye mantıksal upload süresi vardır; terk edilen rezervasyonlar cleanup tarafından geri alınır. Gerçek yerel Workers runtime testinde iki 20 MiB sentetik akış tamamlandı, üçüncüsü reddedildi. Bu sonuç gerçek Cloudflare planı kapasite/CPU/bellek sertifikası değildir; uzak yük testi hâlâ gate'tir.

R2 private kalır, random object keys kullanılır, dosya adı URL/key'e yazılmaz. Kullanıcı kabiliyeti SHA-256 hash olarak D1'de saklanır; ham bearer yalnızca bir defa döner. Ele geçirilmiş gerçek bearer kendi siparişinin yetkilerini verir; hash hırsızlığı önlemez. Kodlar e-posta/URL/loglara konmamalı; cihaz ve CSP güvenliği önemlidir. Başka sipariş/uydurma token testleri read/upload/delete'i reddeder.

## Office/ZIP için etkinleştirmeden önce gereken tasarım

Onaysız uygulanmaz. Önerilen muhafazakâr üst sınırlar: 128 entry, toplam açılmış veri 20 MiB, entry başına 5 MiB, 20:1 expansion ratio, path derinliği 4, nested archive sıfır. Gerçek inflate çıktısı da sayılmalı; declared ZIP metadata yeterli değildir. Encrypted entry, ZIP64/multi-disk (ilk sürüm), symlink, path traversal, absolute path, duplicate/overlapping entries, executable/script/macro/OLE/ActiveX, external relationship/remote template reddedilmeli. XLSX/DOCX için content types, root relationships ve doğru workbook/document OPC parçası doğrulanmalı; XML DTD/entities kapatılmalı. CRC ve local/central directory tutarlılığı denetlenmeli. Tarama başarısız/zaman aşımı ise quarantine'dan indirme yok. Scanner izolasyonu, maliyeti, retention ve ayrı kaynak ihtiyacı sahibi tarafından onaylanmalı. Bu liste uygulanmış kod değil, açılma koşuludur.

## Operatör açma ve büyük dosya süreci

İndirilen dosya önce güncel antivirus ve izole, güncel viewer/parser ile taranır; macro/external content etkinleştirilmez. Inline preview yok. PDF de güvenilir kabul edilmez. Görev için gereken dosyalar şifreli/erişimi sınırlı çalışma deposuna alınır, dosya sayısı/boyutu ve kullanılabilirlik doğrulanır, sonra admin'de retrieved işaretlenir. Kod download girişimini kanıtlar; tamamlanmış ve taranmış kopyayı operatör teyit eder.

20 MiB üzerindeki çizimler için optimize edilmiş PDF, anlamlı ayrı sayfa grupları veya kapsam/operatörle onaylanmış taramalı ayrı transfer süreci gerekir. Limitleri aşmak için ZIP önerilmez; özel dosyalar e-posta eki veya public link ile istenmez. Ayrı transfer sistemi şu an oluşturulmuş değildir.

Test fixtures yalnızca sentetik ERMHDR/CSV/PDF/PK/CFB başlangıçlarıdır; malware örnekleri repoya eklenmedi. İmza kontrolü antivirus değildir.
