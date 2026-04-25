---
title: Portlar & ortam değişkenleri
description: purplemux'ın açtığı her port ve nasıl çalıştığını etkileyen her ortam değişkeni.
eyebrow: Referans
permalink: /tr/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux tek satırlık bir kurulum olmak üzere tasarlandı, ama çalışma zamanı yapılandırılabilir. Bu sayfa açtığı her portu ve sunucunun okuduğu her ortam değişkenini listeler.

## Portlar

| Port | Varsayılan | Geçersiz kılma | Notlar |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | `8022` zaten kullanımdaysa sunucu uyarı loglar ve rastgele boş bir porta bağlanır. |
| Dahili Next.js (production) | rastgele | — | `pnpm start` / `purplemux start`'ta dış sunucu, `127.0.0.1:<random>`'a bağlı bir Next.js standalone'a proxy yapar. Açık değildir. |

`8022`, `web` + `ssh` birlikte yapıştırılmıştır. Seçim mizahtır, protokol değil.

{% call callout('note', 'Bağlanan arayüz erişim politikasını takip eder') %}
purplemux yalnızca erişim politikası gerçekten dış istemcilere izin veriyorsa `0.0.0.0`'a bağlanır. Yalnızca-localhost kurulumları `127.0.0.1`'a bağlanır, böylece LAN'daki diğer makineler bir TCP bağlantısı bile açamaz. Aşağıdaki `HOST`'a bakın.
{% endcall %}

## Sunucu ortam değişkenleri

`server.ts` ve başlangıçta yüklediği modüller tarafından okunur.

| Değişken | Varsayılan | Etki |
|---|---|---|
| `PORT` | `8022` | HTTP/WS dinleme portu. `EADDRINUSE`'de rastgele porta düşer. |
| `HOST` | ayarlanmamış | İzin verilen istemciler için virgülle ayrılmış CIDR/anahtar kelime spesifikasyonu. Anahtar kelimeler: `localhost`, `tailscale`, `lan`, `all` (veya `*` / `0.0.0.0`). Örnekler: `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. Env üzerinden ayarlandığında, uygulama içi **Ayarlar → Ağ erişimi** kilitlenir. |
| `NODE_ENV` | `production` (`purplemux start`'ta), `development` (`pnpm dev`'de) | Dev pipeline (`tsx watch`, Next dev) ve prod pipeline (Next standalone'a proxy yapan `tsup` paketi) arasında seçim yapar. |
| `__PMUX_APP_DIR` | `process.cwd()` | `dist/server.js` ve `.next/standalone/`'i tutan dizini geçersiz kılar. `bin/purplemux.js` tarafından otomatik ayarlanır; genellikle dokunmamalısınız. |
| `__PMUX_APP_DIR_UNPACKED` | ayarlanmamış | macOS Electron uygulaması içindeki asar-unpacked yolu için `__PMUX_APP_DIR` varyantı. |
| `__PMUX_ELECTRON` | ayarlanmamış | Electron ana süreci sunucuyu süreç-içinde başlattığında bunu ayarlar, böylece `server.ts` otomatik `start()` çağrısını atlar ve Electron yaşam döngüsünü sürmesine izin verir. |
| `PURPLEMUX_CLI` | `1` (`bin/purplemux.js` tarafından ayarlanır) | Paylaşılan modüllerin sürecin Electron değil, CLI / sunucu olduğunu bilmesini sağlayan işaretleyici. `pristine-env.ts` tarafından kullanılır. |
| `__PMUX_PRISTINE_ENV` | ayarlanmamış | `bin/purplemux.js` tarafından yakalanan üst shell env'inin JSON anlık görüntüsü, böylece çocuk süreçler (claude, tmux) sanitize edilmiş bir yerine kullanıcının `PATH`'ini miras alır. Dahili — otomatik ayarlanır. |
| `AUTH_PASSWORD` | ayarlanmamış | Next başlamadan önce sunucu tarafından `config.json`'un scrypt hash'inden ayarlanır. NextAuth onu oradan okur. Manuel ayarlamayın. |
| `NEXTAUTH_SECRET` | ayarlanmamış | Aynı hikaye — başlangıçta `config.json`'dan doldurulur. |

## Loglama ortam değişkenleri

`src/lib/logger.ts` tarafından okunur.

| Değişken | Varsayılan | Etki |
|---|---|---|
| `LOG_LEVEL` | `info` | `LOG_LEVELS`'ta adlandırılmamış her şey için kök seviye. |
| `LOG_LEVELS` | ayarlanmamış | `name=level` çiftleri olarak modül başına geçersiz kılma, virgülle ayrılmış. |

Seviyeler, sırasıyla: `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux

# yalnızca Claude hook modülünü debug et
LOG_LEVELS=hooks=debug purplemux

# birden çok modülü aynı anda
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

En yararlı modül adları:

| Modül | Kaynak | Göreceğiniz |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, `status-manager.ts`'in parçaları | Hook alma / işleme / durum geçişleri |
| `status` | `status-manager.ts` | Polling, JSONL izleyici, yayın |
| `tmux` | `lib/tmux.ts` | Her tmux komutu ve sonucu |
| `server`, `lock`, vb. | eşleşen `lib/*.ts` | Süreç yaşam döngüsü |

Log dosyaları seviyeye bakılmaksızın `~/.purplemux/logs/` altına iner.

## Dosyalar (env eşdeğeri)

Birkaç değer ortam değişkenleri gibi davranır ama bir env el sıkışması olmadan CLI ve hook betiklerinin onları bulabilmesi için diskte yaşar:

| Dosya | Tuttuğu | Kullanan |
|---|---|---|
| `~/.purplemux/port` | Geçerli sunucu portu (düz metin) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | 32-baytlık hex CLI tokeni | `bin/cli.js`, hook betikleri (`x-pmux-token` olarak gönderilir) |

CLI bunları env üzerinden de kabul eder, env öncelikli olur:

| Değişken | Varsayılan | Etki |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port`'un içeriği | CLI'nın konuştuğu port. |
| `PMUX_TOKEN` | `~/.purplemux/cli-token`'ın içeriği | `x-pmux-token` olarak gönderilen Bearer token. |

Tam yüzey için [CLI referansı](/purplemux/tr/docs/cli-reference/) sayfasına bakın.

## Birlikte koymak

Birkaç yaygın kombinasyon:

```bash
# Varsayılan: yalnızca localhost, port 8022
purplemux

# Her yere bağla (LAN + Tailscale + uzak)
HOST=all purplemux

# Yalnızca localhost + Tailscale
HOST=localhost,tailscale purplemux

# Özel port + ayrıntılı hook izleme
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# Hata ayıklama için her şey
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
Kalıcı bir kurulum için bunları launchd / systemd biriminizin `Environment=` bloğuna koyun. Örnek bir birim dosyası için [Kurulum](/purplemux/tr/docs/installation/#açilişta-başlatma) sayfasına bakın.
{% endcall %}

## Sıradaki adımlar

- **[Kurulum](/purplemux/tr/docs/installation/)** — bu değişkenlerin genellikle gittiği yer.
- **[Veri dizini](/purplemux/tr/docs/data-directory/)** — `port` ve `cli-token`'ın hook betikleriyle nasıl etkileşimde bulunduğu.
- **[CLI referansı](/purplemux/tr/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` bağlam içinde.
