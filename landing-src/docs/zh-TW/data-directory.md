---
title: 資料目錄
description: ~/.purplemux/ 下放著什麼、哪些可以安全刪除，以及如何備份。
eyebrow: 參考資料
permalink: /zh-TW/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 保留的每一片持久狀態 — 設定、版面、工作階段歷史、快取 — 都活在 `~/.purplemux/` 之下。沒有別的地方。沒有 `localStorage`、沒有系統 keychain、沒有外部服務。

## 目錄一覽

```
~/.purplemux/
├── config.json              # 應用程式設定（認證、主題、語系，…）
├── workspaces.json          # 工作區清單 + 側邊欄狀態
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # 窗格/分頁樹
│       ├── message-history.json  # 每工作區的輸入歷史
│       └── claude-prompt.md      # --append-system-prompt-file 內容
├── hooks.json               # Claude Code hook + statusline 設定（自動產生）
├── status-hook.sh           # hook 指令稿（自動產生，0755）
├── statusline.sh            # statusline 指令稿（自動產生，0755）
├── rate-limits.json         # 最新的 statusline JSON
├── session-history.json     # 已完成的 Claude 工作階段紀錄（跨工作區）
├── quick-prompts.json       # 自訂快速 prompts + 已停用的內建項目
├── sidebar-items.json       # 自訂側邊欄項目 + 已停用的內建項目
├── vapid-keys.json          # Web Push VAPID 金鑰對（自動產生）
├── push-subscriptions.json  # Web Push endpoint 訂閱
├── cli-token                # CLI 認證權杖（自動產生）
├── port                     # 目前的伺服器連接埠
├── pmux.lock                # 單例鎖 {pid, port, startedAt}
├── logs/                    # pino-roll 紀錄檔
├── uploads/                 # 從聊天輸入列附加的圖片
└── stats/                   # Claude 用量統計快取
```

含敏感資訊的檔案（config、tokens、layouts、VAPID keys、lock）以 `tmpFile → rename` 的方式以 mode `0600` 寫入。

## 頂層檔案

| 檔案 | 儲存內容 | 可刪除嗎？ |
|---|---|---|
| `config.json` | scrypt 雜湊登入密碼、HMAC session secret、主題、語系、字級、通知切換、編輯器 URL、網路存取、自訂 CSS | 可 — 會重新走引導 |
| `workspaces.json` | 工作區索引、側邊欄寬度 / 摺疊狀態、作用工作區 ID | 可 — 會清掉所有工作區與分頁 |
| `hooks.json` | Claude Code `--settings` 對應（事件 → 指令稿） + `statusLine.command` | 可 — 下次啟動會重新產生 |
| `status-hook.sh`、`statusline.sh` | 用 `x-pmux-token` POST 到 `/api/status/hook` 與 `/api/status/statusline` | 可 — 下次啟動會重新產生 |
| `rate-limits.json` | 最新的 Claude statusline JSON：`ts`、`model`、`five_hour`、`seven_day`、`context`、`cost` | 可 — Claude 執行時會重新填入 |
| `session-history.json` | 最近 200 個已完成的 Claude 工作階段（prompts、結果、時間、工具、檔案） | 可 — 會清空歷史 |
| `quick-prompts.json`、`sidebar-items.json` | `{ custom: […], disabledBuiltinIds: […], order: […] }`，覆蓋在內建清單之上 | 可 — 還原為預設 |
| `vapid-keys.json` | Web Push VAPID 金鑰對，第一次執行時產生 | 不要刪，除非也刪掉 `push-subscriptions.json`（既有訂閱會壞掉） |
| `push-subscriptions.json` | 每瀏覽器推播 endpoints | 可 — 每個裝置會重新訂閱 |
| `cli-token` | `purplemux` CLI 與 hook 指令稿用的 32 位元組 hex 權杖（`x-pmux-token` header） | 可 — 下次啟動會重新產生，但已產生的 hook 指令稿在伺服器覆寫前仍會持有舊權杖 |
| `port` | 純文字目前連接埠，由 hook 指令稿與 CLI 讀取 | 可 — 下次啟動會重新產生 |
| `pmux.lock` | 單例守衛 `{ pid, port, startedAt }` | 僅在沒有 purplemux 程序存活時可刪 |

