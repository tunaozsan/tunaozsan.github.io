# Uygulama fark matrisi — 2026-10-29

Başlangıç: `feature/bluefin-secure-payment-portal`, temiz çalışma ağacı, `caad21abc969931e28e0a94019d9224a77eaa844`; PR #4 açık/taslak, base main `466e0fb`. Önceki uygulama yeniden yazılmayacak. Aşağıdaki ilk denetim sonuçları değişikliklerden önce kaydedildi.

| Alan | Mevcut uygulama / kanıt | Eksik / karar | Uzak doğrulama |
|---|---|---|---|
| 7 paket | catalog.ts; fiyat, baz aktivite, teslim günleri brief ile birebir | Fiyat değişikliği yok; sınır testleri genişletilecek | Stripe hesabı doğrulanmadı |
| Checkout/webhook | payments.ts; HMAC, session/amount/currency, idempotency | Fatura flag testi, ödeme toplamının saklanması, yanlış hesap ve hata testleri eksik | Gerçek Stripe testi bekliyor |
| Dosyalar | storage.ts; XER/CSV/PDF, 20/100 MiB, 20 dosya | Office/ZIP/OPC/antivirus yok; güvenli inceleme olmadan yeni biçimler açılmayacak. Sahte MIME/kategori/length/abort testleri eklenecek | Kapasite ve tarama altyapısı bekliyor |
| Bellek/kota | Sipariş başı D1 reservation | Global eşzamanlı bounded-buffer limiti eksik | Gerçek Worker planı yük testi bekliyor |
| Admin | Access JWT, indirme, retrieved işareti, ücretsiz reupload | Vergili paid total, aktiviteler, operasyon metriği ve indirme kanıtı görünürlüğü eksik | Access login/Safari bekliyor |
| Cleanup | 12h kesin yeni erişim sınırı, retry/orphan sweeper | Son başarılı sweep ve geciken bildirim izleme eksik | Cron/12 gerçek saat testi bekliyor |
| E-posta | Eski hata banner'ları kaynaklarda bulunuyor | Gelen posta sahibi tarafından 2026-10-29 çözüldü; bağımsız test değil. Outbound/reply ve SPF/DKIM/DMARC takip işi | Gelen posta owner-confirmed |
| Apple/marka | Orijinal policy, CNAME, alias ve logo regression mevcut | Yeniden yerel/HTTP kontrol; özel App Store Connect owner verification required | URL GET salt okunur; hesap ayarları erişilmedi |
| Diller | Yalnızca EN, RTL CSS temeli | Çeviri kapsam raporu eklenecek | Gerçek dil doğrulaması yok |

Son komut çıktıları, sonuçlar ve kalan gate'ler RELEASE_CHECKLIST.md'de güncellenecek. Production kaynak mutasyonu, deployment, secret, DNS, Cron, canlı ödeme ve merge yetkisi yoktur.

## Tamamlanan farklar / son durum

- Fiyat değişikliği yapılmadı; tüm SKU ve +50/material sınırları test edildi.
- Invoice false/true, buyer alanları, paid total/tax/invoice reference ve ödeme hata durumları eklendi/test edildi.
- Global iki upload limiti ve gerçek yerel runtime 2×20 MiB testi tamamlandı; üçüncü request reddedildi.
- Admin activity/paid total/retrieval evidence, child reupload ayrımı ve operations monitor eklendi.
- Gelen destek posta uyarıları kaldırıldı; owner-resolved, bağımsız/outbound test yapılmadı.
- Office/ZIP/OPC/OLE/scanner **uygulanmadı**; güvenli export/controlled transfer politikası açık. Bu eksik canlı aktivasyon kapsam kararına dahildir.
- HTTP tanısı güncellendi: varsayılan Python UA 403/1010; tanımlayıcı UA 200 Hello World. Account kimliği whoami token expired nedeniyle bloklu. API deploy edilmedi; remote binding/schema teyidi yok.
- Uzak Stripe PDF, Access, Turnstile, gerçek 12h, external alerts, gerçek cihaz ve hukuk/mali onaylar PENDING. Güncel yerel sonuçlar RELEASE_CHECKLIST.md ve tarihli JSON kanıt dosyalarında.
