---
title: Tailscale 存取
description: 透過 Tailscale Serve 從手機以 HTTPS 連到 purplemux — 不必設定連接埠轉送，也不必處理憑證。
eyebrow: 行動與遠端
permalink: /zh-TW/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

預設情況下 purplemux 只在本地監聽。Tailscale Serve 是把它公開給其他裝置最乾淨的方式：WireGuard 加密、自動 Let's Encrypt 憑證、零防火牆變更。

## 為何選 Tailscale

- **WireGuard** — 每條連線都是裝置對裝置加密。
- **自動 HTTPS** — Tailscale 會為 `*.<tailnet>.ts.net` 配發真實憑證。
- **不需連接埠轉送** — 你的機器永遠不會對公網開連接埠。
- **iOS 必須使用 HTTPS** — 沒有它，PWA 安裝與 Web Push 都拒絕運作。請見 [PWA 設定](/purplemux/zh-TW/docs/pwa-setup/) 與 [Web Push](/purplemux/zh-TW/docs/web-push/)。

## 前置需求

- 一個 Tailscale 帳號，並在執行 purplemux 的機器上安裝並登入 `tailscale` 守護程式。
- 在 tailnet 上啟用 HTTPS（管理主控台 → DNS → 啟用 HTTPS Certificates，若尚未啟用）。
- purplemux 在預設連接埠 `8022` 上執行（或你設定的 `PORT`）。

## 執行

一行：

```bash
tailscale serve --bg 8022
```

Tailscale 會把你本地的 `http://localhost:8022` 包進 HTTPS，並在 tailnet 中以下列位址公開：

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` 是該機器的主機名稱；`<tailnet>` 是你 tailnet 的 MagicDNS 後綴。在已加入同一 tailnet 的任何其他裝置上打開該 URL 即可登入。

要停止：

```bash
tailscale serve --bg off 8022
```

## 設定完成後可以做什麼

- 在手機上打開該 URL，點選 **分享 → 加入主畫面**，依照 [PWA 設定](/purplemux/zh-TW/docs/pwa-setup/)。
- 從獨立的 PWA 視窗開啟推播：[Web Push](/purplemux/zh-TW/docs/web-push/)。
- 從平板、筆電或另一台桌機連到同一個儀表板 — 工作區狀態即時同步。

{% call callout('tip', 'Funnel vs Serve') %}
`tailscale serve` 把 purplemux 限定在你的 tailnet 內 — 這幾乎永遠是你想要的。`tailscale funnel` 會把它公開到公網，對個人 multiplexer 來說是過頭（且有風險）。
{% endcall %}

## 反向代理回退方案

如果 Tailscale 不是選項，任何具有真實 TLS 憑證的反向代理都可以。你必須設定對的一件事是 **WebSocket upgrades** — purplemux 使用它來處理終端機 I/O、狀態同步與即時時間軸。

Nginx（草稿）：

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy 更簡單 — `reverse_proxy 127.0.0.1:8022` 會自動處理 upgrade headers。

如果沒有轉送 `Upgrade` / `Connection`，儀表板會渲染，但終端機永遠連不上、狀態也會卡住。如果有「半個能用」的感覺，先懷疑這幾個 header。

## 疑難排解

- **HTTPS 尚未配發** — 第一張憑證可能要一分鐘左右。稍候再執行一次 `tailscale serve --bg 8022` 通常就會成功。
- **瀏覽器警告憑證問題** — 確認你打的就是 `<machine>.<tailnet>.ts.net`，而不是 LAN IP。
- **手機顯示「無法連線」** — 確認手機已登入同一 tailnet，且 OS 設定中 Tailscale 為啟用狀態。
- **自簽憑證** — Web Push 不會註冊。請使用 Tailscale Serve 或反向代理上由 ACME 簽發的真實憑證。

## 下一步

- **[PWA 設定](/purplemux/zh-TW/docs/pwa-setup/)** — 既然有了 HTTPS，安裝到主畫面吧。
- **[Web Push 通知](/purplemux/zh-TW/docs/web-push/)** — 開啟背景提醒。
- **[安全與認證](/purplemux/zh-TW/docs/security-auth/)** — 密碼、雜湊，以及暴露於 tailnet 所代表的意義。
