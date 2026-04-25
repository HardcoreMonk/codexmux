---
title: Git workflow paneli
description: Terminalinizin yanında yaşayan bir diff görüntüleyici, geçmiş tarayıcısı ve senkronizasyon kontrolleri — bir şey ters gittiğinde Claude'a tek tıkla devir.
eyebrow: Çalışma alanları & Terminal
permalink: /tr/docs/git-workflow/index.html
---
{% from "docs/callouts.njk" import callout %}

Git paneli, terminal gibi bir sekme türüdür. Onu Claude oturumunun yanına açın; panelden ayrılmadan değişiklikleri okuyabilir, geçmişi gezebilir ve push'layabilirsiniz. git'in kendisi yanlış davrandığında "Claude'a sor" sorunu tek tıkla bir oturuma devreder.

## Paneli açma

Yeni bir sekme ekleyin ve panel türü olarak **Diff**'i seçin veya mevcut bir sekmedeki sekme türü menüsünden geçiş yapın. Panel, kardeş shell'leriyle aynı çalışma dizinine bağlanır — sekmeniz `~/code/api`'deyse, diff paneli o repoyu okur.

| Eylem | macOS | Linux / Windows |
|---|---|---|
| Aktif sekmeyi Diff moduna geçir | <kbd>⌘⇧F</kbd> | <kbd>Ctrl+Shift+F</kbd> |

Dizin bir git deposu değilse panel bunu söyler ve yolunuzdan çekilir.

## Diff görüntüleyici

Changes sekmesi, çalışma ağacının dosya başına değişikliklerini gösterir.

- **Yan yana veya satır içi** — panel başlığında değiştir. Yan yana, GitHub'ın bölünmüş görünümünü taklit eder; satır içi ise GitHub'ın birleşik görünümüdür.
- **Sözdizimi vurgulama** — düzenleyicinizin vurgulayacağı diller için tam dil algılaması.
- **Satır içi hunk genişletme** — bir hunk etrafındaki bağlam satırlarına tıklayarak panelden çıkmadan çevredeki kodu genişletin.
- **Dosya listesi** — panelin kenar çubuğunda değişen dosyalar arasında gezinin.

Değişiklikler panel görünür olduğu sürece her 10 saniyede bir, başka bir araçta kaydederken ise anında yenilenir.

## Commit geçmişi

Geçerli daldaki sayfalı commit logu için **History** sekmesine geçin. Her giriş hash, başlık, yazar ve zamanı gösterir; o commit'te düşen diff'i görmek için tıklayın. Bir dosyanın neden öyle göründüğünü hatırlamak istediğinizde, terminale `git log` için dönmeden faydalıdır.

## Senkronizasyon paneli

Başlık şeridi geçerli dalı, upstream'i ve bir önde/geride sayacını gösterir. Üç eylem:

- **Fetch** — arka planda upstream'e karşı her 3 dakikada bir `git fetch`, ayrıca isteğe bağlı.
- **Pull** — mümkün olduğunda fast-forward.
- **Push** — yapılandırılmış upstream'e push.

Senkronizasyon kasıtlı olarak dardır. Karar gerektiren herhangi bir şeyi reddeder — ayrılmış dallar, kirli çalışma ağaçları, eksik upstream — ve nedenini söyler.

{% call callout('warning', 'Senkronizasyon yürümediğinde') %}
Panelin açıkça raporladığı yaygın hatalar:

- **Upstream yok** — `git push -u` henüz çalıştırılmadı.
- **Auth** — kimlik bilgileri eksik veya reddedildi.
- **Ayrılmış** — yerel ve uzak ikisinde de benzersiz commit'ler var; önce rebase veya merge.
- **Yerel değişiklikler** — commit edilmemiş iş pull'u engelliyor.
- **Reddedildi** — non-fast-forward için push reddedildi.
{% endcall %}

## Claude'a sor

Senkronizasyon başarısız olduğunda, hata bildirimi bir **Claude'a sor** düğmesi sunar. Tıklamak başarısızlık bağlamını — hata türü, ilgili `git` çıktısı ve geçerli dal durumu — aynı çalışma alanındaki Claude sekmesine bir prompt olarak iletir. Claude sonrasında kurtarmayı yürütür: rebase, çakışma çözümü, upstream yapılandırma, hata ne çağırdıysa.

Bu, panelin temel bahsi: yaygın durum için aletler, uzun kuyruk için bir LLM. Bağlam değiştirmiyorsunuz; prompt zaten kullanacağınız oturuma geliyor.

## Sıradaki adımlar

- **[Sekmeler & paneller](/purplemux/tr/docs/tabs-panes/)** — diff panelini Claude oturumunun yanına bölme.
- **[İlk oturum](/purplemux/tr/docs/first-session/)** — Claude izin istemlerinin panelde nasıl yüzeye çıktığı.
- **[Web tarayıcı paneli](/purplemux/tr/docs/web-browser-panel/)** — terminalle yan yana çalıştırılmaya değer diğer panel türü.
