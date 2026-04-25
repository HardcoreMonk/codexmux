---
title: Sorun giderme & SSS
description: Yaygın sorunlar, hızlı yanıtlar ve en sık gelen sorular.
eyebrow: Referans
permalink: /tr/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

Burada bir şey gördüğünüzle eşleşmiyorsa, lütfen platformunuz, tarayıcınız ve `~/.purplemux/logs/` içindeki ilgili log dosyasıyla [bir issue açın](https://github.com/subicura/purplemux/issues).

## Kurulum & başlangıç

### `tmux: command not found`

purplemux host'ta tmux 3.0+ gerektirir. Kurun:

```bash
# macOS (Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

`tmux -V` ile doğrulayın. tmux 2.9+ teknik olarak preflight kontrolünden geçer ama 3.0+ test ettiğimizdir.

### `node: command not found` veya "Node.js 20 or newer"

Node 20 LTS veya daha yenisini kurun. `node -v` ile kontrol edin. macOS yerel uygulaması kendi Node'unu paketler, dolayısıyla bu yalnızca `npx` / `npm install -g` yolları için geçerlidir.

### "purplemux is already running (pid=…, port=…)"

Başka bir purplemux örneği canlı ve `/api/health`'te yanıt veriyor. Onu kullanın (yazdırılan URL'yi açın) veya önce durdurun:

```bash
# bul
ps aux | grep purplemux

# veya kilit dosyasından öldür
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### Eski kilit — başlamayı reddediyor ama hiçbir süreç çalışmıyor

`~/.purplemux/pmux.lock` arkasında kalmıştır. Kaldırın:

```bash
rm ~/.purplemux/pmux.lock
```

purplemux'ı bir kez `sudo` ile çalıştırdıysanız, dosya root'a ait olabilir — bir kez `sudo rm` ile silin.

### `Port 8022 is in use, finding an available port...`

Başka bir süreç `8022`'ye sahip. Sunucu rastgele bir boş porta düşer ve yeni URL'yi yazdırır. Portu kendiniz seçmek için:

```bash
PORT=9000 purplemux
```

`8022`'yi tutanı `lsof -iTCP:8022 -sTCP:LISTEN -n -P` ile bulun.

### Windows'ta çalışıyor mu?

**Resmi olarak hayır.** purplemux, Windows'ta yerel olarak çalışmayan `node-pty` ve tmux'a dayanır. WSL2 genelde çalışır (orada etkin olarak Linux'tasınız) ama test matrisimizin dışındadır.

## Oturumlar & geri yükleme

### Tarayıcıyı kapatmak her şeyi öldürdü

Öldürmemeli — tmux her shell'i sunucuda açık tutar. Bir yenileme sekmeleri geri getirmiyorsa:

1. Sunucunun hâlâ çalıştığını kontrol edin (`http://localhost:8022/api/health`).
2. tmux oturumlarının var olduğunu kontrol edin: `tmux -L purple ls`.
3. `autoResumeOnStartup` sırasındaki hatalar için `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log`'a bakın.

tmux "no server running" diyorsa, host yeniden başlamış veya bir şey tmux'u öldürmüştür. Oturumlar gitti, ama düzen (çalışma alanları, sekmeler, çalışma dizinleri) `~/.purplemux/workspaces/{wsId}/layout.json`'da korunur ve bir sonraki purplemux başlangıcında yeniden başlatılır.

### Bir Claude oturumu sürdürülmüyor

`autoResumeOnStartup` her sekme için kayıtlı `claude --resume <uuid>`'yu yeniden çalıştırır, ama karşılık gelen `~/.claude/projects/.../sessionId.jsonl` artık yoksa (silindi, arşivlendi veya proje taşındı) sürdürme başarısız olur. Sekmeyi açın ve yeni bir konuşma başlatın.

### Sekmelerimin hepsi "unknown" gösteriyor

`unknown`, bir sunucu yeniden başlatması öncesinde bir sekmenin `busy` olduğu ve kurtarmanın hâlâ devam ettiği anlamına gelir. `resolveUnknown` arka planda çalışır ve `idle` (Claude çıktı) veya `ready-for-review` (son asistan mesajı mevcut) olduğunu doğrular. Bir sekme on dakikadan uzun süre `unknown`'da takılı kalırsa, **busy stuck safety net** sessizce `idle`'a çevirir. Tam durum makinesi için [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) sayfasına bakın.

## Tarayıcı & UI

### Web Push bildirimleri asla tetiklenmiyor

Bu kontrol listesini gözden geçirin:

1. **Yalnızca iOS Safari ≥ 16.4.** Daha eski iOS'ta Web Push hiç yok.
2. **iOS'ta PWA olmalı.** Önce **Paylaş → Ana Ekrana Ekle**'ye dokunun; push sıradan bir Safari sekmesinden tetiklenmez.
3. **HTTPS gerekli.** Self-signed sertifikalar çalışmaz — Web Push sessizce kayıt olmayı reddeder. Tailscale Serve (ücretsiz Let's Encrypt) veya Nginx / Caddy arkasında gerçek bir alan adı kullanın.
4. **Bildirim izni verilmiş.** purplemux'ta **Ayarlar → Bildirim → Açık** *ve* tarayıcı seviyesi izin ikisi de izinli olmalı.
5. **Abonelikler var.** `~/.purplemux/push-subscriptions.json` cihaz için bir girişe sahip olmalı. Boşsa, izni yeniden verin.

Tam uyumluluk matrisi için [Tarayıcı desteği](/purplemux/tr/docs/browser-support/) sayfasına bakın.

### iOS Safari 16.4+ ama hâlâ bildirim yok

Bazı iOS sürümleri, uzun PWA-kapalı dönemden sonra aboneliği kaybeder. PWA'yı açın, bildirim iznini reddedin sonra yeniden verin ve `push-subscriptions.json`'u tekrar kontrol edin.

### Safari özel pencere hiçbir şey kalıcılaştırmıyor

IndexedDB, Safari 17+ özel pencerelerinde devre dışıdır, dolayısıyla çalışma alanı önbelleği yeniden başlatmadan sağ çıkmaz. Normal pencere kullanın.

### Mobil terminal arka plana alınınca kayboluyor

iOS Safari, yaklaşık 30 saniye arka planda olduktan sonra WebSocket'i kapatır. tmux gerçek oturumu canlı tutar — sekmeye döndüğünüzde purplemux yeniden bağlanır ve yeniden çizer. Bu iOS, biz değil.

### Firefox + Tailscale serve = sertifika uyarısı

Tailnet'iniz `*.ts.net` olmayan özel bir alan adı kullanıyorsa, Firefox HTTPS güveni konusunda Chrome'dan daha titizdir. Sertifikayı bir kez kabul edin, yapışır.

### "Tarayıcı çok eski" veya özellikler eksik

API başına rapor için **Ayarlar → Tarayıcı kontrolü**'nü çalıştırın. [Tarayıcı desteği](/purplemux/tr/docs/browser-support/) altındaki minimumların altındaki herhangi bir şey özellikleri kibarca kaybeder ama desteklenmez.

## Ağ & uzak erişim

### purplemux'ı internete açabilir miyim?

Açabilirsiniz, ama her zaman HTTPS üzerinden. Önerilen:

1. **Tailscale Serve** — `tailscale serve --bg 8022` size WireGuard şifrelemesi + otomatik sertifikalar verir. Port yönlendirmeye gerek yok.
2. **Ters proxy** — Nginx / Caddy / Traefik. `Upgrade` ve `Connection` başlıklarını yönlendirdiğinizden emin olun, aksi halde WebSocket'ler bozulur.

Açık internet üzerinden düz HTTP kötü bir fikir — auth çerezi HMAC-imzalıdır ama WebSocket yükleri (terminal baytları!) şifrelenmez.

### LAN'imdeki diğer cihazlar purplemux'a ulaşamıyor

Varsayılan olarak purplemux yalnızca localhost'a izin verir. Erişimi env veya uygulama içi ayarlardan açın:

```bash
HOST=lan,localhost purplemux       # LAN dostu
HOST=tailscale,localhost purplemux # tailnet dostu
HOST=all purplemux                 # her şey
```

Veya uygulamada **Ayarlar → Ağ erişimi**, `~/.purplemux/config.json`'a yazar. (`HOST` env üzerinden ayarlandığında o alan kilitlidir.) Anahtar kelime ve CIDR sözdizimi için [Portlar & ortam değişkenleri](/purplemux/tr/docs/ports-env-vars/) sayfasına bakın.

### Ters proxy WebSocket sorunları

`/api/terminal` bağlanır sonra hemen düşerse, proxy `Upgrade` / `Connection` başlıklarını çıkarıyordur. Asgari Nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy: WebSocket yönlendirme varsayılandır; sadece `reverse_proxy 127.0.0.1:8022`.

## Veri & saklama

### Verim nerede?

Her şey yerel olarak `~/.purplemux/` altında. Hiçbir şey makinenizden çıkmaz. Login parolası `config.json` içinde bir scrypt hash'i. Tam düzen için [Veri dizini](/purplemux/tr/docs/data-directory/) sayfasına bakın.

### Parolamı unuttum

`~/.purplemux/config.json`'u silin ve yeniden başlatın. Onboarding baştan başlar. Çalışma alanları, düzenler ve geçmiş tutulur (ayrı dosyalardır).

### Sekme göstergesi sürekli "busy"de takılı

`busy stuck safety net`, Claude süreci ölmüşse on dakika sonra bir sekmeyi sessizce `idle`'a çevirir. Beklemek istemezseniz, sekmeyi kapatıp yeniden açın — bu yerel durumu sıfırlar ve bir sonraki hook olayı temiz bir sayfadan devam eder. Kök neden incelemesi için `LOG_LEVELS=hooks=debug,status=debug` ile çalıştırın.

### Mevcut tmux yapılandırmamla çakışıyor mu?

Hayır. purplemux kendi yapılandırmasıyla (`src/config/tmux.conf`) özel bir sokette (`-L purple`) yalıtılmış bir tmux çalıştırır. Sizin `~/.tmux.conf`'unuza ve mevcut tmux oturumlarınıza dokunulmaz.

## Maliyet & kullanım

### purplemux bana para tasarrufu sağlar mı?

Doğrudan değil. Yaptığı şey **kullanımı şeffaf yapmak**: bugün / ay / proje başına maliyet, model başına token dağılımları ve 5h / 7d kota sayaçları hep tek ekranda, böylece duvara çarpmadan kendinizi ayarlayabilirsiniz.

### purplemux kendisi ücretli mi?

Hayır. purplemux MIT lisanslı açık kaynaktır. Claude Code kullanımı Anthropic tarafından ayrıca faturalandırılır.

### Verim bir yere gönderiliyor mu?

Hayır. purplemux tamamen kendi-host'lanır. Yaptığı tek ağ çağrıları yerel Claude CLI'nızadır (kendi başına Anthropic ile konuşur) ve açılışta `update-notifier` ile sürüm kontrolüdür. `NO_UPDATE_NOTIFIER=1` ile sürüm kontrolünü devre dışı bırakın.

## Sıradaki adımlar

- **[Tarayıcı desteği](/purplemux/tr/docs/browser-support/)** — ayrıntılı uyumluluk matrisi ve bilinen tarayıcı tuhaflıkları.
- **[Veri dizini](/purplemux/tr/docs/data-directory/)** — her dosyanın ne yaptığı ve neyi silmek güvenli.
- **[Mimari](/purplemux/tr/docs/architecture/)** — derinlere inilmesi gereken bir şey olduğunda parçaların nasıl bir araya geldiği.
