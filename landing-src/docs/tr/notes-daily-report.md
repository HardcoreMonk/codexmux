---
title: Notlar (AI günlük raporu)
description: Bir LLM tarafından yazılmış, yerel olarak Markdown olarak saklanan her Claude Code oturumunun gün sonu özeti.
eyebrow: Claude Code
permalink: /tr/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

Gün bittiğinde, purplemux günün oturum loglarını okuyup size tek satırlık bir özet ve proje bazlı bir Markdown özeti yazabilir. Kenar çubuğunda **Notlar** olarak yaşar ve retrolar, standuplar ve 1:1 görüşmelerin "dün ne yaptım?" diyerek başlamasını engellemek için vardır.

## Gün başına ne alıyorsunuz

Her giriş iki katmana sahiptir:

- **Tek satırlık özet** — günün şeklini yakalayan tek cümle. Doğrudan Notlar listesinde görünür.
- **Detaylı görünüm** — özeti genişleterek projeye göre gruplanmış, her konu için H3 bölümleri ve altında madde işaretli vurgular bulunan bir Markdown raporunu görün.

Özet taradığınız şeydir; detaylı görünüm bir retro dokümanına yapıştırdığınız şey.

Her günün başında oturum sayısı ve toplam maliyeti gösteren küçük bir başlık vardır — [istatistik panelinin](/purplemux/tr/docs/usage-rate-limits/) kullandığı aynı sayılar, özet biçiminde.

## Rapor üretme

Raporlar talep üzerine üretilir, otomatik değil. Notlar görünümünden:

- Eksik bir günün yanındaki **Üret**, JSONL transkriptlerinden o günün raporunu oluşturur.
- Mevcut bir girişte **Yeniden üret**, taze içerikle aynı günü yeniden inşa eder (bağlam eklediyseniz veya dil değiştirdiyseniz yararlı).
- **Hepsini üret**, tüm eksik günleri sırayla doldurur. Toplu işlemi istediğiniz zaman durdurabilirsiniz.

LLM, projeye göre birleştirmeden önce her oturumu ayrı ayrı işler, böylece çok sekmeli uzun günlerde bağlam kaybolmaz.

{% call callout('note', 'Yerel uygulamayı takip eder') %}
Raporlar purplemux'ın ayarlandığı dilde yazılır. Uygulama dilini değiştirip yeniden üretmek aynı içeriği yeni dilde verir.
{% endcall %}

## Nerede yaşar

| Yüzey | Yol |
|---|---|
| Kenar çubuğu | Liste görünümünü açan **Notlar** girişi |
| Kısayol | macOS'ta <kbd>⌘⇧E</kbd>, Linux'ta <kbd>Ctrl⇧E</kbd> |
| Saklama | `~/.purplemux/stats/daily-reports/<date>.json` |

Her gün özeti, detaylı Markdown'u, dili ve oturum metadata'sını içeren tek bir JSON dosyasıdır. Makinenizden hiçbir şey ayrılmaz, yalnızca LLM çağrısının kendisi — bu da host'ta yapılandırılmış Claude Code hesabından geçer.

## Proje başına yapı

Detaylı görünümün içinde tipik bir gün şöyle görünür:

```markdown
**purplemux**

### Açılış sayfası taslağı
- Hero / Why / Mobile / Stats düzenleriyle sekiz bölümlü yapı tasarlandı
- Mor marka rengi OKLCH değişkenine alındı
- Masaüstü / mobil ekran görüntüsü maket çerçeveleri uygulandı

### Özellik kartı maketleri
- Çoklu oturum panelinde gerçek spinner / nabız göstergeleri yeniden üretildi
- Git Diff, çalışma alanı ve kendi-host'lanmış maket CSS'leri sıkılaştırıldı
```

Aynı projede çalışan oturumlar tek bir proje başlığı altında birleştirilir; bir proje içindeki konular H3 bölümleri olur. İşlenen Markdown'ı doğrudan bir retro şablonuna kopyalayabilirsiniz.

## Özetlemenin anlamlı olmadığı günler

Claude oturumu olmayan bir gün giriş almaz. Tek küçük oturumlu bir gün çok kısa bir özet üretebilir — sorun değil; gerçekten iş yaptığınız bir sonraki sefer daha uzun yeniden üretir.

Toplu üretici, mevcut yerelde zaten raporu olan günleri atlar ve yalnızca gerçek boşlukları doldurur.

## Gizlilik

Bir rapor oluşturmak için kullanılan metin, `~/.claude/projects/` içinde kendiniz okuyabileceğiniz aynı JSONL transkriptleridir. Özetleme isteği gün başına tek bir LLM çağrısıdır; önbelleğe alınan çıktı `~/.purplemux/` altında kalır. Telemetri yok, yükleme yok, paylaşılan önbellek yok.

## Sıradaki adımlar

- **[Kullanım & kota sınırları](/purplemux/tr/docs/usage-rate-limits/)** — bu oturum sayıları ve maliyetlerin geldiği panel.
- **[Canlı oturum görünümü](/purplemux/tr/docs/live-session-view/)** — gerçek zamanlı kaynak veri.
- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — Notlar için <kbd>⌘⇧E</kbd> dahil.
