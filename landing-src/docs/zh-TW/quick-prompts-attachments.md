---
title: 快速 prompts 與附件
description: 已儲存的 prompt 庫、拖放圖片、檔案附件以及可重用的訊息歷史 — 全都從時間軸底部的輸入列提供。
eyebrow: Claude Code
permalink: /zh-TW/docs/quick-prompts-attachments/index.html
---
{% from "docs/callouts.njk" import callout %}

時間軸下方的輸入列不只是一個 textarea。已儲存的 prompts、附件與訊息歷史都活在這裡，讓你每天打十次的東西不再花你十次的功夫。

## 快速 prompts

快速 prompts 是儲存在 `~/.purplemux/quick-prompts.json` 中的短小命名條目。它們以晶片狀按鈕出現在輸入列上方 — 點一次就會像你親手打的一樣送出 prompt。

預設內建兩個，可隨時停用：

- **Commit** — 執行 `/commit-commands:commit`
- **Simplify** — 執行 `/simplify`

從 **設定 → 快速 prompts** 加入你自己的：

1. 點選 **新增 prompt**。
2. 給它一個名稱（晶片標籤）與內容（送出的內容）。
3. 拖曳重新排序。停用的不會刪除，只會隱藏。

你寫進內容的東西會原樣送出 — 包含 slash commands、多行 prompt，或像「解釋編輯器中目前打開的檔案，並建議一個改進」這樣的模板化請求。

{% call callout('tip', 'Slash commands 也算') %}
快速 prompts 很適合作為 Claude Code slash commands 的一鍵觸發。把「Review this PR」晶片指向 `/review` 就能每次省下幾個按鍵。
{% endcall %}

## 拖放圖片

把圖片檔案（PNG、JPG、WebP 等）拖曳到輸入列上的任何位置即可附加。purplemux 會把檔案上傳到伺服器上的暫存路徑，並自動在你的 prompt 中插入引用。

你也可以：

- 直接從剪貼簿**貼上**圖片
- **點選迴紋針**從檔案對話框挑選
- 每則訊息最多附加 **20 個檔案**

附件待送時，輸入列上方會顯示縮圖列。每個縮圖都有 X 可在送出前移除。

## 其他檔案附件

同一個迴紋針也能用於非圖片檔案 — markdown、JSON、CSV、原始碼，什麼都行。purplemux 會把它們放在暫存目錄並插入路徑，讓 Claude 可以把它們當成請求的一部分 `read`。

這是分享 Claude 自己拿不到的東西最簡單的方法，例如從另一台機器貼來的 stack trace，或來自其他專案的設定檔。

## 行動裝置友善

附件與迴紋針在手機上都是完整大小。從 iOS 分享面板拖曳截圖，或用相機按鈕（Android）直接從相簿附加照片。

輸入列會在窄螢幕重新排版 — 晶片變成水平捲動列，textarea 在捲動前會長到五行。

## 訊息歷史

你在工作區送出的每個 prompt 都會以工作區為單位保留歷史。要重用其中一個：

- 在空白的輸入列按 <kbd>↑</kbd> 逐步瀏覽最近的訊息
- 或打開 **歷史** 選擇器查看可搜尋的清單

舊條目可從選擇器中刪除。歷史與其他工作區資料一起儲存在 `~/.purplemux/` 下，永遠不會送出機外。

## 鍵盤

| 鍵 | 動作 |
|---|---|
| <kbd>⌘I</kbd> | 從工作階段檢視的任何位置聚焦輸入列 |
| <kbd>Enter</kbd> | 送出 |
| <kbd>⇧Enter</kbd> | 插入換行 |
| <kbd>Esc</kbd> | 在 Claude 忙碌時送出 interrupt |
| <kbd>↑</kbd> | （在輸入列空白時）回到前一則訊息歷史 |

## 下一步

- **[即時工作階段檢視](/purplemux/zh-TW/docs/live-session-view/)** — 你的 prompts 與 Claude 回覆呈現的位置。
- **[鍵盤快速鍵](/purplemux/zh-TW/docs/keyboard-shortcuts/)** — 完整繫結表。
- **[權限提示](/purplemux/zh-TW/docs/permission-prompts/)** — 在送出需要核可的請求後會發生什麼事。
