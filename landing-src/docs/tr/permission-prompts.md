---
title: İzin istemleri
description: purplemux'ın Claude Code'un "bunu çalıştırabilir miyim?" diyaloglarını nasıl yakaladığı ve panelden, klavyeden veya telefonunuzdan onaylamanıza nasıl izin verdiği.
eyebrow: Claude Code
permalink: /tr/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code varsayılan olarak izin diyaloglarında bloklanır — araç çağrıları, dosya yazımları ve benzerleri için. purplemux bu diyalogları belirdiği anda yakalar ve yakınınızda olan her cihaza yönlendirir.

## Neler yakalanır

Claude Code `Notification` hook'unu birkaç nedenle tetikler. purplemux yalnızca iki bildirim türünü izin istemleri olarak kabul eder:

- `permission_prompt` — standart "Bu aracın çalışmasına izin verilsin mi?" diyaloğu
- `worker_permission_prompt` — alt-ajandan gelen aynı şey

Diğer her şey (boşta hatırlatmalar vb.) durum tarafında yok sayılır ve sekmeyi **needs-input**'a çevirmez veya push göndermez.

## Biri tetiklendiğinde ne olur

1. Claude Code bir `Notification` hook'u yayar. `~/.purplemux/status-hook.sh` shell betiği olayı ve bildirim türünü yerel sunucuya POST eder.
2. Sunucu sekmenin durumunu **needs-input**'a (sarı nabız) çevirir ve değişikliği durum WebSocket'i üzerinden yayınlar.
3. Panel istemi **zaman tünelinde satır içi** çizer — modal yok, bağlam değişimi yok — Claude'un sunduğu aynı seçeneklerle.
4. Bildirim izni verilmişse, `needs-input` için bir Web Push ve / veya masaüstü bildirimi tetiklenir.

Claude CLI'nin kendisi hâlâ stdin'de bekliyor. purplemux istemin seçeneklerini tmux'tan okuyor ve bir tanesini seçtiğinizde seçiminizi geri yönlendiriyor.

## Nasıl yanıtlanır

Üç eşdeğer yol:

- Zaman tünelinde seçeneğe **tıklayın**.
- **Sayıya basın** — <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> — seçenek dizinine eşleşen.
- Telefonunuzda **push'a dokunun**, doğrudan isteme derin bağlanır; oradan seçin.

Seçtiğinizde purplemux girdiyi tmux'a gönderir, sekme **busy**'ye geri döner ve Claude akışın ortasından devam eder. Başka bir şey onaylamanıza gerek yoktur — tıklama *zaten* onaydır.

{% call callout('tip', 'Ardışık istemler otomatik yeniden alınır') %}
Claude art arda birkaç soru sorarsa, satır içi istem bir sonraki `Notification` geldiğinde yeni seçeneklerle yeniden çizilir. Bir öncekini kapatmanıza gerek yok.
{% endcall %}

## Mobil akış

PWA kurulu ve bildirimler izinliyken, tarayıcı sekmesi açık, arka planda veya kapalıyken Web Push tetiklenir:

- Bildirim "Girdi Gerekiyor" yazar ve oturumu tanımlar.
- Dokunmak purplemux'ı o sekmeye odaklanmış olarak açar.
- Satır içi istem zaten çizilmiş; tek dokunuşla seçenek seçin.

Bu, [Tailscale + PWA](/purplemux/tr/docs/quickstart/#telefonunuzdan-erisin) kurmanın temel nedenidir — onayların masanızdan ayrılırken sizi takip etmesini sağlar.

## Seçenekler ayrıştırılamadığında

Nadir durumlarda (purplemux okumadan önce tmux kaydırma tamponundan kaymış bir istem), seçenek listesi boş gelir. Zaman tüneli "istem okunamadı" kartı gösterir ve geri çekilmeyle dört kez yeniden dener. Yine başarısız olursa, o sekme için **Terminal** moduna geçin ve ham CLI'de yanıtlayın — temel Claude süreci hâlâ bekliyor.

## Boşta dürtmeler ne olacak?

Claude'un diğer bildirim türleri — örneğin boşta hatırlatmaları — yine hook uç noktasına gelir. Sunucu onları loglar ama sekme durumunu değiştirmez, push göndermez veya bir UI istemi yüzeye çıkarmaz. Bu kasıtlıdır: yalnızca Claude'u *bloklayan* olaylar dikkatinizi gerektirir.

## Sıradaki adımlar

- **[Oturum durumu](/purplemux/tr/docs/session-status/)** — **needs-input** durumunun anlamı ve nasıl tespit edildiği.
- **[Canlı oturum görünümü](/purplemux/tr/docs/live-session-view/)** — satır içi istemin çizildiği yer.
- **[Tarayıcı desteği](/purplemux/tr/docs/browser-support/)** — Web Push gereksinimleri (özellikle iOS Safari 16.4+).
