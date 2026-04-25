---
title: Sekmeler & paneller
description: Bir çalışma alanı içinde sekmelerin nasıl çalıştığı, panellerin nasıl bölüneceği ve aralarında odağı taşıyan kısayollar.
eyebrow: Çalışma alanları & Terminal
permalink: /tr/docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

Bir çalışma alanı **panellere** ayrılır ve her panel bir **sekme** yığını barındırır. Bölmeler size paralel görünümler verir; sekmeler ise tek panelin ekran alanı çalmadan birden fazla shell barındırmasını sağlar.

## Sekmeler

Her sekme, bir tmux oturumuna bağlı gerçek bir shell'dir. Sekme başlığı ön plandaki süreçten gelir — `vim` yazın, sekme kendini yeniden adlandırır; çıkın, dizin adına geri döner.

| Eylem | macOS | Linux / Windows |
|---|---|---|
| Yeni sekme | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| Sekmeyi kapat | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| Önceki sekme | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| Sonraki sekme | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| 1–9 sekmeye git | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

Sekme çubuğunda bir sekmeyi sürükleyerek yeniden sıralayın. Sekme çubuğunun sonundaki **+** düğmesi <kbd>⌘T</kbd> ile aynı şablon seçiciyi açar.

{% call callout('tip', 'Terminal dışındaki şablonlar') %}
Yeni sekme menüsü panel türü olarak **Terminal**, **Claude**, **Diff** veya **Web tarayıcı** seçmenize izin verir. Hepsi sekmedir — aynı panelde karıştırabilir, yukarıdaki kısayollarla aralarında geçiş yapabilirsiniz.
{% endcall %}

## Panelleri bölme

Sekmeler ekran alanını paylaşır. İki şeyi aynı anda görmek için paneli bölün.

| Eylem | macOS | Linux / Windows |
|---|---|---|
| Sağa böl | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| Aşağı böl | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

Yeni bölme çalışma alanının varsayılan dizinini miras alır ve boş bir terminal sekmesiyle başlar. Her panelin kendi sekme çubuğu vardır, bu yüzden sağdaki panel diff görüntüleyicisini barındırırken soldaki panel `claude`'u çalıştırabilir.

## Paneller arasında odağı taşıma

Yön kısayollarını kullanın — bölme ağacında dolaşırlar, böylece derin iç içe bir panelden gelen <kbd>⌘⌥→</kbd> hâlâ görsel olarak komşu olana iner.

| Eylem | macOS | Linux / Windows |
|---|---|---|
| Sola odakla | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Sağa odakla | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Yukarı odakla | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| Aşağı odakla | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## Yeniden boyutlandır ve eşitle

İnce kontrol için paneller arasındaki bölücüyü sürükleyin ya da klavyeyi kullanın.

| Eylem | macOS | Linux / Windows |
|---|---|---|
| Sola yeniden boyutlandır | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| Sağa yeniden boyutlandır | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| Yukarı yeniden boyutlandır | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| Aşağı yeniden boyutlandır | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| Bölmeleri eşitle | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

Eşitleme, kullanılamaz uçlara doğru kaymış bir düzeni sıfırlamanın en hızlı yoludur.

## Ekranı temizle

<kbd>⌘K</kbd> geçerli panelin terminalini temizler — çoğu yerel terminalin yaptığı gibi. Shell süreci çalışmaya devam eder; yalnızca görünür arabellek silinir.

| Eylem | macOS | Linux / Windows |
|---|---|---|
| Ekranı temizle | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## Sekmeler her şeye dayanır

Bir sekmeyi kapatmak tmux oturumunu sonlandırır. *Tarayıcıyı* kapatmak, yenilemek veya ağı kaybetmek bunu yapmaz — her sekme sunucuda çalışmaya devam eder. Yeniden açın, aynı paneller, bölmeler ve sekmeler geri gelir.

Sunucu yeniden başlatmaları arasındaki kurtarma hikayesi için [Düzenleri kaydet & geri yükle](/purplemux/tr/docs/save-restore/) sayfasına bakın.

## Sıradaki adımlar

- **[Düzenleri kaydet & geri yükle](/purplemux/tr/docs/save-restore/)** — bu düzen nasıl kalıcı kalır.
- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — tüm bağlamalar tek tabloda.
- **[Git workflow paneli](/purplemux/tr/docs/git-workflow/)** — bir bölmeye atılacak kullanışlı bir sekme türü.
