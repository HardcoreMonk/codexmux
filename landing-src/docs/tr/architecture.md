---
title: Mimari
description: Tarayıcı, Node.js sunucusu, tmux ve Claude CLI'nin nasıl bir araya geldiği.
eyebrow: Referans
permalink: /tr/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux birbirine dikilmiş üç katmandır: bir tarayıcı ön ucu, `:8022`'de bir Node.js sunucusu ve host üzerindeki tmux + Claude CLI. Aralarındaki her şey ya bir ikili WebSocket ya da küçük bir HTTP POST'tur.

## Üç katman

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

Her WebSocket'in tek bir amacı vardır; multiplex yapmazlar. Kimlik doğrulama, WS yükseltmesi sırasında doğrulanan bir NextAuth JWT çerezidir.

## Tarayıcı

Ön uç bir Next.js (Pages Router) uygulamasıdır. Sunucuyla konuşan parçalar:

| Bileşen | Kütüphane | Amaç |
|---|---|---|
| Terminal paneli | `xterm.js` | `/api/terminal`'den gelen baytları çizer. Tuş vuruşlarını, yeniden boyutlandırma olaylarını, başlık değişikliklerini (`onTitleChange`) yayar. |
| Oturum zaman tüneli | React + `useTimeline` | `/api/timeline`'dan Claude turlarını çizer. `cliState` türetimi yok — hepsi sunucu tarafı. |
| Durum göstergeleri | Zustand `useTabStore` | `/api/status` mesajlarıyla sürülen sekme rozetleri, kenar çubuğu noktaları, bildirim sayıları. |
| Çoklu cihaz senkronizasyonu | `useSyncClient` | Başka bir cihazda yapılan çalışma alanı / düzen düzenlemelerini `/api/sync` üzerinden izler. |

Sekme başlıkları ve ön plan süreci, xterm.js'in `onTitleChange` olayından gelir — tmux her iki saniyede bir `#{pane_current_command}|#{pane_current_path}` yaymak üzere yapılandırılmıştır (`src/config/tmux.conf`) ve `lib/tab-title.ts` onu ayrıştırır.

## Node.js sunucu

`server.ts`, Next.js artı aynı portta dört `ws` `WebSocketServer` örneği barındıran özel bir HTTP sunucusudur.

### WebSocket uç noktaları

| Yol | Handler | Yön | Kullanım |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | çift yönlü, ikili | Bir tmux oturumuna bağlı `node-pty` üzerinden terminal G/Ç |
| `/api/timeline` | `timeline-server.ts` | sunucu → istemci | JSONL'den ayrıştırılan Claude oturum girişlerini akıtır |
| `/api/status` | `status-server.ts` | çift yönlü, JSON | Sunucudan `status:sync` / `status:update` / `status:hook-event`, istemciden `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` |
| `/api/sync` | `sync-server.ts` | çift yönlü, JSON | Çapraz cihaz çalışma alanı durumu |

Ayrıca ilk-çalıştırma kurulumcusu için `/api/install` (auth gerekmez).

### Terminal ikili protokolü

`/api/terminal`, `src/lib/terminal-protocol.ts`'de tanımlanan küçük bir ikili protokol kullanır:

| Kod | Ad | Yön | Yük |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | istemci → sunucu | Tuş baytları |
| `0x01` | `MSG_STDOUT` | sunucu → istemci | Terminal çıktısı |
| `0x02` | `MSG_RESIZE` | istemci → sunucu | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | her ikisi | 30 sn aralık, 90 sn timeout |
| `0x04` | `MSG_KILL_SESSION` | istemci → sunucu | Alttaki tmux oturumunu sonlandır |
| `0x05` | `MSG_WEB_STDIN` | istemci → sunucu | Web girdi çubuğu metni (kopya modundan çıkıştan sonra teslim edilir) |

Geri basınç: WS `bufferedAmount > 1 MB` olduğunda `pty.pause`, `256 KB` altında devam et. Sunucu başına en fazla 32 eşzamanlı bağlantı, sonrasında en eskisi düşürülür.

### Status manager

`src/lib/status-manager.ts`, `cliState` için tek doğruluk kaynağıdır. Hook olayları `/api/status/hook` (token-doğrulanmış POST) üzerinden akar, sıralanır (sekme başına `eventSeq`) ve `deriveStateFromEvent` tarafından `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` durumlarına indirgenir. JSONL izleyici, tek bir sentetik `interrupt` olayı dışında yalnızca metadata günceller.

