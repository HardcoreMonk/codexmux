---
title: 快速開始
description: 只要 Node.js 和 tmux，一分鐘內就能讓 purplemux 執行起來。
eyebrow: 開始上手
permalink: /zh-TW/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是一款基於網頁的多工器，能在單一儀表板上管理所有 Claude Code 工作階段，由 `tmux` 提供持久化能力，並且能同時在電腦桌前與手機上使用。

## 開始之前

執行 purplemux 的主機需要兩樣東西。

- **Node.js 20 或更新版本** — 用 `node -v` 檢查。
- **tmux** — 用 `tmux -V` 檢查。3.0 以上皆可。

{% call callout('note', '僅支援 macOS / Linux') %}
Windows 並不在官方支援之列。purplemux 倚賴 `node-pty` 與 tmux，這兩者在 Windows 上無法原生執行。WSL2 通常可以運作，但不在我們的測試範圍內。
{% endcall %}

## 執行

只要一行指令，無需全域安裝。

```bash
npx purplemux
```

purplemux 會在 `8022` 連接埠上啟動。打開瀏覽器：

```
http://localhost:8022
```

第一次啟動時會引導你建立密碼以及第一個工作區。

{% call callout('tip') %}
想要永久安裝？`pnpm add -g purplemux && purplemux` 一樣可用。升級也只需要 `pnpm up -g purplemux` 一次。
{% endcall %}

## 開啟一個 Claude 工作階段

在儀表板中：

1. 在任意工作區點選 **新分頁**。
2. 選擇 **Claude** 範本（或在一般終端機中執行 `claude`）。
3. purplemux 會偵測到正在執行的 Claude CLI，並開始顯示狀態、即時時間軸與權限提示。

即使你關閉瀏覽器，工作階段也會保留 — tmux 會在伺服器上繼續維持程序運作。

## 從手機連線

預設情況下，purplemux 只在 `localhost` 上監聽。若要安全地從外部存取，建議使用 Tailscale Serve（WireGuard + 自動 HTTPS，無需設定連接埠轉送）：

```bash
tailscale serve --bg 8022
```

在手機上打開 `https://<machine>.<tailnet>.ts.net`，點選 **分享 → 加入主畫面**，purplemux 就會變成 PWA，並能在背景接收 Web Push 通知。

完整設定請見 [Tailscale 存取](/purplemux/zh-TW/docs/tailscale/)，iOS 與 Android 的具體步驟請參考 [PWA 設定](/purplemux/zh-TW/docs/pwa-setup/)。

## 下一步

- **[安裝](/purplemux/zh-TW/docs/installation/)** — 各平台細節、macOS 原生 App、自動啟動。
- **[瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)** — 桌面與行動裝置相容性表。
- **[第一個工作階段](/purplemux/zh-TW/docs/first-session/)** — 儀表板導覽。
- **[鍵盤快速鍵](/purplemux/zh-TW/docs/keyboard-shortcuts/)** — 所有繫結一覽表。
