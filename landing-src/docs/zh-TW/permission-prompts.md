---
title: 權限提示
description: purplemux 如何攔截 Claude Code 的「我可以執行嗎？」對話，讓你在儀表板、鍵盤或手機上核可。
eyebrow: Claude Code
permalink: /zh-TW/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code 預設會在權限對話上阻塞 — 工具呼叫、檔案寫入等等。purplemux 會在對話一出現的瞬間捕捉，並把它送到你最近能用到的裝置上。

## 哪些會被攔截

Claude Code 會因多種原因觸發 `Notification` hook。purplemux 只把兩種通知類型視為權限提示：

- `permission_prompt` — 標準的「允許執行此工具？」對話
- `worker_permission_prompt` — 來自 sub-agent 的同類對話

其餘（閒置提醒等）在狀態端會被忽略，不會把分頁翻成 **needs-input**，也不會送出推播。

## 觸發時會發生什麼

1. Claude Code 觸發 `Notification` hook。`~/.purplemux/status-hook.sh` 把事件與通知類型 POST 到本機伺服器。
2. 伺服器把分頁狀態翻成 **needs-input**（琥珀色脈動），並透過狀態 WebSocket 廣播這項變更。
3. 儀表板把提示**內嵌渲染在時間軸上**，附上 Claude 提供的相同選項 — 沒有 modal、沒有 context 切換。
4. 如果你授予了通知權限，會針對 `needs-input` 觸發 Web Push 與 / 或桌面通知。

Claude CLI 本身仍在等待 stdin。purplemux 從 tmux 讀取提示的選項，並在你選一個時把答案轉送回去。

## 如何回應

三種等價方式：

- **點擊**時間軸中的選項。
- **按下數字** — <kbd>1</kbd>、<kbd>2</kbd>、<kbd>3</kbd> — 對應選項索引。
- **點選手機上的推播**，會直接深層連結到該提示，從那裡選擇。

一旦你選了，purplemux 會把輸入送進 tmux，分頁會切回 **busy**，Claude 從中斷處繼續。你不必另外確認 — 點擊*就是*確認。

{% call callout('tip', '連續提示會自動重新讀取') %}
如果 Claude 連續問了好幾個問題，下一個 `Notification` 一抵達時，行內提示會以新的選項重新渲染。你不必先把上一個關掉。
{% endcall %}

## 行動裝置流程

裝好 PWA 並授予通知權限後，無論瀏覽器分頁是開著、在背景或已關閉，Web Push 都會觸發：

- 通知內容是「Input Required」並指出工作階段。
- 點選後 purplemux 會打開並聚焦到該分頁。
- 行內提示已渲染好；一觸即可選擇。

這就是設定 [Tailscale + PWA](/purplemux/zh-TW/docs/quickstart/#從手機連線) 的主要原因 — 它讓核可跟著你離開書桌也能進行。

## 當選項無法解析時

在罕見情況下（提示在 purplemux 讀到之前已捲出 tmux scrollback），選項清單會回傳空的。時間軸會顯示「無法讀取提示」卡片，並以 backoff 重試最多四次。如果仍失敗，請切換到該分頁的 **Terminal** 模式，並在原始 CLI 中回應 — 底層的 Claude 程序仍在等待。

## 那閒置提醒呢？

Claude 其他的通知類型 — 例如閒置提醒 — 還是會抵達 hook 端點。伺服器會記錄它們，但不會變更分頁狀態、不發推播、也不會浮現 UI 提示。這是有意為之：只有會*阻塞* Claude 的事件才需要你關注。

## 下一步

- **[工作階段狀態](/purplemux/zh-TW/docs/session-status/)** — **needs-input** 的意義與偵測方式。
- **[即時工作階段檢視](/purplemux/zh-TW/docs/live-session-view/)** — 行內提示渲染的位置。
- **[瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)** — Web Push 需求（特別是 iOS Safari 16.4+）。
