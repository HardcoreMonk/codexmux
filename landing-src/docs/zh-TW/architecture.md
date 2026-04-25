---
title: 架構
description: 瀏覽器、Node.js 伺服器、tmux 與 Claude CLI 是如何拼在一起的。
eyebrow: 參考資料
permalink: /zh-TW/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是三層拼裝起來的：瀏覽器前端、`:8022` 上的 Node.js 伺服器，以及主機上的 tmux + Claude CLI。它們之間的傳輸不是二進位 WebSocket，就是小型 HTTP POST。

## 三層

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

每個 WebSocket 都只負責單一目的，並不多工。認證方式是在 WS upgrade 時驗證 NextAuth JWT cookie。

## 瀏覽器

前端是 Next.js（Pages Router）App。會與伺服器通訊的部分：

| 元件 | 函式庫 | 用途 |
|---|---|---|
| 終端機窗格 | `xterm.js` | 渲染來自 `/api/terminal` 的位元組。送出按鍵、調整大小事件、標題變化（`onTitleChange`）。 |
| 工作階段時間軸 | React + `useTimeline` | 渲染來自 `/api/timeline` 的 Claude 回合。沒有 `cliState` 衍生 — 那都在伺服器端。 |
| 狀態指示器 | Zustand `useTabStore` | 由 `/api/status` 訊息驅動的分頁徽章、側邊欄圓點、通知計數。 |
| 多裝置同步 | `useSyncClient` | 透過 `/api/sync` 監看其他裝置上對工作區 / 版面所做的編輯。 |

分頁標題與前景程序來自 xterm.js 的 `onTitleChange` 事件 — tmux 被設定（`src/config/tmux.conf`）為每兩秒送出 `#{pane_current_command}|#{pane_current_path}`，由 `lib/tab-title.ts` 解析。

## Node.js 伺服器

`server.ts` 是一個自訂 HTTP 伺服器，在同一連接埠上同時掛載 Next.js 與四個 `ws` `WebSocketServer` 實例。

### WebSocket endpoints

| 路徑 | 處理者 | 方向 | 用途 |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | 雙向、二進位 | 透過 `node-pty` 連到 tmux 工作階段的終端機 I/O |
| `/api/timeline` | `timeline-server.ts` | 伺服器 → 客戶端 | 串流從 JSONL 解析的 Claude 工作階段條目 |
| `/api/status` | `status-server.ts` | 雙向、JSON | 伺服器送出 `status:sync` / `status:update` / `status:hook-event`，客戶端送出 `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` |
| `/api/sync` | `sync-server.ts` | 雙向、JSON | 跨裝置工作區狀態 |

外加 `/api/install` 用於首次執行的安裝程式（不需要認證）。

### 終端機二進位協定

`/api/terminal` 使用一個定義於 `src/lib/terminal-protocol.ts` 的精簡二進位協定：

| 代碼 | 名稱 | 方向 | Payload |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | 客戶端 → 伺服器 | 鍵碼 |
| `0x01` | `MSG_STDOUT` | 伺服器 → 客戶端 | 終端機輸出 |
| `0x02` | `MSG_RESIZE` | 客戶端 → 伺服器 | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | 雙向 | 30 秒間隔，90 秒 timeout |
| `0x04` | `MSG_KILL_SESSION` | 客戶端 → 伺服器 | 結束底層 tmux 工作階段 |
| `0x05` | `MSG_WEB_STDIN` | 客戶端 → 伺服器 | 網頁輸入列文字（在 copy-mode 結束後送達） |

背壓：當 WS `bufferedAmount > 1 MB` 時 `pty.pause`，低於 `256 KB` 時恢復。每個伺服器最多 32 個並發連線，超過時最舊的會被丟棄。

### 狀態管理器

`src/lib/status-manager.ts` 是 `cliState` 的單一真實來源。Hook 事件透過 `/api/status/hook`（以 token 認證的 POST）流入、依分頁排序（`eventSeq`），並由 `deriveStateFromEvent` 縮減為 `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown`。JSONL 監看器只更新 metadata，但會發出一個合成的 `interrupt` 事件。

