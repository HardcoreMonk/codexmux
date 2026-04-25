---
title: 主題與字型
description: 淺色、深色或跟隨系統；三種字級；單一設定面板。
eyebrow: 自訂
permalink: /zh-TW/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 提供一套一致的視覺風格，加上一小組切換：應用程式主題、字級，以及獨立的終端機調色盤。本頁涵蓋前兩者 — 終端機色彩在另一頁說明。

## 開啟設定

按 <kbd>⌘,</kbd>（macOS）或 <kbd>Ctrl,</kbd>（Linux）開啟設定。**一般** 分頁就是主題與字級的所在位置。

你也可以點選頂部列的齒輪圖示。

## 應用程式主題

三種模式，立即套用：

| 模式 | 行為 |
|---|---|
| **淺色** | 不論 OS 偏好設定，強制淺色主題。 |
| **深色** | 強制深色主題。 |
| **跟隨系統** | 跟隨 OS — macOS / GNOME / KDE 在淺/深之間切換時自動跟著切換。 |

主題儲存於 `~/.purplemux/config.json` 的 `appTheme`，並同步到所有連線到伺服器的瀏覽器分頁。在 macOS 原生 App 上，OS 標題列也會跟著更新。

{% call callout('note', '為深色而設計') %}
品牌建立在帶有深紫色調的中性色之上，深色模式把 chroma 維持在零，呈現嚴格無彩的表面。淺色模式套用幾乎不可察覺的紫色色相（hue 287）以增加溫度。兩者都為長時間工作調校過；選你眼睛喜歡的就好。
{% endcall %}

## 字級

三個預設值，以按鈕群組呈現：

- **一般** — 預設；root font-size 跟隨瀏覽器。
- **大** — root font-size 設為 `18px`。
- **特大** — root font-size 設為 `20px`。

由於整個 UI 都以 `rem` 為單位，切換預設值會同時縮放整個介面 — 側邊欄、對話框、終端機。變更會即時套用，無需重新載入。

## 哪些會變、哪些不會

字級會縮放 **UI 外框與終端機文字**。它不會改變：

- 標題層級（相對大小維持不變）
- 間距 — 比例保留
- 程式碼區塊語法樣式

如果你想微調個別元素（例如只調整終端機，或只調整側邊欄），請見 [自訂 CSS](/purplemux/zh-TW/docs/custom-css/)。

## 跨裝置共用，非每瀏覽器獨立

設定儲存在伺服器，不在 localStorage。在筆電切到深色，手機也會跟著切到深色 — 從手機打開 `https://<host>/`，變更已經就緒。

如果你想讓行動裝置與桌面看起來不同，目前還不支援；如果你需要請開 issue。

## 下一步

- **[自訂 CSS](/purplemux/zh-TW/docs/custom-css/)** — 覆寫個別色彩與間距。
- **[終端機主題](/purplemux/zh-TW/docs/terminal-themes/)** — xterm.js 獨立的調色盤。
- **[鍵盤快速鍵](/purplemux/zh-TW/docs/keyboard-shortcuts/)** — 所有繫結一覽表。
