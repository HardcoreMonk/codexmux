---
title: Web tarayıcı paneli
description: Geliştirme çıktısını test etmek için yerleşik bir tarayıcı sekmesi, purplemux CLI'den sürülebilir, mobil görüntü alanları için cihaz emülatörü ile.
eyebrow: Çalışma alanları & Terminal
permalink: /tr/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

Bir web tarayıcı sekmesini terminalinizin ve Claude oturumunuzun yanına bırakın. Yerel geliştirme sunucunuzu, staging sitesini, erişilebilir her şeyi çalıştırır — ve shell'den ayrılmadan `purplemux` CLI'sinden sürebilirsiniz.

## Bir tarayıcı sekmesi açın

Yeni bir sekme ekleyin ve panel türü olarak **Web tarayıcı**'yı seçin. Adres çubuğuna bir URL yazın — `localhost:3000`, bir IP veya tam bir https URL. Adres çubuğu girdiyi normalleştirir: çıplak hostname'ler ve IP'ler `http://`'ye, geri kalan her şey `https://`'ye gider.

Panel, purplemux macOS yerel uygulaması olduğunda (Electron yapısı) gerçek bir Chromium webview olarak çalışır ve normal bir tarayıcıdan erişildiğinde iframe'e düşer. iframe yolu çoğu sayfayı kapsar ama `X-Frame-Options: deny` gönderen siteleri çalıştırmaz; Electron yolunda bu sınır yoktur.

{% call callout('note', 'En iyisi yerel uygulamada') %}
Cihaz emülasyonu, CLI ekran görüntüleri ve console / network yakalama yalnızca Electron yapısında çalışır. Tarayıcı sekmesi yedeği size adres çubuğu, geri / ileri ve yenileme verir, ama daha derin entegrasyonlar bir webview gerektirir.
{% endcall %}

## CLI'den sürülen gezinti

Panel, ürünle birlikte gelen `purplemux` CLI'sının sardığı küçük bir HTTP API sunar. Herhangi bir terminalden — tarayıcı panelinin yanında oturan da dahil — şunları yapabilirsiniz:

```bash
# sekmeleri listele ve bir web tarayıcı sekmesinin ID'sini bul
purplemux tab list -w <workspace-id>

# geçerli URL + başlığı oku
purplemux tab browser url -w <ws> <tabId>

# bir dosyaya ekran görüntüsü al (veya --full ile tam sayfa)
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# son console loglarını izle (500 girişlik halka tampon)
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# ağ etkinliğini incele, isteğe bağlı tek bir yanıt gövdesini al
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# sekme içinde JavaScript çalıştır ve serileştirilmiş sonucu al
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

CLI, `~/.purplemux/cli-token`'daki bir token ile kimlik doğrular ve portu `~/.purplemux/port`'tan okur. Aynı makinede çalışırken bayrak gerekmez. Tam yüzey için `purplemux help`'ı ya da temel HTTP uç noktaları için `purplemux api-guide`'ı çalıştırın.

Bu, paneli Claude için kullanışlı kılan şeydir: Claude'tan ekran görüntüsü almasını, console'da hatayı kontrol etmesini veya bir prob betiği çalıştırmasını isteyin — Claude da sizinle aynı CLI'ya sahip.

## Cihaz emülatörü

Mobil iş için paneli mobil moda çevirin. Bir cihaz seçici, iPhone SE'den 14 Pro Max'a, Pixel 7, Galaxy S20 Ultra, iPad Mini ve iPad Pro 12.9" için ön ayarlar sunar. Her ön ayar şunları içerir:

- Genişlik / yükseklik
- Cihaz pixel oranı
- Eşleşen bir mobil user agent

Portrait / landscape arasında geçiş yapın ve bir zoom seviyesi seçin (`fit` panele ölçeklenir veya sabit `50% / 75% / 100% / 125% / 150%`). Cihazı değiştirdiğinizde webview yeni UA ile yeniden yüklenir, böylece sunucu tarafı mobil tespit, telefonunuzun göreceğini görür.

## Sıradaki adımlar

- **[Sekmeler & paneller](/purplemux/tr/docs/tabs-panes/)** — tarayıcıyı Claude'un yanındaki bir bölmeye yerleştirme.
- **[Git workflow paneli](/purplemux/tr/docs/git-workflow/)** — diğer amaca yönelik panel türü.
- **[Kurulum](/purplemux/tr/docs/installation/)** — tam webview entegrasyonunun yaşadığı macOS yerel uygulaması.
