---
title: Tarayıcı desteği
description: Masaüstü ve mobil uyumluluk matrisi, karşılaşacağınız tarayıcıya özgü tuhaflıklarla birlikte.
eyebrow: Başlarken
permalink: /tr/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux bir web uygulamasıdır; yani deneyim açtığınız tarayıcıya bağlıdır. Aşağıdakiler aktif olarak test ettiğimiz sürümlerdir — daha eski tarayıcılar çalışabilir ama desteklenmez.

## Masaüstü

| Tarayıcı | Asgari | Notlar |
|---|---|---|
| Chrome | 110+ | Önerilir. Tam PWA + Web Push. |
| Edge | 110+ | Chrome ile aynı motor, aynı destek. |
| Safari | 17+ | macOS Sonoma+ üzerinde tam PWA. Web Push, macOS 13+ ve kurulu bir PWA gerektirir. |
| Firefox | 115+ ESR | İyi çalışır. PWA kurulumu manueldir (kurulum istemi yok). |

Tüm özellikler — xterm.js terminal, canlı zaman tüneli, Claude oturum görünümü, Git diff paneli — bu motorlarda aynı şekilde çalışır.

## Mobil

| Tarayıcı | Asgari | Notlar |
|---|---|---|
| iOS Safari | **16.4+** | Web Push için zorunlu. Önce **Ana Ekrana Ekle** yapılmalı; bildirim sıradan bir sekmeden tetiklenmez. |
| Android Chrome | 110+ | Web Push sıradan sekmeden de çalışır, ama tam ekran düzen için PWA olarak kurmanızı öneririz. |
| Samsung Internet | 22+ | Çalışır. Kurulum istemi otomatik gelir. |

{% call callout('warning', 'iOS Safari ≥ 16.4 sınır çizgisidir') %}
Apple Web Push'u iOS'a yalnızca Safari 16.4 (Mart 2023) ile ekledi. Daha eski iOS sürümleri panel kullanabilir ama PWA kurulsa bile push bildirim gelmez.
{% endcall %}

## Özellik gereksinimleri

purplemux birkaç modern tarayıcı API'sine yaslanır. Eksik olduklarında uygulama kibarca düşer ama ilgili özelliği kaybeder.

| API | Kullanıldığı yer | Yedek |
|---|---|---|
| WebSocket | Terminal G/Ç, durum senkronizasyonu, zaman tüneli | Zorunlu — yedek yok. |
| Clipboard API | `npx purplemux` kopyala, kod bloğu kopyala | Mevcut değilse düğme gizlenir. |
| Notifications API | Masaüstü / mobil push | Atlanır — uygulama içi durum yine görünür. |
| Service Workers | PWA + Web Push | Yalnızca normal web uygulaması olarak sunulur. |
| IntersectionObserver | Canlı oturum zaman tüneli, gezinti açılışları | Öğeler animasyonsuz çizilir. |
| `backdrop-filter` | Yarı saydam gezinti, modallar | Düz tonlu arka plana düşer. |
| CSS `color-mix()` + OKLCH | Tema değişkenleri | Safari < 16.4 bazı tonlu durumları kaybeder. |

## Tarayıcım uygun mu?

purplemux **Ayarlar → Tarayıcı kontrolü** içinde yerleşik bir öz denetim sunar. Yukarıdaki kontrolleri çalıştırır ve özellik başına yeşil / sarı / kırmızı bir rozet gösterir, böylece bir spesifikasyon okumadan doğrulayabilirsiniz.

## Bilinen tuhaflıklar

- **Safari 17 + özel pencereler** — IndexedDB devre dışıdır, çalışma alanı önbelleğiniz yeniden başlatmalar arasında kalmaz. Normal pencere kullanın.
- **iOS Safari + arka plan sekmesi** — terminaller arka planda yaklaşık 30 saniye sonra otomatik kapatılır. Tmux gerçek oturumu canlı tutar; geri döndüğünüzde arayüz yeniden bağlanır.
- **Firefox + Tailscale Serve sertifikası** — `ts.net` içinde olmayan özel bir tailnet adı kullanırsanız Firefox HTTPS güveni konusunda Chrome'dan daha titiz olabilir. Sertifikayı bir kez kabul edin, yapışır.
- **Self-signed sertifikalar** — Web Push kayıt olmaz. Tailscale Serve (otomatik Let's Encrypt) ya da gerçek bir alan adı + ters proxy kullanın.

## Desteklenmeyenler

- **Internet Explorer** — hiçbir zaman desteklenmedi.
- **UC Browser, Opera Mini, Puffin** — proxy tabanlı tarayıcılar WebSocket'i bozar. Çalışmaz.
- **3 yıldan eski herhangi bir tarayıcı** — CSS'imiz 2023 sonrası bir motor gerektiren OKLCH renk ve container query'leri kullanır.

Sıra dışı bir kurulumdaysanız ve bir şey çalışmıyorsa, lütfen user agent ve öz denetim çıktısıyla [bir issue açın](https://github.com/subicura/purplemux/issues).
