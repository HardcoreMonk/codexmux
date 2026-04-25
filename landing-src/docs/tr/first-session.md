---
title: İlk oturum
description: Boş bir çalışma alanından çalışıp izlenebilen ilk Claude oturumunuza — panel için rehberli bir tur.
eyebrow: Başlarken
permalink: /tr/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux çalışıyor (değilse [Hızlı başlangıç](/purplemux/tr/docs/quickstart/) sayfasına bakın). Bu sayfa arayüzün ne yaptığını anlatır, böylece ilk birkaç dakika daha az soyut hissettirir.

## Panel

`http://localhost:8022`'yi açtığınızda bir **çalışma alanına** düşersiniz. Çalışma alanını ilgili sekmelerin bir klasörü olarak düşünün — biri Claude ile kodladığınız proje, biri yazdığınız dokümanlar, biri ad-hoc shell işleri için.

Düzen:

- **Sol kenar çubuğu** — çalışma alanları ve oturumlar, Claude durum rozetleri, kullanım sınırı widget'ı, notlar, istatistikler
- **Ana alan** — geçerli çalışma alanındaki paneller; her panelin birden çok sekmesi olabilir
- **Üst çubuk** — çalışma alanı adı, bölme kontrolleri, ayarlar

Kenar çubuğunu istediğiniz zaman <kbd>⌘B</kbd> ile açıp kapatın. Kenar çubuğunda Çalışma alanı/Oturumlar modunu <kbd>⌘⇧B</kbd> ile değiştirin.

## Bir çalışma alanı oluşturun

İlk çalıştırma tek bir varsayılan çalışma alanı verir. Bir tane daha eklemek için:

1. Kenar çubuğunun üstündeki **+ Yeni çalışma alanı**'na tıklayın (<kbd>⌘N</kbd>).
2. İsim verin ve varsayılan dizini seçin — yeni sekmelerin shell'i burada başlar.
3. Enter. Boş çalışma alanı açılır.

Çalışma alanlarını kenar çubuğunda sürükleyerek yeniden sıralayıp adlandırabilirsiniz.

## İlk sekmenizi açın

Çalışma alanı boş başlar. <kbd>⌘T</kbd> veya sekme çubuğundaki **+** düğmesi ile bir sekme ekleyin.

Bir **şablon** seçin:

- **Terminal** — boş bir shell. `vim`, `docker`, betikler için iyidir.
- **Claude** — shell'de `claude` zaten çalışır halde başlar.

{% call callout('tip', 'Şablonlar yalnızca kısayollardır') %}
Altta her sekme normal bir shell'dir. Claude şablonu yalnızca "bir terminal aç ve `claude` çalıştır" demektir. Sonradan bir Terminal sekmesinde elle `claude` çalıştırırsanız purplemux fark eder ve aynı şekilde durumu yüzeye çıkarır.
{% endcall %}

## Oturum durumunu okuyun

Sekmeniz için **kenar çubuğu oturum satırına** bakın. Şu göstergelerden birini görürsünüz:

| Durum | Anlamı |
|---|---|
| **Boşta** (gri) | Claude girdinizi bekliyor. |
| **Meşgul** (mor spinner) | Claude çalışıyor — dosya okuyor, araç çalıştırıyor. |
| **Girdi gerekiyor** (sarı) | Claude izin istemine takıldı veya soru sordu. |
| **İnceleme** (mavi) | İş bitti, Claude durdu; kontrol etmeniz gereken bir şey var. |

Geçişler neredeyse anlıktır. Bunun nasıl tespit edildiği için [Oturum durumu](/purplemux/tr/docs/session-status/) sayfasına bakın.

## Bir izin istemine yanıt verin

Claude bir aracı çalıştırmak veya dosya düzenlemek istediğinde, purplemux **istemi yakalar** ve oturum görünümünde satır içi gösterir. Şunları yapabilirsiniz:

- **1 · Evet** / **2 · Evet, hep** / **3 · Hayır**'a tıklayın, ya da
- Klavyede sayı tuşlarına basın, ya da
- Yok sayın ve telefonunuzdan yanıtlayın — mobil Web Push aynı uyarıyı tetikler.

Claude CLI yakalanan istemde gerçekte bloklanmaz; purplemux sizin yanıtınızı geri iletir.

## Bölün ve geçiş yapın

Bir sekme çalışmaya başladığında şunları deneyin:

- <kbd>⌘D</kbd> — geçerli paneli sağa böl
- <kbd>⌘⇧D</kbd> — aşağı böl
- <kbd>⌘⌥←/→/↑/↓</kbd> — bölmeler arasında odağı taşı
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — önceki / sonraki sekme

Tam liste [Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/) sayfasında.

## Kaydet ve geri yükle

Tarayıcıyı kapatın. Sekmeleriniz hiçbir yere gitmiyor — tmux onları sunucuda açık tutar. Bir saat (veya bir hafta) sonra yenileyin; purplemux bölme oranları ve çalışma dizinleri dahil tam düzeni geri yükler.

Sunucu yeniden başlatması bile geri kazanılabilir: yeniden başlangıçta purplemux kayıtlı düzeni `~/.purplemux/workspaces.json`'dan okur, shell'leri doğru dizinlerde tekrar başlatır ve mümkünse Claude oturumlarını yeniden bağlar.

## Telefonunuzdan erişin

Çalıştırın:

```bash
tailscale serve --bg 8022
```

Telefonunuzda `https://<machine>.<tailnet>.ts.net` adresini açın, **Paylaş → Ana Ekrana Ekle**'ye dokunun ve bildirim iznini verin. Sekme kapalıyken bile **girdi gerekiyor** ve **inceleme** durumları için push uyarıları alırsınız.

Tam yürüyüş: [PWA kurulumu](/purplemux/tr/docs/pwa-setup/) · [Web Push](/purplemux/tr/docs/web-push/) · [Tailscale](/purplemux/tr/docs/tailscale/).

## Sıradaki adımlar

- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — tüm bağlamalar tek tabloda.
- **[Tarayıcı desteği](/purplemux/tr/docs/browser-support/)** — uyumluluk matrisi, özellikle iOS Safari 16.4+.
- Kenar çubuğunu keşfedin: AI günlük raporu için **Notlar** (<kbd>⌘⇧E</kbd>), kullanım analizi için **İstatistik** (<kbd>⌘⇧U</kbd>).
