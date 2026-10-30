> TAMAMLANDI — 30 Ekim 03:00 UTC / 08:00 Semerkant: yenilenen aynı Chrome oturumuyla Admin API HTTP200 ve iki dosyada HTTP410 files_expired doğrulandı. Kanıt: staging-ttl-final-2026-10-30.json. Aşağıdaki önceki bekleyen giriş notu ve talimatlar tarihsel kayıttır.

> 30 Ekim 02:47 UTC: Gerçek Cron/D1/R2 silme PASS. Admin HTTP410, Access oturumu bittiği için NOT RUN. Günlük takip kaldırıldı; kullanıcı girişinden sonra yalnız HTTP410 kontrolü kaldı. Ayrıntılar HANDOFF.md başındaki TTL takip sonucunda.

# Gerçek 12 saat staging testi — devam talimatı

Production değişikliği, yeni kaynak, yeni ödeme veya portal açılması gerekmiyor.

- Worker: bluefin-project-portal-staging; D1: f87e0350-e5ef-4173-a728-a0678b882c23; R2: bluefin-project-uploads-staging.
- Ödenmiş sipariş: 966850e0-bace-4638-9440-b14524e5ce6f. Dosya: 8ddad3b7-0766-400a-a6d3-bacedc163c66. Expiry: **2026-10-30 01:19:00 UTC**.
- Ödenmemiş sipariş: 039d322c-c207-4824-87bc-810d5e41de20. Dosya: 8ca7e27f-4bf1-4ab2-8842-4d075c1ae550. Expiry: **2026-10-30 01:19:20 UTC**.
- Semerkant karşılıkları 06:19:00 ve 06:19:20. Süreler değiştirilmedi; D1 CHECK tam 43200 saniye.
- Portal kapalı: PORTAL_ENABLED=false, LEGAL_APPROVED=false, INVOICE_CREATION=false. APP_ENV=test. **Cron */15 * * * * açık kalmalı.** Admin ve webhook kapalı portal bayrağından önce işleniyor.
- Son kapalı deployment: 9d14386f-ca80-4e80-9e00-74559e27444e. Tracked wrangler.staging.jsonc bu duruma karşılık gelir. `.build/wrangler.staging-active.jsonc` eski açık test ayarıdır; **yeniden deploy etmeyin**.

## Kontroller

1. Repo kökünde `~/.local/bin/bluefin-cf python3 scripts/staging-ttl-audit.py` çalıştır. Helper yalnız iki sentetik siparişi ve staging R2 nesnelerini okur, credential/capability yazdırmaz. 12 saat öncesi R2 HTTP200 ve SHA256 kanıtıyla kıyasla.
2. Expiry sonrası admin indirme endpointlerini gerçek Access oturumuyla çağır. `/api/v1/admin/orders/{orderId}/files/{fileId}` **410** dönmeli. Yetkisiz 302 veya portal 503, TTL kanıtı değildir. Expiry öncesi ücretli dosya HTTP200 ve byte eşleşmesi; ödenmemiş dosya HTTP403 kanıtı docs/staging-admin-tests-2026-10-29.json içinde.
3. Gerçek Cron sonrası D1 state=DELETED, deleted_at>=expires_at; R2 HTTP404 ve order status PAID_FILES_EXPIRED / EXPIRED_UNPAID ayrı doğrulanmalı. İlk expiry sonrası nominal Cron 01:30 UTC; gerçekleşme gecikebilir. 01:20 kontrolünde henüz silinmemiş nesne tek başına hata değildir. Manuel cleanup veya silme yapma.
4. Cron heartbeat completedAt ve hata sayaçlarını kaydet. R2 403/timeout silindi anlamına gelmez. Gerekirse makul gecikmeyle yeniden kontrol et.
5. Access oturumu bitmişse mevcut ayrı Chrome test penceresinde kullanıcıdan giriş iste; parolayı/OTP/cookie değerlerini okuma. Diğer salt okunur Cron/R2 kontrollerine devam et. Oturum yoksa admin TTL sonucu NOT RUN kalır.
6. HANDOFF.md ve RELEASE_CHECKLIST.md güncel tablosunu kanıt dosyalarıyla güncelle. Tamamlandığında `bluefin-staging-12-saat-ttl-do-rulama` otomasyonunu durdur. Sipariş kabulü kapalı kalmalı; webhook/Cron korunmalı.

İlk otomatik takip uygulamada 06:20 günlük olarak kuruldu; tamamlanınca durdurulacak. Otomasyonun makinede çalışabilmesi gerekir. Saat dilimi farkı veya uyku yüzünden tam sınır anı kaçırılırsa bunu belirt; gecikmiş gözlemi tam 12. saat kanıtı diye sunma.
