---
title: 即時工作階段檢視
description: 時間軸面板實際顯示什麼 — 訊息、工具呼叫、任務與 prompts，全部以事件而非 CLI 卷軸的形式呈現。
eyebrow: Claude Code
permalink: /zh-TW/docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

當分頁正在執行 Claude Code 時，purplemux 會以結構化的時間軸取代純終端機檢視。一樣的工作階段、一樣的 JSONL 紀錄 — 但被排成可掃視、可滾動、可連結的離散事件。

## 為何時間軸勝過卷軸

Claude CLI 是互動式的。要查看十五分鐘前它做了什麼，意味著要在終端機中滾過此後發生的所有事情、讀換行包裹的字串、猜某個工具呼叫在哪結束、下一個又從哪開始。

時間軸保留同樣的資料並加上結構：

- 每則訊息、工具呼叫、任務或 prompt 各一列
- 工具輸入與輸出歸在一起
- 永久錨點 — 緩衝區滿了事件也不會滑出頂部
- 目前步驟永遠釘在底部，附上經過時間計數器

你隨時都可以用頂部列的模式切換鈕回到終端機。時間軸是同一工作階段的另一種檢視，而不是另一個工作階段。

## 你會看到什麼

時間軸中的每一列對應 Claude Code JSONL 紀錄中的一筆條目：

| 類型 | 顯示內容 |
|---|---|
| **使用者訊息** | 你的 prompt，以聊天氣泡呈現。 |
| **助理訊息** | Claude 的回覆，以 Markdown 渲染。 |
| **工具呼叫** | 工具名稱、關鍵參數與回應 — `read`、`edit`、`bash` 等。 |
| **工具群組** | 連續的工具呼叫摺疊成一張卡。 |
| **任務 / 計畫** | 多步驟計畫，含勾選進度。 |
| **Sub-agent** | Agent 呼叫與其進度群組在一起。 |
| **權限提示** | 攔截到的提示，含 Claude 提供的相同選項。 |
| **壓縮中** | Claude 在自動壓縮 context 時的輕微指示。 |

冗長的助理訊息會摺疊成片段，含展開鈕；冗長的工具輸出會被截斷，附上「顯示更多」切換鈕。

## 它如何保持即時

時間軸由 `/api/timeline` 上的 WebSocket 餵入。伺服器對作用中的 JSONL 檔案執行 `fs.watch`，解析新加入的條目並即時推送給瀏覽器。沒有輪詢、沒有完整重新抓取 — 初始 payload 送出已存在的條目，之後一切都是增量。

當 Claude 處於 `busy` 時，你還會看到：

- 帶有目前步驟即時經過時間的 spinner
- 目前的工具呼叫（例如「Reading src/lib/auth.ts」）
- 最近一段助理文字的簡短片段

這些來自 JSONL 監看器的 metadata pass，更新時不會改變工作階段狀態。

## 滾動、錨點與歷史

當你已經在底部時，時間軸會自動滾動；當你向上滾去讀某段內容時則會停住。當你高於最新條目超過一個螢幕時，會出現浮動的 **回到底部** 按鈕。

對於長工作階段，較舊的條目會在你向上滾動時按需載入。Claude 工作階段 ID 會在恢復時保留，所以你昨天接續下來的工作階段會回到你離開的地方。

{% call callout('tip', '跳到輸入框') %}
在時間軸的任何位置按 <kbd>⌘I</kbd> 即可聚焦底部的輸入列。<kbd>Esc</kbd> 會對正在執行的 Claude 程序送出 interrupt。
{% endcall %}

## 行內權限提示

當 Claude 要求執行工具或編輯檔案時，提示會出現在時間軸的行內，而非以 modal 顯示。你可以點選選項、按下對應數字鍵，或不予理會、改從手機透過 Web Push 回應。完整流程請見 [權限提示](/purplemux/zh-TW/docs/permission-prompts/)。

## 單一分頁中的多種模式

頂部列可切換右側面板針對同一工作階段顯示什麼：

- **Claude** — 時間軸（預設）
- **Terminal** — 原始 xterm.js 檢視
- **Diff** — 工作目錄的 Git 變更

切換模式不會重新啟動任何東西。工作階段在三種檢視背後始終在 tmux 上執行。

快速鍵：<kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>。

## 下一步

- **[權限提示](/purplemux/zh-TW/docs/permission-prompts/)** — 行內核可流程。
- **[工作階段狀態](/purplemux/zh-TW/docs/session-status/)** — 驅動時間軸指示的徽章。
- **[快速 prompts 與附件](/purplemux/zh-TW/docs/quick-prompts-attachments/)** — 底部輸入列能做什麼。
