---
title: PWA kurulumu
description: Tam ekran, uygulama benzeri bir deneyim için iOS Safari ve Android Chrome'da purplemux'ı ana ekranınıza ekleyin.
eyebrow: Mobil & Uzaktan
permalink: /tr/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux'ı bir Progressive Web App olarak kurmak, tarayıcı sekmesini ana ekranınızda bağımsız bir simgeye, tam ekran düzene ve uygun açılış ekranlarına çevirir. iOS'ta ayrıca Web Push'un ön koşuludur.

## Neler elde edersiniz

- **Tam ekran düzen** — tarayıcı krom yok, terminal ve zaman tüneli için daha fazla dikey alan.
- **Uygulama simgesi** — purplemux ana ekrandan herhangi bir yerel uygulama gibi açılır.
- **Açılış ekranları** — purplemux iPhone'lar için cihaz başına açılış görüntüleri sunar, böylece açılış geçişi yerel hissettirir.
- **Web Push** (yalnızca iOS) — push bildirimleri yalnızca PWA kurulumundan sonra tetiklenir.

Manifest `/api/manifest`'te sunulur ve purplemux işareti ile tema rengiyle `display: standalone` kaydeder.

## Kurulumdan önce

Sayfa, PWA'ların çalışması için **HTTPS** üzerinden erişilebilir olmalıdır. `localhost`'tan Chrome'da çalışır (loopback istisnası) ama iOS Safari düz HTTP üzerinden kurulumu reddeder. Temiz yol Tailscale Serve'tür — [Tailscale erişimi](/purplemux/tr/docs/tailscale/) sayfasına bakın.

{% call callout('warning', 'iOS Safari 16.4 veya üstü gerekir') %}
Daha eski iOS sürümleri PWA'yı kurabilir ama Web Push teslim etmez. Push sizin için önemliyse önce iOS'u güncelleyin. Tarayıcıya göre detay [Tarayıcı desteği](/purplemux/tr/docs/browser-support/) sayfasında.
{% endcall %}

## iOS Safari

1. purplemux URL'ini **Safari**'de açın (diğer iOS tarayıcıları PWA'lar için Add to Home Screen sunmaz).
2. Alt araç çubuğundaki **Paylaş** simgesine dokunun.
3. Eylem sayfasını kaydırın ve **Ana Ekrana Ekle**'yi seçin.
4. İsterseniz adı düzenleyin, sonra sağ üstte **Ekle**'ye dokunun.
5. purplemux'ı yeni ana ekran simgesinden başlatın — tam ekran açılır.

Simgeden ilk açılış, iOS'un onu gerçek bir PWA olarak ele almaya başladığı andır. Herhangi bir push izin istemi normal bir Safari sekmesinden değil, bu bağımsız pencereden tetiklenmelidir.

## Android Chrome

Chrome kurulabilir bir manifest'i otomatik tespit eder ve bir banner sunar. Görmüyorsanız:

1. purplemux URL'ini **Chrome**'da açın.
2. Sağ üstteki **⋮** menüsüne dokunun.
3. **Uygulamayı yükle**'yi seçin (bazen **Ana ekrana ekle** olarak etiketlenir).
4. Onaylayın. Simge ana ekranınızda ve uygulama çekmecesinde belirir.

Samsung Internet de aynı şekilde davranır — kurulum istemi genellikle otomatik gelir.

## Kurulumu doğrulama

purplemux'ı ana ekran simgesinden açın. Tarayıcı adres çubuğu gitmiş olmalı. Hâlâ tarayıcı arayüzü görüyorsanız manifest uygulanmamış demektir — genellikle sayfa düz HTTP üzerinden veya alışılmadık bir proxy aracılığıyla yüklendiği için.

Bunu **Ayarlar → Bildirim**'de de doğrulayabilirsiniz — PWA kurulu ve Web Push destekli olduğunda, anahtar etkinleşir.

## PWA'yı güncelleme

Yapılacak bir şey yok. PWA, purplemux örneğinizin sunduğu aynı `index.html`'i yükler, böylece purplemux'ı yükseltmek bir sonraki açılışta kurulu uygulamayı yükseltir.

Kaldırmak için simgeyi uzun basıp OS-yerel kaldırma eylemini seçin.

## Sıradaki adımlar

- **[Web Push bildirimleri](/purplemux/tr/docs/web-push/)** — PWA kurulduğuna göre arka plan uyarılarını açın.
- **[Tailscale erişimi](/purplemux/tr/docs/tailscale/)** — iOS'un gerektirdiği HTTPS URL'sini alın.
- **[Tarayıcı desteği](/purplemux/tr/docs/browser-support/)** — tam uyumluluk matrisi.
