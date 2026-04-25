---
title: Oturum durumu
description: purplemux'ın Claude Code etkinliğini dört durumlu bir rozete nasıl çevirdiği — ve neredeyse anlık güncellenmesinin nedeni.
eyebrow: Claude Code
permalink: /tr/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

Kenar çubuğundaki her oturum, Claude'un ne yaptığını bir bakışta söyleyen renkli bir nokta taşır. Bu sayfa, o dört durumun nereden geldiğini ve siz terminale uzanmadan nasıl senkronize kaldığını anlatır.

## Dört durum

| Durum | Gösterge | Anlamı |
|---|---|---|
| **Boşta** | yok / gri | Claude bir sonraki prompt'unuzu bekliyor. |
| **Meşgul** | mor spinner | Claude işliyor — okuyor, düzenliyor, araç çalıştırıyor. |
| **Girdi gerekiyor** | sarı nabız | Bir izin istemi veya soru sizi bekliyor. |
| **İnceleme** | mor nabız | Claude bitirdi, kontrol etmeniz gereken bir şey var. |

Beşinci bir değer, **bilinmiyor**, sunucu yeniden başlatıldığında `busy` olan sekmeler için kısaca görünür. purplemux oturumu yeniden doğrulayabildiğinde kendiliğinden çözülür.

## Doğruluk kaynağı hook'lardır

purplemux, `~/.purplemux/hooks.json`'a bir Claude Code hook yapılandırması ve `~/.purplemux/status-hook.sh`'a küçük bir shell betiği kurar. Betik beş Claude Code hook olayına kayıtlıdır ve her birini bir CLI tokenıyla yerel sunucuya POST eder:

| Claude Code hook | Sonuç durum |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification` (yalnızca permission) | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | sıkıştırma göstergesini gösterir (durum değişmez) |

Hook'lar Claude Code geçiş yaptığı anda tetiklendiği için, kenar çubuğu siz terminalde fark etmeden önce güncellenir.

{% call callout('note', 'Yalnızca izin bildirimleri') %}
Claude'un `Notification` hook'u birkaç nedenle tetiklenir. purplemux yalnızca bildirim `permission_prompt` veya `worker_permission_prompt` olduğunda **needs-input**'a geçer. Boşta dürtmeleri ve diğer bildirim türleri rozeti tetiklemez.
{% endcall %}

## Süreç tespiti paralel çalışır

Claude CLI'nin gerçekte çalışıp çalışmadığı, iş durumundan ayrı izlenir. İki yol işbirliği yapar:

- **tmux başlık değişiklikleri** — her panel başlık olarak `pane_current_command|pane_current_path` raporlar. xterm.js değişikliği `onTitleChange` ile teslim eder ve purplemux doğrulamak için `/api/check-claude`'i pingler.
- **Süreç ağacı yürüyüşü** — sunucu tarafında, `detectActiveSession` panelin shell PID'sine bakar, çocuklarını gezer ve Claude'un `~/.claude/sessions/` altında yazdığı PID dosyalarına eşleştirir.

Dizin yoksa arayüz, durum noktası yerine "Claude yüklü değil" ekranı gösterir.

## JSONL izleyicisi boşlukları doldurur

Claude Code, her oturum için `~/.claude/projects/` altına bir transkript JSONL'si yazar. Bir sekme `busy`, `needs-input`, `unknown` veya `ready-for-review` iken purplemux iki nedenle o dosyayı `fs.watch` ile izler:

- **Metadata** — geçerli araç, son asistan parçacığı, token sayıları. Bunlar zaman tüneline ve kenar çubuğuna durumu değiştirmeden akar.
- **Sentetik kesinti** — siz akış ortasında Esc'ye bastığınızda Claude JSONL'ye `[Request interrupted by user]` yazar ama hook tetiklemez. İzleyici o satırı tespit eder ve bir `interrupt` olayı sentezler, böylece sekme `busy`'de takılı kalmak yerine `idle`'a döner.

## Polling motor değil, güvenlik ağıdır

Sekme sayısına bağlı olarak her 30–60 saniyede bir bir metadata yoklaması çalışır. Durumu **karar vermez** — bu kesinlikle hook yolunun işidir. Yoklama şu nedenle var:

- Yeni tmux panellerini keşfetmek
- 10 dakikadan uzun süredir busy olan ölü Claude süreçli oturumları kurtarmak
- Süreç bilgisini, portları ve başlıkları yenilemek

Bu, açılış sayfasında bahsedilen "5–15 sn yedek polling"in, hook'lar güvenilir kanıtlandığında yavaşlatılıp daraltılmış halidir.

## Sunucu yeniden başlatmasından sağ çıkmak

purplemux çalışmıyorken hook'lar tetiklenemez, dolayısıyla süreç içindeki herhangi bir durum eski hale gelebilir. Kurtarma kuralı muhafazakardır:

- Kalıcılaştırılmış `busy`, `unknown` olur ve yeniden kontrol edilir: Claude artık çalışmıyorsa sekme sessizce idle'a döner; JSONL temiz biter ise review olur.
- Diğer her durum — `idle`, `needs-input`, `ready-for-review` — top sizin sahanızda olduğu için dokunulmadan kalır.

Kurtarma sırasında otomatik durum değişiklikleri push bildirim göndermez. Yalnızca *yeni* iş needs-input veya review'e geçtiğinde uyarılırsınız.

## Durumun göründüğü yerler

- Kenar çubuğu oturum satırı noktası
- Her panelde sekme çubuğu noktası
- Çalışma alanı noktası (çalışma alanı genelinde en yüksek öncelikli durum)
- Çan simgesi sayıları ve bildirim sayfası
- Tarayıcı sekme başlığı (dikkat öğelerini sayar)
- `needs-input` ve `ready-for-review` için Web Push ve masaüstü bildirimleri

## Sıradaki adımlar

- **[İzin istemleri](/purplemux/tr/docs/permission-prompts/)** — **needs-input** durumunun arkasındaki iş akışı.
- **[Canlı oturum görünümü](/purplemux/tr/docs/live-session-view/)** — bir sekme `busy` olduğunda zaman tünelinin neyi gösterdiği.
- **[İlk oturum](/purplemux/tr/docs/first-session/)** — bağlam içinde panel turu.
