---
title: Hızlı promptlar & ekler
description: Kayıtlı bir prompt kütüphanesi, sürükle-bırak görüntüler, dosya ekleri ve yeniden kullanılabilir bir mesaj geçmişi — hepsi zaman tünelinin altındaki girdi çubuğundan.
eyebrow: Claude Code
permalink: /tr/docs/quick-prompts-attachments/index.html
---
{% from "docs/callouts.njk" import callout %}

Zaman tünelinin altındaki girdi çubuğu bir textarea'dan fazlasıdır. Kayıtlı promptlar, ekler ve mesaj geçmişinin yaşadığı yerdir — böylece günde on kez yazdığınız şeyler size günde on yazma maliyetinden kurtulur.

## Hızlı promptlar

Hızlı promptlar `~/.purplemux/quick-prompts.json`'da saklanan kısa, adlandırılmış girişlerdir. Girdi çubuğunun üstünde çipler olarak görünürler — tek tıkla, sanki yazmışsınız gibi prompt'u gönderir.

Kutudan iki yerleşik gelir ve istediğiniz zaman devre dışı bırakılabilir:

- **Commit** — `/commit-commands:commit` çalıştırır
- **Simplify** — `/simplify` çalıştırır

**Ayarlar → Hızlı promptlar**'dan kendinizinkini ekleyin:

1. **Prompt ekle**'ye tıklayın.
2. Bir ad (çip etiketi) ve gövde (gönderilecek) verin.
3. Yeniden sıralamak için sürükleyin. Silmeden gizlemek için kapatın.

Gövdeye yazdığınız her şey aynen gönderilir — slash komutları, çok satırlı promptlar veya "Editörde açık dosyayı açıkla ve bir iyileştirme öner" gibi şablonlanmış istekler dahil.

{% call callout('tip', 'Slash komutları sayılır') %}
Hızlı promptlar Claude Code slash komutları için tek tıklamalı tetikleyiciler olarak güzel çalışır. `/review`'a işaret eden bir "Bu PR'ı incele" çipi her seferinde birkaç tuş vuruşu kazandırır.
{% endcall %}

## Görüntüleri sürükle-bırak

Bir görüntü dosyasını (PNG, JPG, WebP, vb.) girdi çubuğunun herhangi bir yerine bırakarak ekleyin. purplemux dosyayı sunucuda geçici bir yola yükler ve prompt'unuza otomatik bir referans ekler.

Ayrıca şunları yapabilirsiniz:

- Panodan doğrudan bir görüntü **yapıştırın**
- Dosya iletişim kutusundan seçmek için **ataşı tıklayın**
- Mesaj başına **20 dosyaya kadar** ekleyin

Ekler beklerken girdinin üstünde bir küçük resim şeridi belirir. Her küçük resmin göndermeden önce kaldırmak için bir X'i vardır.

## Diğer dosya ekleri

Aynı ataş, görüntü olmayan dosyalar için de çalışır — markdown, JSON, CSV, kaynak dosyalar, her şey. purplemux onları geçici bir dizine koyar ve Claude'un istek kapsamında `read` edebilmesi için yolu ekler.

Bu, başka bir makineden yapıştırılan bir yığın izi veya farklı bir projeden bir yapılandırma dosyası gibi Claude'un kendisi ulaşamadığı şeyleri paylaşmanın en kolay yoludur.

## Mobil dostu

Ekler ve ataş, telefonlarda tam boyuttadır. iOS paylaşım sayfasından bir ekran görüntüsü bırakın veya kamera düğmesini (Android) kullanarak doğrudan kameraya bir fotoğraf ekleyin.

Girdi çubuğu dar ekranlar için yeniden akar — çipler yatay bir kaydırıcı olur, textarea kaydırma öncesi beş satıra kadar büyür.

## Mesaj geçmişi

Bir çalışma alanında gönderdiğiniz her prompt çalışma alanı başına geçmişte tutulur. Birini yeniden kullanmak için:

- Boş bir girdi çubuğunda son mesajları gezmek için <kbd>↑</kbd>'ya basın
- Veya aranabilir bir liste için **Geçmiş** seçicisini açın

Eski girdiler seçiciden silinebilir. Geçmiş diğer çalışma alanı verileriyle birlikte `~/.purplemux/` altında saklanır, makineden hiç çıkmaz.

## Klavye

| Tuş | Eylem |
|---|---|
| <kbd>⌘I</kbd> | Oturum görünümünün herhangi bir yerinden girdiye odaklan |
| <kbd>Enter</kbd> | Gönder |
| <kbd>⇧Enter</kbd> | Yeni satır ekle |
| <kbd>Esc</kbd> | Claude meşgulken bir kesinti gönder |
| <kbd>↑</kbd> | (Boşken) mesaj geçmişinde geri adım at |

## Sıradaki adımlar

- **[Canlı oturum görünümü](/purplemux/tr/docs/live-session-view/)** — promptlarınızın ve Claude'un yanıtlarının göründüğü yer.
- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — tam bağlama tablosu.
- **[İzin istemleri](/purplemux/tr/docs/permission-prompts/)** — onay gerektiren bir istek gönderdikten sonra olanlar.
