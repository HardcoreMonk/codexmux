---
title: Kenar çubuğu & Claude seçenekleri
description: Kenar çubuğu kısayollarını yeniden sıralayın ve gizleyin, hızlı prompt kütüphanesini yönetin ve Claude CLI bayraklarını açıp kapatın.
eyebrow: Özelleştirme
permalink: /tr/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

Kenar çubuğu ve girdi çubuğu, yeniden şekillendirebileceğiniz küçük listelerden oluşur — kenar çubuğunun altındaki kısayol bağlantıları, girdinin üstündeki prompt düğmeleri. Ayarlar'daki Claude sekmesi, panelden başlattığınız oturumlar için CLI seviyesi anahtarları barındırır.

## Kenar çubuğu öğeleri

Ayarlar (<kbd>⌘,</kbd>) → **Kenar çubuğu** sekmesi. Liste, kenar çubuğunun altında oturan kısayol satırını kontrol eder — panellere, dahili araçlara, URL'lenebilir herhangi bir şeye bağlantılar.

Her satırda bir tutamaç, ad, URL ve anahtar vardır. Şunları yapabilirsiniz:

- **Sürükle** — yeniden sıralamak için tutamacı sürükleyin. Hem yerleşik hem özel öğeler serbestçe hareket eder.
- **Aç/kapat** — silmeden gizlemek için anahtarı çevirin.
- **Düzenle** — özel öğeleri (kalem simgesi) — adı, simgeyi veya URL'yi değiştirin.
- **Sil** — özel öğeleri (çöp simgesi).
- **Varsayılana sıfırla** — yerleşik öğeleri geri yükler, tüm özelleri siler, sıralamayı temizler.

### Özel bir öğe ekleme

Altta **Öğe Ekle**'ye tıklayın. Küçük bir form alırsınız:

- **Ad** — ipucu ve etiket olarak görünür.
- **Simge** — aranabilir bir lucide-react galerisinden seçilir.
- **URL** — `http(s)://...` herhangi bir şey çalışır. Dahili Grafana, Vercel panelleri, dahili bir admin aracı.

Save'e tıklayın ve satır listenin altında belirir. İstediğiniz yere sürükleyin.

{% call callout('note', 'Yerleşikler gizlenebilir, silinemez') %}
Yerleşik öğeler (purplemux'ın getirdiği) yalnızca bir anahtar ve bir tutamaç içerir — düzenleme veya silme yoktur. Fikriniz değişirse diye her zaman oradadırlar. Özel öğeler tam seti alır.
{% endcall %}

## Hızlı promptlar

Ayarlar → **Hızlı Promptlar** sekmesi. Bunlar Claude girdi alanının üstünde oturan düğmelerdir — önceden hazırlanmış bir mesaj göndermek için tek tıklama.

Kenar çubuğu öğeleriyle aynı desen:

- Yeniden sıralamak için sürükleyin.
- Gizlemek için açıp kapatın.
- Özel promptları düzenleyin / silin.
- Varsayılana sıfırla.

Bir prompt eklemek bir **ad** (düğme etiketi) ve **prompt**'un kendisini (çok satırlı metin) ister. Sık yazdığınız şeyler için kullanın: "Test paketini çalıştır", "Son commit'i özetle", "Mevcut diff'i incele".

## Claude CLI seçenekleri

Ayarlar → **Claude** sekmesi. Bu bayraklar *purplemux'ın yeni sekmelerde Claude CLI'sını nasıl başlattığını* etkiler — zaten çalışan bir oturumun davranışını değiştirmezler.

### İzin Kontrollerini Atla

`claude` komutuna `--dangerously-skip-permissions` ekler. Claude araçları çalıştırır ve dosyaları her seferinde onay istemeden düzenler.

Bu, resmi CLI'nın sunduğu aynı bayraktır — purplemux üstüne hiçbir güvenlik gevşetmez. Açmadan önce [Anthropic'in dokümantasyonunu](https://docs.anthropic.com/en/docs/claude-code/cli-reference) okuyun. Yalnızca güvenilir çalışma alanları için seçmeli olarak değerlendirin.

### Claude ile Terminali Göster

**Açıkken** (varsayılan): Bir Claude sekmesi canlı oturum görünümünü *ve* alttaki terminal panelini yan yana gösterir, böylece istediğinizde shell'e atlayabilirsiniz.

**Kapalıyken**: Yeni Claude sekmeleri terminal daraltılmış olarak açılır. Oturum görünümü tüm paneli doldurur. Sekme başına terminal'i yine de manuel olarak genişletebilirsiniz; bu yalnızca yeni oluşturulan sekmeler için varsayılanı değiştirir.

Claude'u çoğunlukla zaman tüneli görünümünden sürerseniz ve daha temiz bir varsayılan istiyorsanız kapalı ayarını kullanın.

## Sıradaki adımlar

- **[Temalar & fontlar](/purplemux/tr/docs/themes-fonts/)** — açık, koyu, sistem; font boyutu ön ayarları.
- **[Editör entegrasyonu](/purplemux/tr/docs/editor-integration/)** — VS Code, Cursor, code-server'ı bağlayın.
- **[İlk oturum](/purplemux/tr/docs/first-session/)** — panel düzeni hatırlatıcı.
