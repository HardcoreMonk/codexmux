---
title: 儲存與還原版面
description: 為什麼即使伺服器重啟，分頁也會回到你離開時的位置。
eyebrow: 工作區與終端機
permalink: /zh-TW/docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 的核心理念之一就是：在瀏覽器關閉一個分頁不應該結束工作階段。兩個機制協同運作 — tmux 維持 shell 持續運行，而 `~/.purplemux/workspaces.json` 記住版面配置。

## 哪些東西會被保留

任何在工作區看得見的內容：

- 分頁與其順序
- 窗格分割與比例
- 每個分頁的面板類型 — Terminal、Claude、Diff、Web browser
- 每個 shell 的工作目錄
- 工作區群組、名稱與順序

`workspaces.json` 會在每次版面變更時以交易方式更新，因此檔案永遠反映目前狀態。完整的磁碟檔案地圖請見 [資料目錄](/purplemux/zh-TW/docs/data-directory/)。

## 關閉瀏覽器

關掉分頁、重新整理、闔上筆電 — 都不會結束工作階段。

每個 shell 都活在 `purple` 專屬 socket 上的 tmux 工作階段裡，與你個人的 `~/.tmux.conf` 完全隔離。一小時後再打開 `http://localhost:8022`，WebSocket 會重新連到同一個 tmux 工作階段，重播 scrollback，把仍在運作的 PTY 交還給 xterm.js。

你不是在還原任何東西，而是在重新連線。

{% call callout('tip', '手機也一樣') %}
手機上同樣適用。關掉 PWA、鎖屏、隔天再回來 — 儀表板會帶著一切重新連上。
{% endcall %}

## 從伺服器重啟中恢復

重啟確實會殺掉 tmux 程序 — 它們只是普通的 OS 程序。purplemux 在下次啟動時會處理這件事：

1. **讀取版面** — `workspaces.json` 描述每一個工作區、窗格與分頁。
2. **平行重建工作階段** — 為每個分頁在儲存的工作目錄中產生新的 tmux 工作階段。
3. **自動恢復 Claude** — 原本有 Claude 工作階段的分頁會以 `claude --resume {sessionId}` 重新啟動，讓對話從中斷處繼續。

「平行」很重要：如果你有十個分頁，十個 tmux 工作階段會同時建立，而非一個接一個。當你打開瀏覽器時，版面已經就緒。

## 哪些東西無法還原

有少數東西無法持久化：

- **記憶體中的 shell 狀態** — 你設定的環境變數、背景作業、思考一半的 REPL。
- **進行中的權限提示** — 如果伺服器在 Claude 等待權限決定時掛掉，恢復後你會再次看到提示。
- **`claude` 以外的前景程序** — `vim` 緩衝區、`htop`、`docker logs -f`。shell 會回到相同目錄，但程序不會。

這就是 tmux 的標準合約：shell 會存活，但其中的程序不一定。

## 手動控制

平常不需要碰，但若你好奇：

- tmux socket 名稱是 `purple`。可用 `tmux -L purple ls` 檢視。
- 工作階段命名格式為 `pt-{workspaceId}-{paneId}-{tabId}`。
- 在 purplemux 執行中時編輯 `workspaces.json` 並不安全 — 伺服器會持續打開並寫入。

更深入的說明（二進位協定、背壓、JSONL 監看）請見著陸頁的 [How it works](/purplemux/#how)。

## 下一步

- **[工作區與群組](/purplemux/zh-TW/docs/workspaces-groups/)** — 工作區會儲存什麼。
- **[分頁與窗格](/purplemux/zh-TW/docs/tabs-panes/)** — 分頁會儲存什麼。
- **[瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)** — 行動裝置背景分頁與重新連線的已知差異。