{% call callout('warning', 'Lock 檔的注意事項') %}
如果 purplemux 拒絕啟動並回報「already running」，但實際上沒有程序存活，就是 `pmux.lock` 過期了。`rm ~/.purplemux/pmux.lock` 後再試。如果你曾用 `sudo` 執行過 purplemux，lock 檔可能屬於 root — 用 `sudo rm` 一次。
{% endcall %}

## 每工作區目錄（`workspaces/{wsId}/`）

每個工作區都有自己的資料夾，名稱是其產生的工作區 ID。

| 檔案 | 內容 |
|---|---|
| `layout.json` | 遞迴式的窗格/分頁樹：葉節點 `pane` 含 `tabs[]`，`split` 節點含 `children[]` 與 `ratio`。每個分頁攜帶其 tmux 工作階段名稱（`pt-{wsId}-{paneId}-{tabId}`）、快取的 `cliState`、`claudeSessionId`、最近一次 resume 指令。 |
| `message-history.json` | 每工作區的 Claude 輸入歷史。上限 500 筆。 |
| `claude-prompt.md` | 此工作區每個 Claude 分頁所用的 `--append-system-prompt-file` 內容。在工作區建立 / 重新命名 / 目錄變更時重新產生。 |

刪除單一 `workspaces/{wsId}/layout.json` 即可把該工作區的版面重設為預設窗格，而不影響其他工作區。

## `logs/`

Pino-roll 輸出，每個 UTC 日一個檔案，超過大小上限時附加數字後綴：

```
logs/purplemux.2026-04-19.1.log
```

預設等級為 `info`。可用 `LOG_LEVEL` 覆寫，或用 `LOG_LEVELS` 逐模組覆寫 — 請見 [連接埠與環境變數](/purplemux/zh-TW/docs/ports-env-vars/)。

紀錄每週輪替（上限 7 個檔案）。隨時可以安全刪除。

## `uploads/`

從聊天輸入列附加的圖片（拖曳、貼上、迴紋針）：

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- 允許：`image/png`、`image/jpeg`、`image/gif`、`image/webp`
- 每檔最大 10 MB，mode `0600`
- 伺服器啟動時自動清理：超過 24 小時的會被移除
- 手動清理：**設定 → 系統 → Attached Images → Clean now**

## `stats/`

純粹的快取。從 `~/.claude/projects/**/*.jsonl` 衍生而來 — purplemux 只讀取該目錄。

| 檔案 | 內容 |
|---|---|
| `cache.json` | 每日彙總：訊息、工作階段、工具呼叫、每小時計數、每模型 token 用量 |
| `uptime-cache.json` | 每日 uptime / 活躍分鐘彙總 |
| `daily-reports/{YYYY-MM-DD}.json` | AI 產生的每日簡報 |

刪掉整個資料夾，下次統計請求時就會強制重算。

## 重設對應表

| 想重設… | 刪除 |
|---|---|
| 登入密碼（重新走引導） | `config.json` |
| 所有工作區與分頁 | `workspaces.json` + `workspaces/` |
| 單一工作區的版面 | `workspaces/{wsId}/layout.json` |
| 用量統計 | `stats/` |
| 推播訂閱 | `push-subscriptions.json` |
| 卡住的「already running」 | `pmux.lock`（僅在沒有程序存活時） |
| 全部（出廠重設） | `~/.purplemux/` |

`hooks.json`、`status-hook.sh`、`statusline.sh`、`port`、`cli-token`、`vapid-keys.json` 全部會在下次啟動自動重新產生，所以刪掉它們是無害的。

## 備份

整個目錄是純 JSON 加上幾個 shell 指令稿。要備份：

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

要在新機器上還原，解壓後啟動 purplemux 即可。Hook 指令稿會以新伺服器的連接埠重寫；其餘（工作區、歷史、設定）原樣搬遷。

{% call callout('warning') %}
不要還原 `pmux.lock` — 它與特定 PID 繫結，會擋住啟動。請排除：`--exclude pmux.lock`。
{% endcall %}

## 全部清掉

```bash
rm -rf ~/.purplemux
```

執行前確認沒有 purplemux 在跑。下次啟動會回到首次執行的體驗。

## 下一步

- **[連接埠與環境變數](/purplemux/zh-TW/docs/ports-env-vars/)** — 影響此目錄的所有變數。
- **[架構](/purplemux/zh-TW/docs/architecture/)** — 這些檔案如何連到執行中的伺服器。
- **[疑難排解](/purplemux/zh-TW/docs/troubleshooting/)** — 常見問題與修法。
