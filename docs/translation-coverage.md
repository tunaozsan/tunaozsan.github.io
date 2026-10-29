# Çeviri kapsamı — 2026-10-29

EN: mevcut 23 HTML route/alias, portal ve admin kaynak metinleri İngilizce. `VALIDATED_LOCALES=['en']`; dil seçici veya çevrilmiş sayfa iddiası yok. Hukuki metinler İngilizce taslak; legal onay bekliyor.

TR, RU, AR, ES, PT-BR, FR, DE: çeviri **uygulanmadı / doğrulanmadı**. RTL logical CSS ve 375px fixture kontrolü vardır; AR çeviri veya gerçek Arapça dizgi testi değildir.

Aşamalı yayın: ürün/price/error/consent metinlerini tek sözlük sistemine ayırma, TR/RU insan incelemesi; AR çeviri + gerçek RTL/sayı/tarih/bidi dosya adı incelemesi; sonra diğer diller. Fiyatlar API'de USD integer cents kalır. Consent sürümü ve hukuki çeviriler birlikte review edilir. Validated locale listesine ancak tamamlanmış dil eklenir; fallback EN açıkça belirtilir. Bu çalışma yeni dil yayımlamadı.
