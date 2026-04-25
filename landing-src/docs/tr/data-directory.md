---
title: Veri dizini
description: ~/.purplemux/ altında ne yaşar, neyi silmek güvenli ve nasıl yedeklenir.
eyebrow: Referans
permalink: /tr/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux'ın tuttuğu her kalıcı durum parçası — ayarlar, düzenler, oturum geçmişi, önbellekler — `~/.purplemux/` altında yaşar. Başka hiçbir yerde değil. `localStorage` yok, sistem keychain'i yok, dış servis yok.

## Bir bakışta düzen

```
~/.purplemux/
├── config.json              # uygulama yapılandırması (auth, tema, yerel, …)
├── workspaces.json          # çalışma alanı listesi + kenar çubuğu durumu
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # panel/sekme ağacı
│       ├── message-history.json  # çalışma alanı başına girdi geçmişi
│       └── claude-prompt.md      # --append-system-prompt-file içeriği
├── hooks.json               # Claude Code hook + statusline yapılandırması (üretilir)
├── status-hook.sh           # hook betiği (üretilir, 0755)
├── statusline.sh            # statusline betiği (üretilir, 0755)
├── rate-limits.json         # son statusline JSON
├── session-history.json     # tamamlanan Claude oturum logu (çapraz çalışma alanı)
├── quick-prompts.json       # özel hızlı promptlar + devre dışı yerleşikler
├── sidebar-items.json       # özel kenar çubuğu öğeleri + devre dışı yerleşikler
├── vapid-keys.json          # Web Push VAPID anahtar çifti (üretilir)
├── push-subscriptions.json  # Web Push uç noktası abonelikleri
├── cli-token                # CLI auth token'ı (üretilir)
├── port                     # geçerli sunucu portu
├── pmux.lock                # tek-örnek kilidi {pid, port, startedAt}
├── logs/                    # pino-roll log dosyaları
├── uploads/                 # sohbet girdi çubuğu üzerinden eklenen görüntüler
└── stats/                   # Claude kullanım istatistikleri önbelleği
```

Sırlar içeren dosyalar (config, tokenler, düzenler, VAPID anahtarları, kilit) `tmpFile → rename` deseniyle `0600` modunda yazılır.

## Üst seviye dosyalar

| Dosya | Sakladığı | Silmek güvenli mi? |
|---|---|---|
| `config.json` | scrypt-hashlı login parolası, HMAC oturum gizliliği, tema, yerel, font boyutu, bildirim anahtarı, editör URL'si, ağ erişimi, özel CSS | Evet — onboarding'i yeniden çalıştırır |
| `workspaces.json` | Çalışma alanı dizini, kenar çubuğu genişliği / daraltılmış durumu, aktif çalışma alanı kimliği | Evet — tüm çalışma alanlarını ve sekmeleri siler |
| `hooks.json` | Claude Code `--settings` eşlemesi (event → script) + `statusLine.command` | Evet — sonraki başlangıçta yeniden üretilir |
| `status-hook.sh`, `statusline.sh` | `x-pmux-token` ile `/api/status/hook` ve `/api/status/statusline`'a POST | Evet — sonraki başlangıçta yeniden üretilir |
| `rate-limits.json` | Son Claude statusline JSON: `ts`, `model`, `five_hour`, `seven_day`, `context`, `cost` | Evet — Claude çalıştıkça yeniden doldurulur |
| `session-history.json` | Son 200 tamamlanan Claude oturumu (promptlar, sonuçlar, süreler, araçlar, dosyalar) | Evet — geçmişi temizler |
| `quick-prompts.json`, `sidebar-items.json` | Yerleşik listeler üzerine `{ custom: […], disabledBuiltinIds: […], order: […] }` örtüleri | Evet — varsayılanları geri yükler |
| `vapid-keys.json` | İlk çalıştırmada üretilen Web Push VAPID anahtar çifti | `push-subscriptions.json`'u da silmediyseniz hayır (mevcut abonelikler bozulur) |
| `push-subscriptions.json` | Tarayıcı başına push uç noktaları | Evet — her cihazda yeniden abone olun |
| `cli-token` | `purplemux` CLI ve hook betikleri için 32-baytlık hex token (`x-pmux-token` başlığı) | Evet — sonraki başlangıçta yeniden üretilir, ama zaten üretilmiş herhangi bir hook betiği sunucu üzerine yazana kadar eski tokeni saklar |
| `port` | Hook betikleri ve CLI tarafından okunan düz metin geçerli port | Evet — sonraki başlangıçta yeniden üretilir |
| `pmux.lock` | Tek-örnek koruyucu `{ pid, port, startedAt }` | Yalnızca canlı bir purplemux süreci yoksa |

{% call callout('warning', 'Kilit dosyası tuzakları') %}
purplemux "zaten çalışıyor" diyerek başlamayı reddediyor ama hiçbir süreç canlı değilse, `pmux.lock` eskimiştir. `rm ~/.purplemux/pmux.lock` deneyin. purplemux'ı bir kez `sudo` ile çalıştırdıysanız, kilit dosyası root'a ait olabilir — `sudo rm` ile bir kez silin.
{% endcall %}

