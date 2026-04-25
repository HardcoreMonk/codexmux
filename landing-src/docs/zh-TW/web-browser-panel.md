---
title: 網頁瀏覽器面板
description: 內建瀏覽器分頁，可測試開發產出，能用 purplemux CLI 操控，並支援行動裝置視窗的裝置模擬器。
eyebrow: 工作區與終端機
permalink: /zh-TW/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

把網頁瀏覽器分頁放在終端機與 Claude 工作階段旁邊。它能跑你的本機開發伺服器、staging 站、任何能連上的內容 — 而且你可以從 `purplemux` CLI 操控它，不必離開 shell。

## 開啟瀏覽器分頁

新增分頁並選擇 **Web browser** 面板類型。在網址列輸入 URL — `localhost:3000`、IP，或完整的 https URL。網址列會將輸入正規化：純主機名稱與 IP 會走 `http://`，其餘走 `https://`。

當 purplemux 是 macOS 原生 App（Electron build）時，面板會以真正的 Chromium webview 執行；從一般瀏覽器存取時則會回退為 iframe。iframe 路徑能應付大多數頁面，但無法執行送出 `X-Frame-Options: deny` 的網站；Electron 路徑沒有這個限制。

{% call callout('note', '原生 App 上體驗最佳') %}
裝置模擬、CLI 截圖、console / network 擷取只在 Electron build 中可用。瀏覽器分頁的回退方案提供網址列、上一頁 / 下一頁與重新整理，但更深的整合需要 webview。
{% endcall %}

## CLI 驅動的導覽

面板提供一個小型 HTTP API，內建的 `purplemux` CLI 對其作了封裝。從任何終端機 — 包括緊鄰瀏覽器面板的那一個 — 都能：

```bash
# 列出分頁，找出 web-browser 分頁的 ID
purplemux tab list -w <workspace-id>

# 讀取目前 URL + 標題
purplemux tab browser url -w <ws> <tabId>

# 截圖到檔案（或用 --full 截整頁）
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# 取得最近的 console log（500 筆 ring buffer）
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# 檢視網路活動，可選擇取得單一回應 body
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# 在分頁中執行 JavaScript 並取得序列化結果
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

CLI 會透過 `~/.purplemux/cli-token` 中的權杖驗證，並從 `~/.purplemux/port` 讀取連接埠。在同一台機器上執行時不需要任何旗標。執行 `purplemux help` 可看到完整指令，`purplemux api-guide` 則顯示底層 HTTP endpoints。

這正是面板對 Claude 的價值：請 Claude 截圖、檢查 console 錯誤、執行測試指令稿 — Claude 用的是和你一樣的 CLI。

## 裝置模擬器

針對行動裝置工作，可把面板切到行動模式。裝置選擇器提供 iPhone SE 到 14 Pro Max、Pixel 7、Galaxy S20 Ultra、iPad Mini 與 iPad Pro 12.9" 的預設值。每個預設包含：

- 寬 / 高
- 裝置像素比
- 對應的行動裝置 user agent

切換直立 / 橫向，並選擇縮放等級（`fit` 適配面板，或固定 `50% / 75% / 100% / 125% / 150%`）。當你切換裝置時，webview 會以新的 UA 重新載入，這樣伺服器端的行動偵測就能看到與你手機相同的內容。

## 下一步

- **[分頁與窗格](/purplemux/zh-TW/docs/tabs-panes/)** — 把瀏覽器放在 Claude 旁邊的分割中。
- **[Git 工作流面板](/purplemux/zh-TW/docs/git-workflow/)** — 另一個專用面板類型。
- **[安裝](/purplemux/zh-TW/docs/installation/)** — macOS 原生 App，完整 webview 整合所在之處。
