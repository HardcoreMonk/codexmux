---
title: Canlı oturum görünümü
description: Zaman tüneli panelinin gerçekte ne gösterdiği — mesajlar, araç çağrıları, görevler ve istemler, CLI kaydırma tamponu yerine olaylar olarak düzenlenmiş.
eyebrow: Claude Code
permalink: /tr/docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

Bir sekme Claude Code çalıştırırken purplemux ham terminal görünümünün yerine yapılandırılmış bir zaman tüneli koyar. Aynı oturum, aynı JSONL transkripti — ama tarayıp kaydırabileceğiniz ve bağlantı kurabileceğiniz ayrık olaylar olarak düzenlenmiş.

## Neden zaman tüneli kaydırma tamponunu yener

Claude CLI etkileşimlidir. Onun on beş dakika önce ne yaptığını terminalde izlemek, sonradan olan her şeyi geçerek kaydırmak, sarmalanmış satırları okumak ve bir araç çağrısının nerede bitip diğerinin nerede başladığını tahmin etmek demektir.

Zaman tüneli aynı veriyi tutar ve yapı ekler:

- Mesaj, araç çağrısı, görev veya istem başına bir satır
- Birlikte gruplanmış araç girdi ve çıktıları
- Kalıcı çapalar — olaylar tampon dolduğunda yukarıdan kaymaz
- Geçerli adım her zaman geçen-süre sayacı ile altta sabittir

Üst çubuktaki mod düğmesiyle istediğiniz an terminale geçebilirsiniz. Zaman tüneli aynı oturuma açılan bir görünümdür, ayrı bir oturum değil.

## Göreceğiniz şeyler

Zaman tünelindeki her satır, Claude Code JSONL transkriptindeki bir girdiye karşılık gelir:

| Tür | Gösterdiği |
|---|---|
| **Kullanıcı mesajı** | Sohbet baloncuğu olarak prompt'unuz. |
| **Asistan mesajı** | Markdown olarak işlenen Claude yanıtı. |
| **Araç çağrısı** | Araç adı, anahtar argümanlar ve yanıt — `read`, `edit`, `bash`, vb. |
| **Araç grubu** | Ardışık araç çağrıları tek karta daraltılır. |
| **Görev / plan** | Onay kutulu ilerlemeli çok adımlı planlar. |
| **Alt-ajan** | Kendi ilerlemesiyle gruplanmış ajan çağrıları. |
| **İzin istemi** | Claude'un sunduğu seçeneklerle yakalanmış istem. |
| **Sıkıştırma** | Claude bağlamı otomatik sıkıştırırken küçük bir gösterge. |

Uzun asistan mesajları genişletme imkanıyla bir parçacığa daralır; uzun araç çıktıları "daha fazla göster" düğmesiyle kısaltılır.

## Nasıl canlı kalır

Zaman tüneli `/api/timeline` üzerinden bir WebSocket ile beslenir. Sunucu aktif JSONL dosyası üzerinde bir `fs.watch` çalıştırır, eklenen girdileri ayrıştırır ve olduğu gibi tarayıcıya gönderir. Polling yoktur, tam yeniden alma yoktur — ilk yük mevcut girdileri gönderir, sonrası artımlıdır.

Claude `busy` iken ayrıca şunları görürsünüz:

- Geçerli adım için canlı geçen-süre sayaçlı bir spinner
- Geçerli araç çağrısı (örn. "Reading src/lib/auth.ts")
- En son asistan metninden kısa bir parçacık

Bunlar JSONL izleyicisinin metadata geçişinden gelir ve oturum durumunu değiştirmeden güncellenir.

## Kaydırma, çapalar ve geçmiş

Zaten en alttaysanız zaman tüneli otomatik kayar; bir şey okumak için yukarı kaydırırsanız yerinde kalır. En son girişten bir ekran daha yukarı gittiğinizde kayan bir **En alta kaydır** düğmesi belirir.

Uzun oturumlar için, yukarı kaydırdıkça eski girişler talep üzerine yüklenir. Claude oturum kimliği sürdürmeler arasında korunur, böylece dünden bir oturumu açtığınızda kaldığınız yere düşersiniz.

{% call callout('tip', 'Girdiye atla') %}
Zaman tünelinin herhangi bir yerinden <kbd>⌘I</kbd> ile alttaki girdi çubuğuna odaklanın. <kbd>Esc</kbd>, çalışan Claude sürecine bir kesinti gönderir.
{% endcall %}

## Satır içi izin istemleri

Claude bir aracı çalıştırmak veya bir dosyayı düzenlemek istediğinde, istem zaman tüneli içinde modal yerine satır içi belirir. Seçeneğe tıklayabilir, eşleşen sayı tuşuna basabilir veya yok sayıp telefonunuzdan Web Push üzerinden yanıtlayabilirsiniz. Tam akış için [İzin istemleri](/purplemux/tr/docs/permission-prompts/) sayfasına bakın.

## Tek bir sekmede modlar

Üst çubuk, sağdaki panelin aynı oturum için neyi göstereceğini değiştirmenize izin verir:

- **Claude** — zaman tüneli (varsayılan)
- **Terminal** — ham xterm.js görünümü
- **Diff** — çalışma dizini için Git değişiklikleri

Modları değiştirmek hiçbir şeyi yeniden başlatmaz. Oturum üç görünümün arkasında da tmux üzerinde çalışmaya devam eder.

Kısayollar: <kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>.

## Sıradaki adımlar

- **[İzin istemleri](/purplemux/tr/docs/permission-prompts/)** — satır içi onay akışı.
- **[Oturum durumu](/purplemux/tr/docs/session-status/)** — zaman tüneli göstergelerini süren rozetler.
- **[Hızlı promptlar & ekler](/purplemux/tr/docs/quick-prompts-attachments/)** — alttaki girdi çubuğunun yapabilecekleri.