## Çalışma alanı başına dizin (`workspaces/{wsId}/`)

Her çalışma alanının üretilen çalışma alanı kimliğiyle adlandırılan kendi klasörü vardır.

| Dosya | İçerik |
|---|---|
| `layout.json` | Özyinelemeli panel/sekme ağacı: `tabs[]` ile yaprak `pane` düğümleri, `children[]` ve bir `ratio` ile `split` düğümleri. Her sekme tmux oturum adını (`pt-{wsId}-{paneId}-{tabId}`), önbelleğe alınmış `cliState`, `claudeSessionId`, son resume komutunu taşır. |
| `message-history.json` | Çalışma alanı başına Claude girdi geçmişi. 500 girişle sınırlı. |
| `claude-prompt.md` | Bu çalışma alanındaki her Claude sekmesine geçirilen `--append-system-prompt-file` içeriği. Çalışma alanı oluşturma / yeniden adlandırma / dizin değişikliğinde yeniden üretilir. |

Diğerlerine dokunmadan o çalışma alanının düzenini varsayılan bir panele sıfırlamak için tek bir `workspaces/{wsId}/layout.json`'u silin.

## `logs/`

Pino-roll çıktısı, UTC günü başına bir dosya, boyut sınırları aşıldığında sayısal son ekle:

```
logs/purplemux.2026-04-19.1.log
```

Varsayılan seviye `info`. `LOG_LEVEL` ile veya modül başına `LOG_LEVELS` ile geçersiz kılın — [Portlar & ortam değişkenleri](/purplemux/tr/docs/ports-env-vars/) sayfasına bakın.

Loglar haftalık döner (7-dosya sınırı). İstediğiniz zaman silebilirsiniz.

## `uploads/`

Sohbet girdi çubuğu üzerinden eklenen görüntüler (sürükle, yapıştır, ataş):

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- İzin verilen: `image/png`, `image/jpeg`, `image/gif`, `image/webp`
- Dosya başına maks 10 MB, mod `0600`
- Sunucu başlangıcında otomatik temizlenir: 24 saatten eski her şey kaldırılır
- Manuel temizlik: **Ayarlar → Sistem → Eklenen Görüntüler → Şimdi temizle**

## `stats/`

Saf önbellek. `~/.claude/projects/**/*.jsonl`'den türetilir — purplemux yalnızca o dizini okur.

| Dosya | İçerik |
|---|---|
| `cache.json` | Gün başına toplamlar: mesajlar, oturumlar, araç çağrıları, saatlik sayımlar, model başına token kullanımı |
| `uptime-cache.json` | Gün başına çalışma süresi / aktif dakika toplaması |
| `daily-reports/{YYYY-MM-DD}.json` | AI tarafından üretilen günlük özet |

Bir sonraki istatistik isteğinde yeniden hesaplamayı zorlamak için tüm klasörü silin.

## Sıfırlama matrisi

| Sıfırlanacak… | Silinecek |
|---|---|
| Login parolası (yeniden onboarding) | `config.json` |
| Tüm çalışma alanları ve sekmeler | `workspaces.json` + `workspaces/` |
| Bir çalışma alanının düzeni | `workspaces/{wsId}/layout.json` |
| Kullanım istatistikleri | `stats/` |
| Push abonelikleri | `push-subscriptions.json` |
| Takılı "zaten çalışıyor" | `pmux.lock` (yalnızca canlı süreç yoksa) |
| Her şey (fabrika ayarlarına dön) | `~/.purplemux/` |

`hooks.json`, `status-hook.sh`, `statusline.sh`, `port`, `cli-token` ve `vapid-keys.json` hepsi bir sonraki başlangıçta otomatik yeniden üretilir, dolayısıyla silmek zararsızdır.

## Yedekler

Tüm dizin düz JSON ve birkaç shell betiğidir. Yedeklemek için:

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

Yeni bir makineye geri yüklemek için, çıkartın ve purplemux'ı başlatın. Hook betikleri yeni sunucunun portu ile yeniden yazılır; geri kalan her şey (çalışma alanları, geçmiş, ayarlar) olduğu gibi taşınır.

{% call callout('warning') %}
`pmux.lock`'u geri yüklemeyin — belirli bir PID'ye bağlıdır ve başlangıcı engeller. Hariç tutun: `--exclude pmux.lock`.
{% endcall %}

## Her şeyi sil

```bash
rm -rf ~/.purplemux
```

Önce purplemux'ın çalışmadığından emin olun. Sonraki başlatma yine ilk-çalıştırma deneyimi olacak.

## Sıradaki adımlar

- **[Portlar & ortam değişkenleri](/purplemux/tr/docs/ports-env-vars/)** — bu dizini etkileyen her değişken.
- **[Mimari](/purplemux/tr/docs/architecture/)** — dosyaların çalışan sunucuya nasıl bağlandığı.
- **[Sorun giderme](/purplemux/tr/docs/troubleshooting/)** — yaygın sorunlar ve çözümler.
