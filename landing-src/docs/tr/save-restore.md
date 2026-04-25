---
title: Düzenleri kaydet & geri yükle
description: Sunucu yeniden başlatmasının ardından bile sekmelerinizin tam bıraktığınız yerde geri gelmesinin nedeni.
eyebrow: Çalışma alanları & Terminal
permalink: /tr/docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux, tarayıcıdaki bir sekmeyi kapatmanın bir oturumu bitirmemesi gerektiği fikri etrafında kuruludur. İki parça birlikte çalışır: tmux shell'leri çalışır halde tutar ve `~/.purplemux/workspaces.json` düzeni hatırlar.

## Neler kalıcı olur

Bir çalışma alanında görebileceğiniz her şey:

- Sekmeler ve sıraları
- Panel bölmeleri ve oranları
- Her sekmenin panel türü — Terminal, Claude, Diff, Web tarayıcı
- Her shell'in çalışma dizini
- Çalışma alanı grupları, isimler ve sıra

`workspaces.json` her düzen değişikliğinde işlemsel olarak güncellenir, bu nedenle dosya her zaman geçerli durumu yansıtır. Disk üzerindeki dosya haritası için [Veri dizini](/purplemux/tr/docs/data-directory/) sayfasına bakın.

## Tarayıcıyı kapatma

Sekmeyi kapatın, yenileyin veya dizüstünüzü kapatın. Hiçbiri oturumları sonlandırmaz.

Her shell, kendine ait `purple` soketinde bir tmux oturumunda yaşar — kişisel `~/.tmux.conf`'unuzdan tamamen yalıtılmıştır. Bir saat sonra `http://localhost:8022`'yi tekrar açın; WebSocket aynı tmux oturumuna geri bağlanır, kaydırma tamponunu yeniden oynatır ve canlı PTY'yi xterm.js'e geri verir.

Bir şey geri yüklemiyorsunuz; yeniden bağlanıyorsunuz.

{% call callout('tip', 'Mobilde de geçerli') %}
Aynı şey telefonunuzda da geçerli. PWA'yı kapatın, cihazı kilitleyin, yarın geri dönün — panel her şey yerinde olacak şekilde yeniden bağlanır.
{% endcall %}

## Sunucu yeniden başlatmasından sonra kurtarma

Yeniden başlatma tmux süreçlerini sonlandırır — sonuçta sıradan OS süreçleri. purplemux bunu bir sonraki başlangıçta halleder:

1. **Düzeni oku** — `workspaces.json` her çalışma alanını, paneli ve sekmeyi tanımlar.
2. **Oturumları paralel olarak yeniden oluştur** — her sekme için, kayıtlı çalışma dizininde yeni bir tmux oturumu açılır.
3. **Claude'u otomatik sürdür** — Claude oturumu çalışan sekmeler `claude --resume {sessionId}` ile yeniden başlatılır, böylece konuşma kaldığı yerden devam eder.

"Paralel" kısmı önemlidir: on sekmeniz varsa, onu ardı ardına değil hepsi birden başlar. Tarayıcıyı açtığınızda düzen zaten orada olur.

## Geri gelmeyen şeyler

Birkaç şey kalıcılaştırılamaz:

- **Bellekteki shell durumu** — ayarladığınız ortam değişkenleri, arka plan işleri, düşünce ortasında REPL'ler.
- **Süreçteki izin istemleri** — sunucu öldüğünde Claude bir izin kararını bekliyorduysa, sürdürmede istemi tekrar görürsünüz.
- **`claude` dışındaki ön plan süreçleri** — `vim` arabellekleri, `htop`, `docker logs -f`. Shell aynı dizinde geri döner; süreç dönmez.

Bu standart tmux sözleşmesidir: shell hayatta kalır, içindeki süreçler her zaman değil.

## Manuel kontrol

Normalde bunlara dokunmaya gerek yoktur ama meraklılar için:

- tmux soketi `purple` adındadır. `tmux -L purple ls` ile inceleyin.
- Oturumlar `pt-{workspaceId}-{paneId}-{tabId}` olarak adlandırılır.
- purplemux çalışırken `workspaces.json`'u düzenlemek güvenli değildir — sunucu onu açık tutar ve üzerine yazar.

Daha derin hikaye için (ikili protokol, geri basınç, JSONL izleme) açılış sayfasındaki [Nasıl çalışır](/purplemux/#how) bölümüne bakın.

## Sıradaki adımlar

- **[Çalışma alanları & gruplar](/purplemux/tr/docs/workspaces-groups/)** — çalışma alanı başına neler kaydedilir.
- **[Sekmeler & paneller](/purplemux/tr/docs/tabs-panes/)** — sekme başına neler kaydedilir.
- **[Tarayıcı desteği](/purplemux/tr/docs/browser-support/)** — mobil arka plan sekmeleri ve yeniden bağlanmalarla ilgili bilinen tuhaflıklar.
