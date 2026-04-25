---
title: Güvenlik & kimlik doğrulama
description: purplemux'ın panelinizi nasıl koruduğu — scrypt-hashlenmiş parola, yalnızca yerel veri ve dış erişim için HTTPS.
eyebrow: Mobil & Uzaktan
permalink: /tr/docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux kendi-host'lanır ve makinenizde kalır. Dış sunucu yok, telemetri yok ve bulut hesabı yok. Aşağıdaki her şey, panelinizi gerçekte koruyan birkaç parçayı tarif eder.

## Parola kurulumu

purplemux'ı ilk kez açtığınızda, onboarding ekranı bir parola seçmenizi ister. Gönderdikten sonra:

- Parola **scrypt** ile hashlenir (rastgele 16-baytlık tuz, 64-baytlık türetilmiş anahtar).
- Hash, `~/.purplemux/config.json`'a `scrypt:{salt}:{hash}` olarak yazılır — düz metin asla saklanmaz.
- Ayrı bir `authSecret` (rastgele hex) üretilir ve yanına saklanır. purplemux, oturum açıldıktan sonra verilen oturum çerezini imzalamak için onu kullanır.

Sonraki ziyaretler bir oturum açma ekranı gösterir; saklanan hash'e karşı parolanızı `crypto.timingSafeEqual` ile doğrular.

{% call callout('note', 'Parola uzunluğu') %}
Asgari kısadır (4 karakter), böylece yalnızca-localhost kurulumları rahatsız edici olmasın. purplemux'ı bir tailnet'e — ya da başka bir yere — açıyorsanız daha güçlü bir şey seçin. Başarısız oturum açmalar süreç başına 15 dakikada 16 deneme ile sınırlandırılır.
{% endcall %}

## Parolayı sıfırlama

Unuttunuz mu? Yalnızca host'a shell erişiminiz olması yeterli:

```bash
rm ~/.purplemux/config.json
```

purplemux'ı yeniden başlatın (`pnpm start`, `npx purplemux` veya nasıl başlattıysanız) — onboarding ekranı yeniden gelir, böylece yeni bir parola seçebilirsiniz.

Bu, aynı dosyada saklanan diğer ayarları (tema, yerel, font boyutu, bildirim anahtarı, vb.) da siler. Çalışma alanlarınız ve sekmeleriniz `workspaces.json` ve `workspaces/` dizininde yaşar, dolayısıyla düzenler etkilenmez.

## Dış erişim için HTTPS

Varsayılan bağlama `localhost`'tur ve düz HTTP üzerinden sunulur. Aynı makinede iyidir — ama purplemux'a başka bir cihazdan ulaştığınız anda HTTPS'te olmalısınız.

- **Tailscale Serve** önerilen yoldur: WireGuard şifrelemesi artı otomatik Let's Encrypt sertifikaları. [Tailscale erişimi](/purplemux/tr/docs/tailscale/) sayfasına bakın.
- **Ters proxy** (Nginx, Caddy, vb.) de işe yarar, yeter ki WebSocket `Upgrade` ve `Connection` başlıklarını yönlendirin.

iOS Safari ayrıca PWA kurulumu ve Web Push kaydı için HTTPS gerektirir. [PWA kurulumu](/purplemux/tr/docs/pwa-setup/) ve [Web Push](/purplemux/tr/docs/web-push/) sayfalarına bakın.

## `~/.purplemux/` içinde ne yaşar

Her şey yereldir. Hassas dosyalardaki izinler `0600`'dır.

| Dosya | İçerdiği |
|---|---|
| `config.json` | scrypt parola hash'i, oturum gizli anahtarı, uygulama tercihleri |
| `workspaces.json` + `workspaces/` | çalışma alanı listesi ve çalışma alanı başına panel/sekme düzenleri |
| `vapid-keys.json` | Web Push VAPID anahtar çifti (otomatik üretilir) |
| `push-subscriptions.json` | cihaz başına push abonelikleri |
| `cli-token` | hook'lar/CLI'nın yerel sunucuyla konuşması için paylaşılan token |
| `pmux.lock` | tek-örnek kilidi (`pid`, `port`, `startedAt`) |
| `logs/` | döner pino log dosyaları |

Tam envanter ve sıfırlama tablosu için repodaki [docs/DATA-DIR.md](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) doğruluk kaynağı listelemesine bakın.

## Telemetri yok

purplemux kendi başına dışarı istek yapmaz. Yaptığı tek ağ çağrısı şunlardır:

- Abone olduğunuz Web Push bildirimleri, OS push servisleri üzerinden gönderilir.
- Claude CLI'nin kendi yaptığı her şey — bu sizin ve Anthropic arasındadır, purplemux değil.

Kod ve oturum verileri makinenizden asla çıkmaz.

## Sıradaki adımlar

- **[Tailscale erişimi](/purplemux/tr/docs/tailscale/)** — dış HTTPS'e güvenli yol.
- **[PWA kurulumu](/purplemux/tr/docs/pwa-setup/)** — kimlik doğrulama hallolduğunda ana ekrana kurun.
- **[Web Push bildirimleri](/purplemux/tr/docs/web-push/)** — arka plan uyarıları.
