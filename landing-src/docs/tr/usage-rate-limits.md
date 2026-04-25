---
title: Kullanım & kota sınırları
description: Kenar çubuğunda gerçek zamanlı 5 saatlik ve 7 günlük kota sayaçları, ayrıca tokenler, maliyet ve proje dağılımları için bir istatistik paneli.
eyebrow: Claude Code
permalink: /tr/docs/usage-rate-limits/index.html
---
{% from "docs/callouts.njk" import callout %}

Görev ortasında kota sınırına çarpmak en kötü kesinti türüdür. purplemux, Claude Code'un kota sayılarını kenar çubuğuna çeker ve bir istatistik paneli ekler, böylece kullanım ritminizi bir bakışta görebilirsiniz.

## Kenar çubuğu widget'ı

Kenar çubuğunun altında iki ince çubuk oturur: **5h** ve **7d**. Her biri şunları gösterir:

- Pencerenin tükettiğiniz yüzdesi
- Sıfırlamaya kalan süre
- Mevcut hızınızı korursanız nereye varacağınızı gösteren soluk bir projeksiyon çubuğu

Tam dağılım için herhangi bir çubuğun üzerine gelin — kullanılan yüzde, projeksiyon yüzdesi ve sıfırlama zamanı bağıl bir süre olarak.

Sayılar Claude Code'un kendi statusline JSON'undan gelir. purplemux, Claude statusline'ını her yenilediğinde verileri yerel sunucuya gönderen küçük bir `~/.purplemux/statusline.sh` betiği kurar; bir `fs.watch` arayüzü senkronize tutar.

## Renk eşikleri

Her iki çubuk da kullanım yüzdesine göre renk değiştirir:

| Kullanılan | Renk |
|---|---|
| 0–49 % | mavi-yeşil — rahat |
| 50–79 % | sarı — kendinizi tutun |
| 80–100 % | kırmızı — duvara çarpmak üzeresiniz |

Eşikler açılış sayfasının kota widget'ıyla eşleşir. Sarıyı birkaç kez gördükten sonra kenar çubuğu çevresel bir hız aleti olur — bilinçli olarak fark etmemeye başlar, ama işi pencereler arasında yaymaya başlarsınız.

{% call callout('tip', 'Projeksiyon yüzdeyi yener') %}
Tam çubuğun arkasındaki soluk çubuk bir projeksiyondur — mevcut hızda devam ederseniz sıfırlama zamanında bulunacağınız yer. Projeksiyonun gerçek kullanımdan çok önce %80'i geçmesini izlemek en temiz erken uyarıdır.
{% endcall %}

## İstatistik paneli

Paneli kenar çubuğundan (veya <kbd>⌘⇧U</kbd> ile) açın. Yukarıdan aşağıya beş bölüm:

### Genel bakış kartları

Dört kart: **Toplam oturum**, **Toplam maliyet**, **Bugünün maliyeti**, **Bu ayın maliyeti**. Her kart, önceki döneme göre değişimi yeşil veya kırmızı gösterir.

### Modele göre token kullanımı

Modele ve token türüne — input, output, cache reads, cache writes — göre bölünmüş günlük yığın çubuk grafiği. Model lejandı Claude'un görünen adlarını (Opus / Sonnet / Haiku) ve kenar çubuğu çubuklarıyla aynı renk işlemini kullanır.

Bu, beklenmedik bir maliyet artışının Opus ağırlıklı bir gün olduğunu veya cache reads'in işin çoğunu yaptığını görmenin en kolay yeridir.

### Proje başına dağılım

Kullandığınız her Claude Code projesinin (çalışma dizini) bir tablosu — oturumlar, mesajlar, tokenler ve maliyetle. Yalnızca o proje için günlük grafiği görmek için bir satıra tıklayın.

Paylaşılan makineler veya müşteri işini kişisel hack'lerden ayırmak için yararlıdır.

### Etkinlik & seri

30 günlük günlük etkinlik alan grafiği, ayrıca dört seri metriği:

- **En uzun seri** — ardışık çalışma günlerinin rekoru
- **Mevcut seri** — şu anda art arda kaç gündür çalıştığınız
- **Toplam aktif gün** — dönem içinde sayım
- **Gün başına ortalama oturum**

### Haftalık zaman çizelgesi

Son haftada Claude'u gerçekte ne zaman kullandığınızı gösteren gün × saat ızgarası. Eşzamanlı oturumlar görsel olarak yığılır, böylece "Salı 15:00'te beş oturum" kolayca fark edilir.

## Veri nereden geliyor

Paneldeki her şey, `~/.claude/projects/` altındaki Claude Code'un kendi oturum JSONL'lerinden yerel olarak hesaplanır. purplemux onları okur, ayrıştırılmış sayıları `~/.purplemux/stats/` altında önbelleğe alır ve makineden bir bayt bile göndermez. Dilleri değiştirmek veya önbelleği yeniden oluşturmak hiçbir yere ulaşmaz.

## Sıfırlama davranışı

5 saatlik ve 7 günlük pencereler kayan ve Claude Code hesabınıza bağlıdır. Bir pencere sıfırlandığında çubuk %0'a düşer ve yüzde ile kalan süre bir sonraki sıfırlama zaman damgasından yeniden hesaplanır. purplemux sıfırlamayı kaçırdıysa (sunucu kapalıydı), widget bir sonraki statusline tikinde kendini düzeltir.

## Sıradaki adımlar

- **[Notlar (AI günlük raporu)](/purplemux/tr/docs/notes-daily-report/)** — aynı veri, gün başına özet olarak yazılmış.
- **[Oturum durumu](/purplemux/tr/docs/session-status/)** — kenar çubuğunun sekme başına izlediği diğer şey.
- **[Klavye kısayolları](/purplemux/tr/docs/keyboard-shortcuts/)** — istatistik için <kbd>⌘⇧U</kbd> dahil.
