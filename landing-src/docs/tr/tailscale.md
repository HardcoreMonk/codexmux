---
title: Tailscale erişimi
description: purplemux'a telefonunuzdan Tailscale Serve ile HTTPS üzerinden ulaşın — port yönlendirme yok, sertifika derdi yok.
eyebrow: Mobil & Uzaktan
permalink: /tr/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

Varsayılan olarak purplemux yalnızca yerel olarak dinler. Tailscale Serve, onu diğer cihazlarınıza açmanın en temiz yoludur: WireGuard ile şifrelenmiş, otomatik Let's Encrypt sertifikaları ve sıfır güvenlik duvarı değişikliği.

## Neden Tailscale

- **WireGuard** — her bağlantı cihazdan cihaza şifrelenir.
- **Otomatik HTTPS** — Tailscale `*.<tailnet>.ts.net` için gerçek bir sertifika sağlar.
- **Port yönlendirme yok** — makineniz halka açık internete asla port açmaz.
- **iOS için HTTPS zorunludur** — PWA kurulumu ve Web Push, ikisi de o olmadan çalışmayı reddeder. [PWA kurulumu](/purplemux/tr/docs/pwa-setup/) ve [Web Push](/purplemux/tr/docs/web-push/) sayfalarına bakın.

## Ön koşullar

- Bir Tailscale hesabı, `tailscale` daemon'ı kurulu ve purplemux'ı çalıştıran makinede oturum açılmış.
- Tailnet'te HTTPS etkin (Admin console → DNS → HTTPS Sertifikalarını etkinleştir, henüz değilse).
- Varsayılan port `8022`'de (veya `PORT`'u ayarladığınız yerde) çalışan purplemux.

## Çalıştırın

Tek satır:

```bash
tailscale serve --bg 8022
```

Tailscale yerel `http://localhost:8022`'nizi HTTPS'e sarar ve tailnet içinde şu adreste sunar:

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` kutunun hostname'i; `<tailnet>` ise tailnet'inizin MagicDNS son ekidir. Aynı tailnet'e oturum açmış başka bir cihazdan o URL'yi açın ve içeri girersiniz.

Sunmayı durdurmak için:

```bash
tailscale serve --bg off 8022
```

## Çalıştığında neler yapabilirsiniz

- URL'yi telefonunuzda açın, **Paylaş → Ana Ekrana Ekle**'ye dokunun ve [PWA kurulumu](/purplemux/tr/docs/pwa-setup/) adımlarını takip edin.
- Bağımsız PWA'nın içinden push'u açın: [Web Push](/purplemux/tr/docs/web-push/).
- Tablet, dizüstü veya başka bir masaüstünden aynı panele ulaşın — çalışma alanı durumu gerçek zamanlı senkronize olur.

{% call callout('tip', 'Funnel ve Serve') %}
`tailscale serve` purplemux'ı tailnet'inize özel tutar — neredeyse her zaman istediğiniz budur. `tailscale funnel` onu halka açık internete maruz bırakır, ki bu kişisel bir multiplexer için fazla (ve riskli).
{% endcall %}

## Ters proxy yedeği

Tailscale bir seçenek değilse, gerçek bir TLS sertifikalı herhangi bir ters proxy işe yarar. Doğru yapmanız gereken tek şey **WebSocket yükseltmeleri**dir — purplemux onları terminal G/Ç, durum senkronizasyonu ve canlı zaman tüneli için kullanır.

Nginx (eskiz):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy daha basit — `reverse_proxy 127.0.0.1:8022` upgrade başlıklarını otomatik halleder.

`Upgrade` / `Connection` yönlendirme olmadan panel çizilir ama terminaller asla bağlanmaz ve durum takılı kalır. Bir şey yarım çalışıyor gibi geliyorsa, ilk önce o başlıklardan şüphelenin.

## Sorun giderme

- **HTTPS henüz sağlanmadı** — ilk sertifika bir dakika sürebilir. Kısa bir bekleme sonrası `tailscale serve --bg 8022` yeniden çalıştırmak genelde çözer.
- **Tarayıcı sertifika hakkında uyarıyor** — LAN IP'sini değil, tam olarak `<machine>.<tailnet>.ts.net` URL'sine gittiğinizden emin olun.
- **Mobil "ulaşılamıyor" diyor** — telefonun aynı tailnet'e oturum açtığını ve OS ayarlarında Tailscale'in aktif olduğunu doğrulayın.
- **Self-signed sertifikalar** — Web Push kayıt olmaz. Tailscale Serve veya ters proxy üzerinden gerçek bir ACME-yayınlı sertifika kullanın.

## Sıradaki adımlar

- **[PWA kurulumu](/purplemux/tr/docs/pwa-setup/)** — artık HTTPS'iniz olduğuna göre ana ekrana kurun.
- **[Web Push bildirimleri](/purplemux/tr/docs/web-push/)** — arka plan uyarılarını açın.
- **[Güvenlik & kimlik doğrulama](/purplemux/tr/docs/security-auth/)** — parola, hashleme ve tailnet ifşasının ima ettikleri.
