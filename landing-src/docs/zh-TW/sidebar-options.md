---
title: 側邊欄與 Claude 選項
description: 重新排序與隱藏側邊欄捷徑、管理快速 prompt 庫、切換 Claude CLI 旗標。
eyebrow: 自訂
permalink: /zh-TW/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

側邊欄與輸入列由幾個你可以重塑的小清單組成 — 側邊欄底部的捷徑連結、輸入列上方的 prompt 按鈕。設定中的 Claude 分頁則放著針對從儀表板啟動的工作階段的 CLI 級切換。

## 側邊欄項目

設定（<kbd>⌘,</kbd>）→ **側邊欄** 分頁。這份清單控制側邊欄底部的捷徑列 — 連到儀表板、內部工具，或任何可由 URL 定址的東西。

每一列都有抓取握把、名稱、URL 與切換鈕。你可以：

- **拖曳** 抓取握把以重新排序。內建與自訂項目都能自由移動。
- **切換** 開關以隱藏項目而不刪除。
- **編輯** 自訂項目（鉛筆圖示） — 變更名稱、圖示或 URL。
- **刪除** 自訂項目（垃圾桶圖示）。
- **重設為預設** — 還原內建項目、刪除所有自訂項目、清除排序。

### 加入自訂項目

點選底部的 **新增項目**。會出現一個小表單：

- **名稱** — 顯示為 tooltip 與標籤。
- **圖示** — 從可搜尋的 lucide-react 圖示集中挑選。
- **URL** — 任何 `http(s)://...` 都行。內部 Grafana、Vercel 儀表板、內部管理工具皆可。

點選儲存後，項目會出現在清單底部。再拖到你想要的位置。

{% call callout('note', '內建項目可隱藏，無法刪除') %}
內建項目（purplemux 出廠就有的）只有切換鈕與抓取握把 — 沒有編輯或刪除。它們會一直在那兒以防你改變主意。自訂項目則有完整功能。
{% endcall %}

## 快速 prompts

設定 → **快速 Prompts** 分頁。這些是位於 Claude 輸入欄上方的按鈕 — 一鍵送出預先寫好的訊息。

模式與側邊欄項目相同：

- 拖曳重新排序。
- 切換以隱藏。
- 編輯 / 刪除自訂 prompt。
- 重設為預設。

新增 prompt 時會請你填 **名稱**（按鈕標籤）與 **prompt** 本身（多行文字）。把它用在你經常輸入的事情：「執行測試套件」、「總結最近一次 commit」、「檢視目前 diff」。

## Claude CLI 選項

設定 → **Claude** 分頁。這些旗標影響 *purplemux 在新分頁中啟動 Claude CLI 的方式* — 對已執行的工作階段沒有影響。

### Skip Permission Checks

在 `claude` 指令中加入 `--dangerously-skip-permissions`。Claude 會執行工具與編輯檔案時不再每次詢問核可。

這是官方 CLI 公開的同一旗標 — purplemux 不會在它之上放鬆任何安全性。打開前請先閱讀 [Anthropic 的文件](https://docs.anthropic.com/en/docs/claude-code/cli-reference)。把它當作只在受信任工作區才啟用的選項。

### Show Terminal with Claude

當設為 **開**（預設）：Claude 分頁會在同一視窗中並排顯示即時工作階段檢視 *與* 底層終端機窗格，這樣你想跳進 shell 隨時都行。

當設為 **關**：新的 Claude 分頁會以摺疊終端機的形式打開。工作階段檢視會占滿整個窗格。你仍可逐分頁手動展開終端機；這只變更新建分頁的預設值。

如果你大多透過時間軸檢視操作 Claude，並想要更乾淨的預設，就把它關掉。

## 下一步

- **[主題與字型](/purplemux/zh-TW/docs/themes-fonts/)** — 淺色、深色、跟隨系統；字級預設。
- **[編輯器整合](/purplemux/zh-TW/docs/editor-integration/)** — 連接 VS Code、Cursor、code-server。
- **[第一個工作階段](/purplemux/zh-TW/docs/first-session/)** — 重新熟悉儀表板版面。
