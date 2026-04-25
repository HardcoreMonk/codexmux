---
title: Hızlı başlangıç
description: Node.js ve tmux ile purplemux'ı bir dakikadan kısa sürede çalıştırın.
eyebrow: Başlarken
permalink: /tr/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux web tabanlı bir multiplexer'dır. Her Claude Code oturumunu tek bir panelde yönetir, kalıcılık için `tmux`'a yaslanır ve hem masaüstü hem telefon kullanımına göre tasarlanmıştır.

## Başlamadan önce

purplemux'ı çalıştıracağınız makinede iki şeye ihtiyaç var.

- **Node.js 20 veya üstü** — `node -v` ile kontrol edin.
- **tmux** — `tmux -V` ile kontrol edin. 3.0+ herhangi bir sürüm yeterli.

{% call callout('note', 'Yalnızca macOS / Linux') %}
Windows resmi olarak desteklenmez. purplemux, Windows'ta yerel olarak çalışmayan `node-pty` ve tmux'a dayanır. WSL2 genelde çalışır ama test matrisimizin dışındadır.
{% endcall %}

## Çalıştırın

Tek komut. Global kuruluma gerek yok.

```bash
npx purplemux
```

purplemux'ın `8022` portunda başladığını göreceksiniz. Tarayıcıyı açın:

```
http://localhost:8022
```

İlk açılış, parola oluşturma ve ilk çalışma alanı kurma adımlarını size yönlendirir.

{% call callout('tip') %}
Kalıcı kurulum mu istiyorsunuz? `pnpm add -g purplemux && purplemux` aynı şekilde çalışır. Güncellemek için tek komut yeter: `pnpm up -g purplemux`.
{% endcall %}

## Bir Claude oturumu açın

Panelden:

1. Herhangi bir çalışma alanında **Yeni sekme**'ye tıklayın.
2. **Claude** şablonunu seçin (veya basitçe sade bir terminalde `claude` çalıştırın).
3. purplemux çalışan Claude CLI'yi algılar; durumu, canlı zaman tüneli ve izin istemlerini yüzeye çıkarmaya başlar.

Tarayıcıyı kapatsanız bile oturum yaşar — tmux süreci sunucuda canlı tutar.

## Telefonunuzdan erişin

Varsayılanda purplemux yalnızca `localhost`'u dinler. Güvenli dış erişim için Tailscale Serve kullanın (WireGuard + otomatik HTTPS, port yönlendirme yok):

```bash
tailscale serve --bg 8022
```

Telefonunuzda `https://<machine>.<tailnet>.ts.net` adresini açın, **Paylaş → Ana Ekrana Ekle**'ye dokunun ve purplemux arka planda Web Push bildirimleri alan bir PWA olur.

Tam kurulum için [Tailscale erişimi](/purplemux/tr/docs/tailscale/) sayfasına bakın; iOS ve Android ayrıntıları için [PWA kurulumu](/purplemux/tr/docs/pwa-setup/) sayfasına geçin.

## Sıradaki adımlar

- **[Kurulum](/purplemux/tr/docs/installation/)** — platform ayrıntıları, macOS yerel uygulaması, otomatik başlatma.
- **[Tarayıcı desteği](/purplemux/tr/docs/browser-support/)** — masaüstü ve mobil uyumluluk matrisi.
- **[İlk oturum](/purplemux/tr/docs/first-session/)** — panelin rehberli turu.
- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — tüm bağlamalar tek tabloda.
