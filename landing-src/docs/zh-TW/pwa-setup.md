---
title: PWA 設定
description: 在 iOS Safari 與 Android Chrome 把 purplemux 加入主畫面，獲得全螢幕、類原生 App 的體驗。
eyebrow: 行動與遠端
permalink: /zh-TW/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

把 purplemux 安裝為漸進式網頁應用程式（PWA），會把瀏覽器分頁變成主畫面上獨立的圖示，附上全螢幕版面與適切的啟動畫面。在 iOS 上，這也是 Web Push 的前提。

## 你會得到什麼

- **全螢幕版面** — 沒有瀏覽器外框，給終端機與時間軸更多垂直空間。
- **App 圖示** — purplemux 從主畫面啟動，就像任何原生 App。
- **啟動畫面** — purplemux 為 iPhone 提供逐型號的啟動圖，讓啟動轉場感覺像原生。
- **Web Push**（僅限 iOS） — 推播通知只在安裝為 PWA 後才會觸發。

manifest 由 `/api/manifest` 提供，註冊 `display: standalone`、purplemux 標誌與主題色彩。

## 安裝前

頁面必須能透過 **HTTPS** 存取，PWA 才能運作。從 `localhost` 在 Chrome 上可運作（loopback 例外），但 iOS Safari 拒絕透過純 HTTP 安裝。乾淨的方法是 Tailscale Serve — 請見 [Tailscale 存取](/purplemux/zh-TW/docs/tailscale/)。

{% call callout('warning', 'iOS 需要 Safari 16.4 或更新版本') %}
較舊的 iOS 版本可以安裝 PWA，但不會收到 Web Push。如果推播對你很重要，請先更新 iOS。逐瀏覽器的細節在 [瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)。
{% endcall %}

## iOS Safari

1. 在 **Safari** 中打開 purplemux 的 URL（其他 iOS 瀏覽器不會對 PWA 顯示加入主畫面）。
2. 點選底部工具列的 **分享** 圖示。
3. 在動作面板中向下捲，選擇 **加入主畫面**。
4. 想改名字就改，然後點選右上角的 **新增**。
5. 從新的主畫面圖示啟動 purplemux — 它會以全螢幕打開。

從圖示首次啟動的那一刻，iOS 才會把它當作真正的 PWA。任何推播權限提示都應該從這個獨立視窗裡面觸發，而不是在普通的 Safari 分頁中。

## Android Chrome

Chrome 會自動偵測可安裝的 manifest 並提供橫幅。如果沒看到：

1. 在 **Chrome** 中打開 purplemux 的 URL。
2. 點選右上角的 **⋮** 選單。
3. 選擇 **安裝應用程式**（有時標記為 **加入主畫面**）。
4. 確認。圖示會出現在主畫面與 App 抽屜。

Samsung Internet 的行為相同 — 安裝提示通常會自動出現。

## 確認安裝

從主畫面圖示打開 purplemux。瀏覽器網址列應該不見了。若仍看到瀏覽器 UI，表示 manifest 未生效 — 通常是因為頁面是透過純 HTTP 或不尋常的 proxy 載入。

你也可以在 **設定 → 通知** 確認 — 一旦 PWA 安裝完畢且 Web Push 受支援，切換鈕會變成可用。

## 更新 PWA

不需要做任何事。PWA 載入的是你 purplemux 實例所提供的同一個 `index.html`，所以 purplemux 升級後，下次啟動 PWA 也會跟著升級。

要移除它，長按圖示並選擇 OS 原生的解除安裝動作。

## 下一步

- **[Web Push 通知](/purplemux/zh-TW/docs/web-push/)** — PWA 安裝完後，開啟背景提醒。
- **[Tailscale 存取](/purplemux/zh-TW/docs/tailscale/)** — 取得 iOS 所需的 HTTPS URL。
- **[瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)** — 完整相容性表。