Tam durum makinesi için [Oturum durumu (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) sayfasına bakın.

## tmux katmanı

purplemux, kendi yapılandırmasını `src/config/tmux.conf`'ta kullanan özel bir sokette (`-L purple`) yalıtılmış bir tmux çalıştırır. Sizin `~/.tmux.conf`'unuz hiç okunmaz.

Oturumlar `pt-{workspaceId}-{paneId}-{tabId}` olarak adlandırılır. Tarayıcıdaki bir terminal paneli, `node-pty` ile bağlanan bir tmux oturumuna eşlenir.

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← tarayıcı sekmesi 1
├── pt-ws-MMKl07-pa-1-tb-2   ← tarayıcı sekmesi 2
└── pt-ws-MMKl07-pa-2-tb-1   ← bölünmüş panel, sekme 1
```

`prefix` devre dışıdır, durum çubuğu kapalıdır (kromu xterm.js çizer), `set-titles` açıktır ve `mouse on` tekerleği copy-mode'a koyar. tmux, oturumların kapalı bir tarayıcı, Wi-Fi düşmesi veya sunucu yeniden başlatmasından sağ çıkmasının sebebidir.

Tam tmux kurulumu, komut sarmalayıcı ve süreç tespit detayları için [tmux & süreç tespiti (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) sayfasına bakın.

## Claude CLI entegrasyonu

purplemux Claude'u fork etmez veya sarmalamaz — `claude` ikili dosyası kurduğunuz her ne ise odur. İki şey eklenir:

1. **Hook ayarları** — Başlangıçta `ensureHookSettings()` `~/.purplemux/hooks.json`, `status-hook.sh` ve `statusline.sh`'i yazar. Her Claude sekmesi `--settings ~/.purplemux/hooks.json` ile başlar, böylece `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact` hepsi sunucuya geri POST eder.
2. **JSONL okumaları** — `~/.claude/projects/**/*.jsonl`, canlı konuşma görünümü için `timeline-server.ts` tarafından ayrıştırılır ve `~/.claude/sessions/`'taki PID dosyaları aracılığıyla çalışan bir Claude sürecini tespit etmek için `session-detection.ts` tarafından izlenir.

Hook betikleri `~/.purplemux/port` ve `~/.purplemux/cli-token`'ı okur ve `x-pmux-token` ile POST eder. Sunucu kapalıysa sessizce başarısız olurlar, böylece Claude çalışırken purplemux'ı kapatmak hiçbir şeyi çökertmez.

## Başlangıç sırası

`server.ts:start()` bunları sırayla çalıştırır:

1. `acquireLock(port)` — `~/.purplemux/pmux.lock` üzerinden tek-örnek koruyucu
2. `initConfigStore()` + `initShellPath()` (kullanıcının login shell `PATH`'ini çözer)
3. `initAuthCredentials()` — scrypt-hashlı parolayı ve HMAC gizliliğini env'e yükler
4. `scanSessions()` + `applyConfig()` — ölü tmux oturumlarını temizler, `tmux.conf`'u uygular
5. `initWorkspaceStore()` — `workspaces.json` ve çalışma alanı başına `layout.json`'ı yükler
6. `autoResumeOnStartup()` — kayıtlı dizinlerde shell'leri yeniden başlatır, Claude resume'u dener
7. `getStatusManager().init()` — metadata yoklamasını başlatır
8. `app.prepare()` (Next.js dev) veya `require('.next/standalone/server.js')` (prod)
9. `bindPlan.host:port` üzerinde `listenWithFallback()` (erişim politikasına göre `0.0.0.0` veya `127.0.0.1`)
10. `ensureHookSettings(result.port)` — gerçek port ile hook betiklerini yazar veya yeniler
11. `getCliToken()` — `~/.purplemux/cli-token`'ı okur veya üretir
12. `writeAllClaudePromptFiles()` — her çalışma alanının `claude-prompt.md`'sini yeniler

Port çözümü ile adım 10 arasındaki pencere, hook betiklerinin her başlangıçta yeniden üretilmesinin nedenidir: canlı portun pişmiş olması gerekir.

## Custom server ile Next.js modül grafiği

{% call callout('warning', 'Tek süreçte iki modül grafiği') %}
Dış custom server (`server.ts`) ve Next.js (sayfalar + API rotaları) bir Node sürecini paylaşır ama modül grafiklerini **paylaşmaz**. Her iki taraftan içe aktarılan `src/lib/*` altındaki herhangi bir şey iki kez örneklenir. Paylaşılması gereken singletonlar (StatusManager, WebSocket istemci kümeleri, CLI tokeni, dosya yazma kilitleri) `globalThis.__pt*` anahtarlarına asılır. Tam gerekçe için `CLAUDE.md §18`'a bakın.
{% endcall %}

## Daha fazla okuma

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — tmux yapılandırma, komut sarmalayıcı, süreç ağacı yürüme, terminal ikili protokol.
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — Claude CLI durum makinesi, hook akışı, sentetik kesinti olayı, JSONL izleyici.
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — purplemux'ın yazdığı her dosya.

## Sıradaki adımlar

- **[Veri dizini](/purplemux/tr/docs/data-directory/)** — yukarıdaki mimarinin dokunduğu her dosya.
- **[CLI referansı](/purplemux/tr/docs/cli-reference/)** — sunucuyla tarayıcı dışından konuşmak.
- **[Sorun giderme](/purplemux/tr/docs/troubleshooting/)** — buradaki bir şey kötü davrandığında teşhis.
