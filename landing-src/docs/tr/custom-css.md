---
title: Özel CSS
description: Renkleri, boşlukları ve tek tek yüzeyleri yeniden ayarlamak için CSS değişkenlerini geçersiz kılın.
eyebrow: Özelleştirme
permalink: /tr/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux bir CSS değişken sistemine kuruludur. Kaynağa dokunmadan görsel olarak neredeyse her şeyi değiştirebilirsiniz — kuralları **Görünüm** sekmesine yapıştırın, Uygula'ya tıklayın, bağlı her istemcide hemen etkili olsunlar.

## Nereye yazılır

Ayarlar'ı (<kbd>⌘,</kbd>) açın ve **Görünüm**'ü seçin. Custom CSS etiketli tek bir textarea göreceksiniz.

1. Kurallarınızı yazın.
2. **Uygula**'ya tıklayın. CSS, her sayfaya bir `<style>` etiketi olarak enjekte edilir.
3. Tüm geçersiz kılmaları temizlemek için **Sıfırla**'ya tıklayın.

CSS, sunucuda `~/.purplemux/config.json` (`customCSS`) içinde saklanır, böylece bağlanan her cihazda uygulanır.

{% call callout('note', 'Sunucu çapında, cihaz başına değil') %}
Özel CSS sunucu yapılandırmasında yaşar ve her tarayıcıya sizinle gelir. Bir cihazın diğerinden farklı görünmesini istiyorsanız, bu şu anda desteklenmiyor.
{% endcall %}

## Nasıl çalışır

purplemux'taki çoğu renk, yüzey ve aksan, `:root` (açık) ve `.dark` altında CSS değişkenleri olarak sunulur. Değişkeni geçersiz kılmak, o değişkenin kullanıldığı her yerde — kenar çubuğu, diyaloglar, grafikler, durum rozetleri — değişikliği zincirleme yayar.

Tek bir değişkeni değiştirmek, bileşen seçicilerini doğrudan geçersiz kılmaktan neredeyse her zaman daha iyidir. Bileşen sınıfları kararlı bir API değildir; değişkenler kararlıdır.

## Asgari bir örnek

Açık modda kenar çubuğunu biraz sıcaklaştırın ve koyu yüzeyi daha koyuya itin:

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

Veya başka bir şeye dokunmadan markayı yeniden renklendirin:

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## Değişken grupları

Görünüm paneli tam listeyi **Available Variables** altında sunar. Ana kovalar:

- **Yüzey** — `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--sidebar`
- **Metin** — `--foreground` ve eşleşen `*-foreground` varyantları
- **Etkileşimli** — `--primary`, `--primary-foreground`, `--destructive`
- **Kenarlık** — `--border`, `--input`, `--ring`
- **Palet** — `--ui-blue`, `--ui-teal`, `--ui-coral`, `--ui-amber`, `--ui-purple`, `--ui-pink`, `--ui-green`, `--ui-gray`, `--ui-red`
- **Anlamsal** — `--positive`, `--negative`, `--accent-color`, `--brand`, `--focus-indicator`, `--claude-active`

Varsayılan oklch değerleri ve tasarım gerekçeleriyle tam token listesi için repodaki [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md) belgesine bakın. O belge doğruluk kaynağıdır.

## Yalnızca bir modu hedefleme

Açık için kuralları `:root`'a, koyu için `.dark`'a sarın. Sınıf, `next-themes` tarafından `<html>`'e konur.

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

Yalnızca bir modu değiştirmek istiyorsanız, diğerini dokunulmadan bırakın.

## Peki ya terminal?

xterm.js terminali, küratörlü bir listeden seçilen kendi paletini kullanır — bu CSS değişkenleri tarafından yönlendirilmez. **Terminal** sekmesinde değiştirin. [Terminal temaları](/purplemux/tr/docs/terminal-themes/) sayfasına bakın.

## Sıradaki adımlar

- **[Temalar & fontlar](/purplemux/tr/docs/themes-fonts/)** — açık, koyu, sistem; font boyutu ön ayarları.
- **[Terminal temaları](/purplemux/tr/docs/terminal-themes/)** — terminal alanı için ayrı palet.
- **[Kenar çubuğu & Claude seçenekleri](/purplemux/tr/docs/sidebar-options/)** — öğeleri yeniden sıralayın, Claude bayraklarını açıp kapatın.
