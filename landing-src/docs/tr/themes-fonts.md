---
title: Temalar & fontlar
description: Açık, koyu veya sistem; üç font boyutu; tek bir ayar paneli.
eyebrow: Özelleştirme
permalink: /tr/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux, tutarlı tek bir görünüm ve küçük bir anahtar setiyle gelir: uygulama teması, font boyutu ve ayrı bir terminal paleti. Bu sayfa ilk ikisini ele alıyor — terminal renkleri kendi sayfasında.

## Ayarlar'ı açın

Ayarlar'ı açmak için <kbd>⌘,</kbd> (macOS) veya <kbd>Ctrl,</kbd> (Linux) tuşlarına basın. **Genel** sekmesi, tema ve font boyutunun bulunduğu yerdir.

Üst çubuktaki dişli simgesine de tıklayabilirsiniz.

## Uygulama teması

Üç mod, anında uygulanır:

| Mod | Davranış |
|---|---|
| **Açık** | OS tercihinden bağımsız olarak açık temayı zorla. |
| **Koyu** | Koyu temayı zorla. |
| **Sistem** | OS'u takip et — macOS / GNOME / KDE açık ile koyu arasında geçtiğinde otomatik değişir. |

Tema, `~/.purplemux/config.json`'da `appTheme` altında saklanır ve sunucuya bağlı her tarayıcı sekmesine senkronize edilir. macOS yerel uygulamasında, OS başlık çubuğu da güncellenir.

{% call callout('note', 'Önce-koyu tasarlandı') %}
Marka, derin mor tonlu bir nötr etrafında kuruludur ve koyu mod, kesinlikle akromatik bir yüzey için chroma'yı sıfırda tutar. Açık mod, sıcaklık için neredeyse algılanmaz bir mor ton (hue 287) uygular. İkisi de uzun seanslar için ayarlanmıştır; gözünüz hangisini tercih ederse onu seçin.
{% endcall %}

## Font boyutu

Üç ön ayar, düğme grubu olarak yüzeye çıkar:

- **Normal** — varsayılan; kök font-size tarayıcıyı takip eder.
- **Büyük** — kök font-size `18px`'e ayarlanır.
- **X-Large** — kök font-size `20px`'e ayarlanır.

Tüm UI `rem` ile boyutlandığından, ön ayarları değiştirmek tüm arayüzü — kenar çubuğu, diyaloglar, terminal — bir anda ölçeklendirir. Değişiklik yeniden yüklemeden gerçek zamanlı uygulanır.

## Ne değişir, ne değişmez

Font boyutu **UI kromu ve terminal metnini** ölçeklendirir. Şunları değiştirmez:

- Başlık hiyerarşisi (göreli boyutlar aynı kalır)
- Boşluk — oranlar korunur
- Kod bloğu sözdizimi stili

Tek tek öğeleri ince ayarlamak istiyorsanız (örneğin yalnızca terminal veya yalnızca kenar çubuğu), [Özel CSS](/purplemux/tr/docs/custom-css/) sayfasına bakın.

## Cihaz başına, tarayıcı başına değil

Ayarlar localStorage'da değil, sunucuda saklanır. Dizüstünüzde koyuya geçmek telefonunuzu da geçirir — telefondan `https://<host>/`'u açın, değişiklik zaten orada.

Mobil ile masaüstünü farklı tutmayı tercih ediyorsanız, bu şu anda desteklenmiyor; ihtiyacınız varsa bir issue açın.

## Sıradaki adımlar

- **[Özel CSS](/purplemux/tr/docs/custom-css/)** — tek tek renkleri ve boşlukları geçersiz kılın.
- **[Terminal temaları](/purplemux/tr/docs/terminal-themes/)** — xterm.js için ayrı palet.
- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — tüm bağlamalar tek tabloda.