完整狀態機請見 [Session status (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md)。

## tmux 層

purplemux 在專屬 socket 上執行隔離的 tmux — `-L purple` — 並使用自己的設定 `src/config/tmux.conf`。你的 `~/.tmux.conf` 永遠不會被讀取。

工作階段命名為 `pt-{workspaceId}-{paneId}-{tabId}`。瀏覽器中的一個終端機窗格對應一個 tmux 工作階段，透過 `node-pty` 連接。

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← 瀏覽器分頁 1
├── pt-ws-MMKl07-pa-1-tb-2   ← 瀏覽器分頁 2
└── pt-ws-MMKl07-pa-2-tb-1   ← 分割窗格、分頁 1
```

`prefix` 已停用，狀態列關閉（xterm.js 自繪外框），`set-titles` 開啟，`mouse on` 把滾輪交給 copy-mode。tmux 是讓工作階段能撐過瀏覽器關閉、Wi-Fi 斷線或伺服器重啟的關鍵。

完整 tmux 設定、指令封裝與程序偵測細節，請見 [tmux & process detection (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md)。

## Claude CLI 整合

purplemux 並不 fork 或包裝 Claude — `claude` 二進位就是你已經安裝的那一個。新增的兩件事是：

1. **Hook settings** — 啟動時，`ensureHookSettings()` 寫入 `~/.purplemux/hooks.json`、`status-hook.sh` 與 `statusline.sh`。每個 Claude 分頁都以 `--settings ~/.purplemux/hooks.json` 啟動，因此 `SessionStart`、`UserPromptSubmit`、`Notification`、`Stop`、`PreCompact`、`PostCompact` 都會 POST 回伺服器。
2. **JSONL 讀取** — `~/.claude/projects/**/*.jsonl` 由 `timeline-server.ts` 解析以呈現即時對話檢視，並由 `session-detection.ts` 監看，透過 `~/.claude/sessions/` 下的 PID 檔來偵測正在執行的 Claude 程序。

Hook 指令稿讀取 `~/.purplemux/port` 與 `~/.purplemux/cli-token`，並以 `x-pmux-token` POST。在伺服器離線時它們會靜默失敗，所以在 Claude 執行中關閉 purplemux 不會崩潰。

## 啟動順序

`server.ts:start()` 依序執行：

1. `acquireLock(port)` — 透過 `~/.purplemux/pmux.lock` 的單例守衛
2. `initConfigStore()` + `initShellPath()`（解析使用者 login shell 的 `PATH`）
3. `initAuthCredentials()` — 將 scrypt 雜湊密碼與 HMAC secret 載入 env
4. `scanSessions()` + `applyConfig()` — 清除已死的 tmux 工作階段、套用 `tmux.conf`
5. `initWorkspaceStore()` — 載入 `workspaces.json` 與每工作區的 `layout.json`
6. `autoResumeOnStartup()` — 在儲存的目錄重新啟動 shell，嘗試 Claude resume
7. `getStatusManager().init()` — 啟動 metadata 輪詢
8. `app.prepare()`（Next.js dev）或 `require('.next/standalone/server.js')`（prod）
9. 在 `bindPlan.host:port`（依存取政策為 `0.0.0.0` 或 `127.0.0.1`）執行 `listenWithFallback()`
10. `ensureHookSettings(result.port)` — 以實際連接埠寫入或更新 hook 指令稿
11. `getCliToken()` — 讀取或產生 `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — 重新整理每工作區的 `claude-prompt.md`

連接埠解析到第 10 步之間的視窗，正是 hook 指令稿每次啟動都重新產生的原因：它們需要把實際生效的連接埠寫進去。

## 自訂伺服器與 Next.js 模組圖

{% call callout('warning', '一個程序中的兩個模組圖') %}
外層自訂伺服器（`server.ts`）與 Next.js（pages + API routes）共用一個 Node 程序，但**不**共用模組圖。任何在 `src/lib/*` 下被兩邊都載入的東西都會被實例化兩次。需要共用的單例（StatusManager、WebSocket 客戶端集合、CLI 權杖、檔案寫入鎖）會掛在 `globalThis.__pt*` keys 上。完整理由見 `CLAUDE.md §18`。
{% endcall %}

## 延伸閱讀

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — tmux 設定、指令封裝、程序樹走訪、終端機二進位協定。
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — Claude CLI 狀態機、hook 流程、合成 interrupt 事件、JSONL 監看器。
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — purplemux 寫入的每個檔案。

## 下一步

- **[資料目錄](/purplemux/zh-TW/docs/data-directory/)** — 上述架構觸及的每個檔案。
- **[CLI 參考](/purplemux/zh-TW/docs/cli-reference/)** — 從瀏覽器之外與伺服器對話。
- **[疑難排解](/purplemux/zh-TW/docs/troubleshooting/)** — 當這裡有東西出問題時的診斷。
