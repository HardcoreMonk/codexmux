---
title: Terminal temaları
description: xterm.js terminali için ayrı bir renk paleti — biri açık, biri koyu için seçin.
eyebrow: Özelleştirme
permalink: /tr/docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

Terminal paneli, UI'nın geri kalanından bağımsız kendi paletiyle xterm.js kullanır. Bir koyu tema ve bir açık tema seçersiniz; uygulama teması değiştikçe purplemux aralarında geçiş yapar.

## Seçiciyi açın

Ayarlar (<kbd>⌘,</kbd>) → **Terminal** sekmesi. Dark ve Light etiketli iki alt sekme göreceksiniz, her biri tema kartlarından oluşan bir ızgaraya sahip. Birine tıklayın — açık olan her terminale canlı uygulanır.

## Neden ayrı bir palet

Terminal uygulamaları 16 renkli ANSI paletine bağlıdır (kırmızı, yeşil, sarı, mavi, magenta, cyan, artı parlak varyantları). UI paleti tasarımı gereği soluktur ve terminal çıktısını okunmaz hale getirirdi. Amaca yönelik bir palet `vim`, `git diff`, sözdizimi vurgulama ve TUI araçlarının doğru çizilmesini sağlar.

Her tema şunları tanımlar:

- Arka plan, ön plan, imleç, seçim
- Sekiz temel ANSI rengi (siyah, kırmızı, yeşil, sarı, mavi, magenta, cyan, beyaz)
- Sekiz parlak varyant

## Paketlenmiş temalar

**Koyu**

- Snazzy *(varsayılan)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**Açık**

- Catppuccin Latte *(varsayılan)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

Kart önizlemesi, temanın arka planında yedi temel ANSI rengini gösterir, böylece taahhütten önce kontrastı göz kararı kontrol edebilirsiniz.

## Açık/koyu geçişi nasıl çalışır

**Bir koyu tema** ve **bir açık tema**'yı bağımsız seçersiniz. Aktif tema, çözümlenmiş uygulama temasıyla belirlenir:

- Uygulama teması **Koyu** → seçtiğiniz koyu tema.
- Uygulama teması **Açık** → seçtiğiniz açık tema.
- Uygulama teması **Sistem** → OS'u takip eder, otomatik değişir.

Yani uygulama teması için Sistem seçmek ve her iki tarafı yapılandırmak, ek bir bağlantı olmadan OS gece/gündüzünüzü takip eden bir terminal verir.

{% call callout('tip', 'Uygulamayla eşleştir veya kontrast yap') %}
Bazıları terminalin UI'nın geri kalanıyla eşleşmesini sever. Diğerleri açık bir uygulamada bile yüksek kontrastlı Dracula veya Tokyo Night terminali tercih eder. İkisi de işe yarar; seçici hiçbir şeyi zorlamaz.
{% endcall %}

## Tema başına, sekme başına değil

Seçim küreseldir. Her terminal paneli ve her Claude oturumu aynı aktif temayı kullanır. Sekme başına geçersiz kılma yok; ihtiyacınız varsa bir issue açın.

## Kendinizinkini ekleme

Özel tema girişleri şu anda UI'nın bir parçası değil. Paketlenmiş liste `src/lib/terminal-themes.ts`'de yaşar. Kaynaktan derlerseniz kendinizinkini ekleyebilirsiniz; aksi halde desteklenen yol, yeni temayla bir PR açmaktır.

## Sıradaki adımlar

- **[Temalar & fontlar](/purplemux/tr/docs/themes-fonts/)** — uygulama teması ve font boyutu.
- **[Özel CSS](/purplemux/tr/docs/custom-css/)** — UI'nın geri kalanını geçersiz kılın.
- **[Editör entegrasyonu](/purplemux/tr/docs/editor-integration/)** — dosyaları harici bir editörde açın.
