---
title: 瀏覽器支援
description: 桌面與行動裝置相容性表，以及你會遇到的瀏覽器差異說明。
eyebrow: 開始上手
permalink: /zh-TW/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是網頁應用程式，使用體驗會取決於開啟它的瀏覽器。以下是我們實際測試的版本 — 較舊的瀏覽器可能也能運作，但不在支援範圍內。

## 桌面

| 瀏覽器 | 最低版本 | 備註 |
|---|---|---|
| Chrome | 110+ | 推薦使用。完整支援 PWA 與 Web Push。 |
| Edge | 110+ | 與 Chrome 同引擎，支援程度相同。 |
| Safari | 17+ | 在 macOS Sonoma+ 完整支援 PWA。Web Push 需 macOS 13+ 並安裝為 PWA。 |
| Firefox | 115+ ESR | 運作良好。PWA 安裝需手動進行（沒有自動安裝提示）。 |

所有功能 — xterm.js 終端機、即時時間軸、Claude 工作階段檢視、Git diff 面板 — 在這些引擎上都能一致運作。

## 行動裝置

| 瀏覽器 | 最低版本 | 備註 |
|---|---|---|
| iOS Safari | **16.4+** | Web Push 必備。必須先 **加入主畫面**；一般分頁中不會觸發推播。 |
| Android Chrome | 110+ | Web Push 在一般分頁中也能運作，但仍建議安裝為 PWA 以獲得全螢幕版面。 |
| Samsung Internet | 22+ | 可運作。安裝提示會自動出現。 |

{% call callout('warning', 'iOS Safari ≥ 16.4 是分水嶺') %}
Apple 直到 Safari 16.4（2023 年 3 月）才在 iOS 加入 Web Push。較舊的 iOS 仍能使用儀表板，但即使安裝了 PWA 也不會收到推播通知。
{% endcall %}

## 功能需求

purplemux 倚賴若干現代瀏覽器 API。如果缺少其中任何一項，App 會優雅降級，但會損失對應功能。

| API | 用途 | 降級行為 |
|---|---|---|
| WebSocket | 終端機 I/O、狀態同步、時間軸 | 硬性需求 — 無替代方案。 |
| Clipboard API | `npx purplemux` 複製、程式碼區塊複製 | 若不支援則隱藏按鈕。 |
| Notifications API | 桌面 / 行動推播 | 略過 — 仍會在應用程式內看到狀態。 |
| Service Workers | PWA + Web Push | 僅作為一般網頁應用程式提供。 |
| IntersectionObserver | 即時工作階段時間軸、導覽顯示 | 元素呈現但無動畫。 |
| `backdrop-filter` | 半透明導覽列、對話框 | 回退為實心著色背景。 |
| CSS `color-mix()` + OKLCH | 主題變數 | Safari < 16.4 會失去部分著色狀態。 |

## 我的瀏覽器可以嗎？

purplemux 內建自我檢查，位於 **設定 → 瀏覽器檢查**。它會執行上述相同的測試，並對每個功能顯示綠 / 黃 / 紅徽章，無需閱讀規格書即可確認。

## 已知差異

- **Safari 17 + 私密視窗** — IndexedDB 已停用，所以工作區快取不會跨重啟保留。請改用一般視窗。
- **iOS Safari + 背景分頁** — 終端機在背景約 30 秒後會被自動關閉。tmux 仍維持實際工作階段運作；返回時 UI 會重新連線。
- **Firefox + Tailscale Serve 憑證** — 若使用非 `ts.net` 的自訂 tailnet 名稱，Firefox 對 HTTPS 信任會比 Chrome 嚴格。接受憑證一次後就會記住。
- **自簽憑證** — Web Push 完全無法註冊。請使用 Tailscale Serve（自動 Let's Encrypt）或真實網域 + 反向代理。

## 不支援

- **Internet Explorer** — 永遠不支援。
- **UC Browser、Opera Mini、Puffin** — 代理式瀏覽器會破壞 WebSocket，無法運作。
- **任何超過 3 年未更新的瀏覽器** — 我們的 CSS 使用了需要 2023 年以後引擎的 OKLCH 色彩與 container queries。

如果你使用了不尋常的設定且某些功能無法運作，請[提交 issue](https://github.com/subicura/purplemux/issues)，附上你的 user agent 與自我檢查的輸出。
