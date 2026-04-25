---
title: 工作階段狀態
description: purplemux 如何把 Claude Code 的活動轉成四種狀態徽章 — 以及為何能近乎即時更新。
eyebrow: Claude Code
permalink: /zh-TW/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

側邊欄裡每個工作階段都有一個彩色圓點，一眼告訴你 Claude 在做什麼。本頁解釋這四種狀態從何而來，以及它們如何在你不必去看終端機的情況下保持同步。

## 四種狀態

| 狀態 | 指示 | 含義 |
|---|---|---|
| **閒置** | 無 / 灰色 | Claude 正在等待你的下一個 prompt。 |
| **執行中** | 紫色 spinner | Claude 正在處理 — 讀取、編輯、執行工具。 |
| **需要輸入** | 琥珀色脈動 | 有權限提示或問題在等你。 |
| **待檢視** | 紫色脈動 | Claude 完成了，有東西要你檢查。 |

第五個值 **unknown**，會短暫出現在伺服器重啟時還處於 `busy` 的分頁上。一旦 purplemux 能重新驗證工作階段，這個狀態會自行解決。

## hooks 是真實來源

purplemux 會在 `~/.purplemux/hooks.json` 安裝一份 Claude Code hook 設定，並在 `~/.purplemux/status-hook.sh` 放入一支精簡的 shell 指令稿。指令稿會註冊到五個 Claude Code hook 事件上，並用 CLI 權杖把每個事件 POST 到本機伺服器：

| Claude Code hook | 對應狀態 |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification`（僅限 permission） | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | 顯示壓縮中指示（狀態不變） |

由於 hooks 在 Claude Code 切換的當下就會觸發，側邊欄的更新會比你在終端機注意到還早。

{% call callout('note', '只接收權限通知') %}
Claude 的 `Notification` hook 會因多種原因觸發。purplemux 只在通知為 `permission_prompt` 或 `worker_permission_prompt` 時翻成 **needs-input**。閒置提示與其他通知類型不會觸發徽章。
{% endcall %}

## 程序偵測平行運作

Claude CLI 是否真的在執行，會與工作狀態分開追蹤。兩條路徑互相搭配：

- **tmux 標題變化** — 每個窗格會以 `pane_current_command|pane_current_path` 作為其標題。xterm.js 透過 `onTitleChange` 傳遞變更，而 purplemux 會 ping `/api/check-claude` 來確認。
- **程序樹掃描** — 在伺服器端，`detectActiveSession` 會檢視窗格的 shell PID、走訪其子程序，並比對 Claude 寫在 `~/.claude/sessions/` 下的 PID 檔案。

如果該目錄不存在，UI 會顯示「Claude 未安裝」畫面，而非狀態圓點。

## JSONL 監看器補上空缺

Claude Code 會在 `~/.claude/projects/` 下為每個工作階段寫入一份 transcript JSONL。當分頁處於 `busy`、`needs-input`、`unknown` 或 `ready-for-review` 時，purplemux 會用 `fs.watch` 監看該檔案，原因有二：

- **Metadata** — 目前工具、最近的助理片段、token 計數。這些會流入時間軸與側邊欄而不變更狀態。
- **合成 interrupt** — 當你在串流途中按 Esc 時，Claude 會在 JSONL 中寫入 `[Request interrupted by user]` 但不觸發任何 hook。監看器偵測到這行後會合成一個 `interrupt` 事件，讓分頁回到 idle 而非卡在 busy。

## 輪詢只是安全網，不是引擎

metadata 輪詢會每 30–60 秒執行一次，依分頁數量而定。它**不會**決定狀態 — 那嚴格屬於 hook 路徑。輪詢的存在是為了：

- 發現新的 tmux 窗格
- 還原任何已 busy 超過 10 分鐘但 Claude 程序已死的工作階段
- 重新整理程序資訊、連接埠與標題

這就是著陸頁上提到的「5–15 秒回退輪詢」，在 hooks 證明可靠後被放慢並縮窄。

## 撐過伺服器重啟

purplemux 停機時 hooks 無法觸發，因此進行中的狀態可能變得過時。恢復規則很保守：

- 持久化的 `busy` 會變成 `unknown` 並重新檢查：如果 Claude 已不在執行，分頁會悄悄翻成 idle；若 JSONL 已乾淨地結束，則變成 review。
- 其他狀態 — `idle`、`needs-input`、`ready-for-review` — 球都在你手上，因此原樣保留。

恢復過程中的自動狀態變化不會觸發推播通知。只有在 *新* 的工作越過 needs-input 或 review 時你才會收到提醒。

## 狀態出現在哪裡

- 側邊欄工作階段列的圓點
- 每個窗格分頁列上的圓點
- 工作區圓點（工作區內最高優先順序的狀態）
- 鈴鐺圖示計數與通知面板
- 瀏覽器分頁標題（計算需要注意的項目）
- `needs-input` 與 `ready-for-review` 的 Web Push 與桌面通知

## 下一步

- **[權限提示](/purplemux/zh-TW/docs/permission-prompts/)** — **needs-input** 狀態背後的工作流。
- **[即時工作階段檢視](/purplemux/zh-TW/docs/live-session-view/)** — 一旦分頁進入 `busy`，時間軸會顯示什麼。
- **[第一個工作階段](/purplemux/zh-TW/docs/first-session/)** — 帶上下文的儀表板導覽。
