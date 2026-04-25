---
title: CLI 參考
description: purplemux 與 pmux 二進位的所有子指令與旗標。
eyebrow: 參考資料
permalink: /zh-TW/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux` 提供兩種使用方式：作為伺服器啟動器（`purplemux` / `purplemux start`），以及作為 HTTP API 包裝器（`purplemux <subcommand>`）來與執行中的伺服器對話。短別名 `pmux` 完全等價。

## 一個二進位、兩種角色

| 形式 | 作用 |
|---|---|
| `purplemux` | 啟動伺服器。等同於 `purplemux start`。 |
| `purplemux <subcommand>` | 與執行中的伺服器的 CLI HTTP API 對話。 |
| `pmux ...` | `purplemux ...` 的別名。 |

`bin/purplemux.js` 中的派發器會剝離第一個參數：已知的子指令會路由到 `bin/cli.js`，其餘（或沒有參數）則啟動伺服器。

## 啟動伺服器

```bash
purplemux              # 預設
purplemux start        # 同義，明確指定
PORT=9000 purplemux    # 自訂連接埠
HOST=all purplemux     # 全部繫結
```

完整 env 面向請見 [連接埠與環境變數](/purplemux/zh-TW/docs/ports-env-vars/)。

伺服器會印出綁定的 URL、模式與認證狀態：

```
  ⚡ purplemux  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

如果 `8022` 已被佔用，伺服器會警告並改綁一個隨機可用連接埠。

## 子指令

所有子指令都需要一個執行中的伺服器。它們從 `~/.purplemux/port` 讀連接埠，從 `~/.purplemux/cli-token` 讀認證權杖，這兩個都會在伺服器啟動時自動寫入。

| 指令 | 用途 |
|---|---|
| `purplemux workspaces` | 列出工作區 |
| `purplemux tab list [-w WS]` | 列出分頁（可選擇限定到工作區） |
| `purplemux tab create -w WS [-n NAME] [-t TYPE]` | 建立新分頁 |
| `purplemux tab send -w WS TAB_ID CONTENT...` | 對分頁送出輸入 |
| `purplemux tab status -w WS TAB_ID` | 檢視分頁狀態 |
| `purplemux tab result -w WS TAB_ID` | 擷取分頁窗格目前內容 |
| `purplemux tab close -w WS TAB_ID` | 關閉分頁 |
| `purplemux tab browser ...` | 操控 `web-browser` 分頁（僅 Electron） |
| `purplemux api-guide` | 印出完整 HTTP API 參考 |
| `purplemux help` | 顯示用法 |

除非另外註明，輸出皆為 JSON。`--workspace` 與 `-w` 可互換。

### `tab create` 面板類型

`-t` / `--type` 旗標選擇面板類型。有效值：

| 值 | 面板 |
|---|---|
| `terminal` | 純 shell |
| `claude-code` | 已啟動 `claude` 的 shell |
| `web-browser` | 嵌入式瀏覽器（僅 Electron） |
| `diff` | Git diff 面板 |

不指定 `-t` 時，會得到純終端機。

### `tab browser` 子指令

這些只在分頁的面板類型為 `web-browser`、且僅在 macOS Electron App 中才有效 — 其餘情況下橋接會回傳 503。

| 子指令 | 回傳什麼 |
|---|---|
| `purplemux tab browser url -w WS TAB_ID` | 目前 URL + 頁面標題 |
| `purplemux tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG。指定 `-o` 會存到磁碟；不指定則回傳 base64。`--full` 擷取整頁。 |
| `purplemux tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | 最近的 console 條目（ring buffer，500 筆） |
| `purplemux tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | 最近的網路條目；`--request ID` 會擷取單一 body |
| `purplemux tab browser eval -w WS TAB_ID EXPR` | 執行 JS 表達式並序列化結果 |

## 範例

```bash
# 找你的工作區
purplemux workspaces

# 在工作區 ws-MMKl07 建立 Claude 分頁
purplemux tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# 對它送出 prompt（TAB_ID 來自 `tab list`）
purplemux tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# 觀察其狀態
purplemux tab status -w ws-MMKl07 tb-abc

# 擷取窗格快照
purplemux tab result -w ws-MMKl07 tb-abc

# 對 web-browser 分頁整頁截圖
purplemux tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## 認證

每個子指令都會送出 `x-pmux-token: $(cat ~/.purplemux/cli-token)`，並在伺服器端以 `timingSafeEqual` 驗證。`~/.purplemux/cli-token` 檔案在伺服器第一次啟動時以 `randomBytes(32)` 產生並以 mode `0600` 儲存。

如果你需要從另一個 shell 或無法看到 `~/.purplemux/` 的指令稿驅動 CLI，請改設環境變數：

| 變數 | 預設 | 效果 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` 的內容 | CLI 對話的連接埠 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` 的內容 | 以 `x-pmux-token` 送出的 bearer token |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux workspaces
```

{% call callout('warning') %}
CLI 權杖授予完整伺服器存取權。請當作密碼對待。不要貼到聊天、提交到版本控制，或暴露為建置 env 變數。要輪替時，刪掉 `~/.purplemux/cli-token` 並重啟伺服器。
{% endcall %}

## update-notifier

`purplemux` 在每次啟動時都會透過 `update-notifier` 檢查 npm 上是否有新版本，若有則印出橫幅。可用 `NO_UPDATE_NOTIFIER=1` 或任何[標準 `update-notifier` 退出方式](https://github.com/yeoman/update-notifier#user-settings)停用。

## 完整 HTTP API

`purplemux api-guide` 會印出每個 `/api/cli/*` endpoint 的完整 HTTP API 參考，包含 request body 與 response shape — 適合在你想直接從 `curl` 或其他 runtime 操控 purplemux 時使用。

## 下一步

- **[連接埠與環境變數](/purplemux/zh-TW/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` 在更廣的 env 面向。
- **[架構](/purplemux/zh-TW/docs/architecture/)** — CLI 實際在跟誰對話。
- **[疑難排解](/purplemux/zh-TW/docs/troubleshooting/)** — 當 CLI 說「伺服器有在跑嗎？」的時候。
