---
title: Editör entegrasyonu
description: Geçerli klasörü editörünüzde açın — VS Code, Cursor, Zed, code-server veya özel bir URL — başlıktan doğrudan.
eyebrow: Özelleştirme
permalink: /tr/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

Her çalışma alanının başlığında bir **EDITOR** düğmesi vardır. Tıklamak, aktif oturumun klasörünü seçtiğiniz editörde açar. Bir ön ayar seçin, bir URL'ye işaret edin veya sistem işleyicisine güvenin, hazırsınız.

## Seçiciyi açın

Ayarlar (<kbd>⌘,</kbd>) → **Editor** sekmesi. Bir ön ayarlar listesi ve seçime bağlı olarak bir URL alanı göreceksiniz.

## Mevcut ön ayarlar

| Ön ayar | Yaptığı |
|---|---|
| **Code Server (Web)** | Host'lanmış bir [code-server](https://github.com/coder/code-server) örneğini `?folder=<path>` ile açar. URL gerektirir. |
| **VS Code** | `vscode://file/<path>?windowId=_blank` tetikler. |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **Custom URL** | `{folder}` / `{folderEncoded}` yer tutuculu, sizin kontrol ettiğiniz bir URL şablonu. |
| **Disabled** | EDITOR düğmesini tamamen gizler. |

Dört masaüstü-IDE ön ayarı (VS Code, Cursor, Windsurf, Zed) bir URI işleyicisi kaydetmek için OS'a güvenir. IDE'yi yerelinize kurduysanız, bağlantı beklendiği gibi çalışır.

## Web ile yerel

Her ön ayarın bir klasörü nasıl açtığında anlamlı bir fark vardır:

- **code-server** tarayıcının içinde çalışır. URL, host ettiğiniz sunucuya işaret eder (sizinkine, ağınızda veya Tailscale arkasında). EDITOR düğmesine tıklayın ve yeni bir sekme klasörü yükler.
- **Yerel IDE'ler** (VS Code, Cursor, Windsurf, Zed) IDE'nin *tarayıcıyı çalıştıran makinede* yüklü olmasını gerektirir. Bağlantı OS'a verilir, OS kayıtlı işleyiciyi başlatır.

purplemux'ı telefonunuzda kullanıyorsanız, yalnızca code-server ön ayarı çalışır — telefonlar `vscode://` URL'lerini bir masaüstü uygulamasına açamaz.

## code-server kurulumu

Tipik bir yerel kurulum, üründe yüzeye çıkar:

```bash
# macOS'ta kur
brew install code-server

# Çalıştır
code-server --port 8080

# Tailscale ile dış erişim (opsiyonel)
tailscale serve --bg --https=8443 http://localhost:8080
```

Sonra Editor sekmesinde URL'yi code-server'ın erişilebilir olduğu adrese ayarlayın — yerel için `http://localhost:8080` veya Tailscale Serve arkasına koyduysanız `https://<machine>.<tailnet>.ts.net:8443`. purplemux URL'nin `http://` veya `https://` ile başladığını doğrular ve `?folder=<absolute path>`'i otomatik ekler.

{% call callout('note', '8022 olmayan bir port seçin') %}
purplemux zaten `8022`'de yaşıyor. code-server'ı farklı bir portta çalıştırın (örnekte `8080`), böylece kavga etmesinler.
{% endcall %}

## Özel URL şablonu

Custom ön ayarı, URL'sinde bir klasör alan herhangi bir şeye — Coder çalışma alanları, Gitpod, Theia, dahili bir araç — işaret etmenize izin verir. Şablon **en az bir** yer tutucu içermelidir:

- `{folder}` — mutlak yol, kodlanmamış.
- `{folderEncoded}` — URL kodlanmış.

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux şablonu kayıt zamanında doğrular ve yer tutucusu olmayan bir tanesini reddeder.

## Düğmeyi devre dışı bırakma

**Disabled**'ı seçin. Düğme çalışma alanı başlığından kaybolur.

## Sıradaki adımlar

- **[Kenar çubuğu & Claude seçenekleri](/purplemux/tr/docs/sidebar-options/)** — kenar çubuğu öğelerini yeniden sıralayın, Claude bayraklarını açıp kapatın.
- **[Özel CSS](/purplemux/tr/docs/custom-css/)** — daha fazla görsel ayar.
- **[Tailscale](/purplemux/tr/docs/tailscale/)** — code-server için de güvenli dış erişim.
