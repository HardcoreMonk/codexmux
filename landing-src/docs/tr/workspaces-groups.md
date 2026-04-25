---
title: Çalışma alanları & gruplar
description: İlişkili sekmeleri çalışma alanlarında topla, ardından çalışma alanlarını kenar çubuğunda sürükle-bırak gruplara dahil et.
eyebrow: Çalışma alanları & Terminal
permalink: /tr/docs/workspaces-groups/index.html
---
{% from "docs/callouts.njk" import callout %}

Bir çalışma alanı, ilişkili sekmelerin klasörüdür — bir projenin terminali, diff paneli ve Claude oturumu birlikte oturur. Birden fazla olduğunda kenar çubuğundaki gruplar onları derli toplu tutar.

## Çalışma alanı neler içerir

Her çalışma alanının kendine ait şunları vardır:

- **Varsayılan dizin** — yeni sekmelerin shell'i burada başlar.
- **Sekmeler ve paneller** — terminaller, Claude oturumları, diff panelleri, web tarayıcı panelleri.
- **Düzen** — bölme oranları, odak, her panelde aktif sekme.

Hepsi `~/.purplemux/workspaces.json`'a yazılır; çalışma alanı, purplemux'ın kaydedip geri yüklediği birimdir. Tarayıcıyı kapatmak çalışma alanını dağıtmaz; tmux shell'leri açık tutar ve düzen yerinde kalır.

## Çalışma alanı oluşturun

İlk çalıştırma tek bir varsayılan çalışma alanı verir. Bir tane daha eklemek için:

1. Kenar çubuğunun üstündeki **+ Yeni çalışma alanı**'na tıklayın veya <kbd>⌘N</kbd>'ye basın.
2. İsim verin ve varsayılan dizini seçin — genelde o proje için repo kökü.
3. Enter. Boş çalışma alanı açılır.

{% call callout('tip', 'Doğru başlangıç dizinini seçin') %}
Varsayılan dizin, bu çalışma alanındaki her yeni shell'in cwd'sidir. Onu proje köküne işaret ederseniz, her yeni sekme `pnpm dev`, `git status` veya doğru yerde Claude oturumu başlatmaktan tek tuş uzakta olur.
{% endcall %}

## Yeniden adlandır ve sil

Kenar çubuğunda bir çalışma alanına sağ tıklayın (veya kebap menüsünü kullanın) — **Yeniden adlandır** ve **Sil** seçenekleri görünür. Aktif çalışma alanı için yeniden adlandırma <kbd>⌘⇧R</kbd>'ye de bağlıdır.

Bir çalışma alanını silmek tmux oturumlarını kapatır ve onu `workspaces.json`'dan kaldırır. Geri alma yok. Önceden çökmüş veya kapatılmış sekmeler gitmiş olarak kalır; canlı sekmeler temiz bir şekilde sonlandırılır.

## Çalışma alanları arasında geçiş

Kenar çubuğundaki herhangi bir çalışma alanına tıklayın veya sayı satırını kullanın:

| Eylem | macOS | Linux / Windows |
|---|---|---|
| 1–9 numaralı çalışma alanına geç | <kbd>⌘1</kbd> – <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> – <kbd>Ctrl+9</kbd> |
| Kenar çubuğunu aç/kapat | <kbd>⌘B</kbd> | <kbd>Ctrl+B</kbd> |
| Kenar çubuğu modunu değiştir (Çalışma alanı ↔ Oturumlar) | <kbd>⌘⇧B</kbd> | <kbd>Ctrl+Shift+B</kbd> |

Kenar çubuğundaki sıra, sayı tuşlarının eşleştiği sıradır. Bir çalışma alanını yukarı veya aşağı sürükleyerek hangi yuvada bulunacağını değiştirin.

## Çalışma alanlarını gruplayın

Birkaç çalışma alanınız olduğunda kenar çubuğunda sürükle-bırak ile gruplara ayırın. Grup, daraltılabilir bir başlıktır — "müşteri işi", "yan projeler" ve "ops"u tek düz bir listeye sıkıştırmadan ayırmak için kullanışlıdır.

- **Grup oluştur** — bir çalışma alanını başka birinin üzerine sürükleyin; kenar çubuğu gruplamayı önerir.
- **Yeniden adlandır** — grup başlığına sağ tıklayın.
- **Yeniden sırala** — grupları yukarı/aşağı sürükleyin, çalışma alanlarını gruba sokup çıkarın.
- **Daralt** — grup başlığındaki şevron işaretine tıklayın.

Gruplar görsel düzendir. Sekmelerin nasıl kaydedildiğini veya kısayolların nasıl davrandığını değiştirmezler; <kbd>⌘1</kbd> – <kbd>⌘9</kbd> hâlâ düz sırayı yukarıdan aşağı dolaşır.

## Diskte nerede yaşar

Her değişiklik `~/.purplemux/workspaces.json`'a yazılır. İnceleyebilir veya yedekleyebilirsiniz — tam dosya düzeni için [Veri dizini](/purplemux/tr/docs/data-directory/) sayfasına bakın. Sunucu çalışırken silerseniz, purplemux boş bir çalışma alanına düşer ve baştan başlar.

## Sıradaki adımlar

- **[Sekmeler & paneller](/purplemux/tr/docs/tabs-panes/)** — bir çalışma alanının içinde böl, yeniden sırala ve odakla.
- **[Düzenleri kaydet & geri yükle](/purplemux/tr/docs/save-restore/)** — çalışma alanları tarayıcı kapanmasından ve sunucu yeniden başlatmasından nasıl sağ kalır.
- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — tam bağlama tablosu.
