---
title: 第一個工作階段
description: 從空白工作區到第一個運作中的 Claude 工作階段，逐步認識儀表板的每個區塊。
eyebrow: 開始上手
permalink: /zh-TW/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 已經在執行（如果還沒，請參考 [快速開始](/purplemux/zh-TW/docs/quickstart/)）。本頁介紹 UI 各部分的實際功能，讓最初幾分鐘不再那麼抽象。

## 儀表板

當你打開 `http://localhost:8022` 時，會落在一個 **工作區**（workspace）。可以把工作區想成一個放著相關分頁的資料夾 — 一個分頁用來跟 Claude 寫程式，另一個用來寫文件，再一個用來臨時跑點 shell 工作。

版面配置：

- **左側邊欄** — 工作區與工作階段、Claude 狀態徽章、用量小工具、筆記、統計
- **主區域** — 目前工作區內的窗格，每個窗格可以容納多個分頁
- **頂部列** — 工作區名稱、分割控制、設定

按 <kbd>⌘B</kbd> 隨時切換側邊欄。按 <kbd>⌘⇧B</kbd> 在側邊欄的工作區/工作階段模式之間切換。

## 建立工作區

第一次執行時會有一個預設工作區。要新增另一個：

1. 點選側邊欄頂部的 **+ 新增工作區**（<kbd>⌘N</kbd>）。
2. 命名並選擇預設目錄 — 這會是新分頁中 shell 啟動的位置。
3. 按 Enter，空白工作區即會打開。

之後可以直接在側邊欄拖曳來重新排序或更名。

## 開啟第一個分頁

工作區一開始是空的。用 <kbd>⌘T</kbd> 或分頁列上的 **+** 按鈕新增分頁。

選擇一個 **範本**：

- **Terminal** — 空白 shell。適合用來執行 `vim`、`docker`、指令稿。
- **Claude** — 啟動後 shell 中已執行 `claude`。

{% call callout('tip', '範本只是捷徑') %}
本質上每個分頁都是普通 shell。Claude 範本不過是「打開終端機並執行 `claude`」。如果你之後在 Terminal 分頁中手動執行 `claude`，purplemux 也會偵測到並以同樣的方式顯示其狀態。
{% endcall %}

## 解讀工作階段狀態

注意分頁所對應的 **側邊欄工作階段列**。你會看到下列其中一種指示：

| 狀態 | 含義 |
|---|---|
| **閒置**（灰色） | Claude 正在等待你的輸入。 |
| **執行中**（紫色 spinner） | Claude 正在工作 — 讀取檔案、執行工具。 |
| **需要輸入**（琥珀色） | Claude 遇到權限提示或詢問了問題。 |
| **待檢視**（藍色） | 工作完成，Claude 已停止；有東西要你檢查。 |

狀態切換幾乎是即時的。詳情請見 [工作階段狀態](/purplemux/zh-TW/docs/session-status/) 解釋偵測機制。

## 回應權限提示

當 Claude 要求執行工具或編輯檔案時，purplemux 會 **攔截提示** 並在工作階段檢視中內嵌顯示。你可以：

- 點選 **1 · 是** / **2 · 是，永遠允許** / **3 · 否**，或
- 按下對應的數字鍵，或
- 不予理會，改用手機回應 — 行動 Web Push 會發出相同的通知。

Claude CLI 並不會真的卡在攔截到的提示上；purplemux 會把你的回答原封不動傳回去。

## 分割與切換

當你開啟一個分頁後，試試：

- <kbd>⌘D</kbd> — 把目前窗格往右分割
- <kbd>⌘⇧D</kbd> — 往下分割
- <kbd>⌘⌥←/→/↑/↓</kbd> — 在分割之間移動焦點
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — 上一個 / 下一個分頁

完整列表請見 [鍵盤快速鍵](/purplemux/zh-TW/docs/keyboard-shortcuts/)。

## 儲存與還原

關閉瀏覽器，分頁不會消失 — tmux 在伺服器上保留它們。一小時後（或一週後）重新整理，purplemux 會還原完整版面，包含分割比例與工作目錄。

即使伺服器重啟也能還原：重啟時，purplemux 會從 `~/.purplemux/workspaces.json` 讀取儲存的版面、在正確目錄重新啟動 shell，並儘可能重新接上 Claude 工作階段。

## 從手機連線

執行：

```bash
tailscale serve --bg 8022
```

在手機上打開 `https://<machine>.<tailnet>.ts.net`，點選 **分享 → 加入主畫面**，並授予通知權限。即使分頁已關閉，也能在 **需要輸入** 與 **待檢視** 狀態下收到推播通知。

完整教學：[PWA 設定](/purplemux/zh-TW/docs/pwa-setup/) · [Web Push](/purplemux/zh-TW/docs/web-push/) · [Tailscale](/purplemux/zh-TW/docs/tailscale/)。

## 下一步

- **[鍵盤快速鍵](/purplemux/zh-TW/docs/keyboard-shortcuts/)** — 所有繫結一覽表。
- **[瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)** — 相容性表格，特別是 iOS Safari 16.4+。
- 探索側邊欄：**筆記**（<kbd>⌘⇧E</kbd>）的 AI 每日報告、**統計**（<kbd>⌘⇧U</kbd>）的用量分析。
