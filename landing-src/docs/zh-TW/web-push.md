---
title: Web Push 通知
description: 即使瀏覽器分頁已關閉，仍能在需要輸入與工作完成狀態下收到背景推播提醒。
eyebrow: 行動與遠端
permalink: /zh-TW/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push 讓 purplemux 在 Claude 工作階段需要你關注時 — 權限提示、完成的任務 — 提醒你，即使分頁已關閉也行。點選通知後，你會直接落到那個工作階段。

## 哪些情況會觸發通知

purplemux 對你在側邊欄看到的彩色徽章相同的狀態切換觸發推播。

- **需要輸入** — Claude 遇到權限提示或詢問了問題。
- **工作完成** — Claude 完成一輪（**待檢視** 狀態）。

閒置與執行中的切換刻意不推播。它們是雜訊。

## 啟用

切換鈕在 **設定 → 通知**。步驟：

1. 打開 **設定 → 通知** 並切換為 **開**。
2. 瀏覽器會請求通知權限 — 同意。
3. purplemux 用伺服器的 VAPID 金鑰註冊一個 Web Push 訂閱。

訂閱會儲存於 `~/.purplemux/push-subscriptions.json`，並識別你的特定瀏覽器/裝置。在每個你想接收通知的裝置上重複以上步驟。

{% call callout('warning', 'iOS 需要 Safari 16.4 + PWA') %}
在 iPhone 與 iPad 上，Web Push 只在你把 purplemux 加入主畫面並從該圖示啟動之後才會運作。請從獨立的 PWA 視窗中打開設定頁 — 在普通的 Safari 分頁中通知權限提示不會生效。請先設定 PWA：[PWA 設定](/purplemux/zh-TW/docs/pwa-setup/)。
{% endcall %}

## VAPID 金鑰

purplemux 在第一次啟動時會產生一組應用程式伺服器 VAPID 金鑰對，並儲存於 `~/.purplemux/vapid-keys.json`（mode `0600`）。你不需要做任何事 — 訂閱時公鑰會自動提供給瀏覽器。

如果你想重設所有訂閱（例如金鑰輪替後），刪除 `vapid-keys.json` 與 `push-subscriptions.json` 並重啟 purplemux。每個裝置都需要重新訂閱。

## 背景傳遞

訂閱後，你的手機會透過 OS 推播服務收到通知：

- **iOS** — 經由 Safari 的 Web Push 橋接的 APNs。傳遞為盡力而為，若手機被嚴重節流可能會被合併。
- **Android** — Chrome 的 FCM。通常即時。

無論 purplemux 是否在前景，通知都會抵達。如果儀表板目前正在你的*任一*裝置上可見，purplemux 會略過推播以避免雙重提醒。

## 點選跳入

點選通知會直接打開 purplemux 並切到觸發通知的工作階段。如果 PWA 已在執行，焦點會移到對應分頁；否則 App 會啟動並直接導覽到那裡。

## 疑難排解

- **切換鈕灰色不可用** — 不支援 Service Workers 或 Notifications API。請執行 **設定 → 瀏覽器檢查**，或參見 [瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)。
- **權限被拒** — 在瀏覽器設定中清除該站台的通知權限，再到 purplemux 重新切換。
- **iOS 收不到推播** — 確認你是從主畫面圖示啟動，而非 Safari。確認 iOS 是 **16.4 或更新**。
- **自簽憑證** — Web Push 會拒絕註冊。請使用 Tailscale Serve 或帶有真實憑證的反向代理。請見 [Tailscale 存取](/purplemux/zh-TW/docs/tailscale/)。

## 下一步

- **[PWA 設定](/purplemux/zh-TW/docs/pwa-setup/)** — iOS 推播必備。
- **[Tailscale 存取](/purplemux/zh-TW/docs/tailscale/)** — 對外傳遞所需的 HTTPS。
- **[安全與認證](/purplemux/zh-TW/docs/security-auth/)** — `~/.purplemux/` 下還有什麼。
