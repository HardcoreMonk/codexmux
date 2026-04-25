---
title: 連接埠與環境變數
description: purplemux 開的每個連接埠，以及影響其執行方式的每個環境變數。
eyebrow: 參考資料
permalink: /zh-TW/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 的目標是一行指令安裝，但 runtime 是可設定的。本頁列出它打開的每個連接埠，以及伺服器讀取的每個環境變數。

## 連接埠

| 連接埠 | 預設 | 覆寫 | 備註 |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | 若 `8022` 已被使用，伺服器會記錄警告並改綁一個隨機可用連接埠。 |
| 內部 Next.js（生產） | random | — | 在 `pnpm start` / `purplemux start` 時，外層伺服器會 proxy 到綁在 `127.0.0.1:<random>` 的 Next.js standalone。不對外公開。 |

`8022` 是 `web` + `ssh` 拼湊出來的。選擇純屬玩笑，與協定無關。

{% call callout('note', '綁定介面跟著存取政策') %}
purplemux 只在存取政策允許外部客戶端時才綁定到 `0.0.0.0`。純 localhost 設定會綁到 `127.0.0.1`，所以 LAN 上的其他機器連 TCP 連線都打不通。請見下方的 `HOST`。
{% endcall %}

## 伺服器環境變數

由 `server.ts` 與其在啟動時載入的模組讀取。

| 變數 | 預設 | 效果 |
|---|---|---|
| `PORT` | `8022` | HTTP/WS 監聽連接埠。在 `EADDRINUSE` 時回退為隨機連接埠。 |
| `HOST` | 未設定 | 以逗號分隔的 CIDR/關鍵字規格，指定允許哪些客戶端。關鍵字：`localhost`、`tailscale`、`lan`、`all`（或 `*` / `0.0.0.0`）。範例：`HOST=localhost`、`HOST=localhost,tailscale`、`HOST=10.0.0.0/8,localhost`。透過 env 設定時，App 內 **設定 → 網路存取** 會被鎖定。 |
| `NODE_ENV` | 在 `purplemux start` 為 `production`，在 `pnpm dev` 為 `development` | 在 dev 流程（`tsx watch`、Next dev）與 prod 流程（`tsup` bundle proxy 到 Next standalone）之間切換。 |
| `__PMUX_APP_DIR` | `process.cwd()` | 覆寫存放 `dist/server.js` 與 `.next/standalone/` 的目錄。由 `bin/purplemux.js` 自動設定，通常你不需要動。 |
| `__PMUX_APP_DIR_UNPACKED` | 未設定 | `__PMUX_APP_DIR` 的變體，用於 macOS Electron App 內 asar-unpacked 的路徑。 |
| `__PMUX_ELECTRON` | 未設定 | 當 Electron 主程序在程序內啟動伺服器時會設定此值，使 `server.ts` 略過自動 `start()` 呼叫，讓 Electron 接管生命週期。 |
| `PURPLEMUX_CLI` | `1`（由 `bin/purplemux.js` 設定） | 標記讓共用模組知道目前程序是 CLI / 伺服器，而非 Electron。由 `pristine-env.ts` 使用。 |
| `__PMUX_PRISTINE_ENV` | 未設定 | 由 `bin/purplemux.js` 擷取的父 shell env JSON 快照，讓子程序（claude、tmux）繼承使用者的 `PATH`，而非經過清理的版本。內部用 — 自動設定。 |
| `AUTH_PASSWORD` | 未設定 | 在 Next 啟動前由伺服器從 `config.json` 的 scrypt 雜湊設定。NextAuth 會從那邊讀。請勿手動設定。 |
| `NEXTAUTH_SECRET` | 未設定 | 同樣 — 啟動時從 `config.json` 填入。 |

## 紀錄環境變數

由 `src/lib/logger.ts` 讀取。

| 變數 | 預設 | 效果 |
|---|---|---|
| `LOG_LEVEL` | `info` | 未在 `LOG_LEVELS` 命名的所有東西的根等級。 |
| `LOG_LEVELS` | 未設定 | 以 `name=level` 的對組形式（逗號分隔）覆寫單一模組。 |

等級由低到高：`trace` · `debug` · `info` · `warn` · `error` · `fatal`。

```bash
LOG_LEVEL=debug purplemux

# 只對 Claude hook 模組除錯
LOG_LEVELS=hooks=debug purplemux

# 一次調整多個模組
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

最常用的模組名稱：

| 模組 | 來源 | 你會看到 |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`、`status-manager.ts` 的部分 | Hook 接收 / 處理 / 狀態變化 |
| `status` | `status-manager.ts` | 輪詢、JSONL 監看器、廣播 |
| `tmux` | `lib/tmux.ts` | 每個 tmux 指令與其結果 |
| `server`、`lock` 等 | 對應的 `lib/*.ts` | 程序生命週期 |

紀錄檔不論等級都會落在 `~/.purplemux/logs/`。

## 檔案（等同環境變數）

少數值的行為類似環境變數，但放在磁碟上，這樣 CLI 與 hook 指令稿就不需要 env 握手即可找到：

| 檔案 | 內容 | 使用者 |
|---|---|---|
| `~/.purplemux/port` | 目前伺服器連接埠（純文字） | `bin/cli.js`、`status-hook.sh`、`statusline.sh` |
| `~/.purplemux/cli-token` | 32 位元組 hex CLI 權杖 | `bin/cli.js`、hook 指令稿（以 `x-pmux-token` 送出） |

CLI 也接受透過 env 設定，且優先：

| 變數 | 預設 | 效果 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` 內容 | CLI 對話的連接埠。 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` 內容 | 以 `x-pmux-token` 送出的 bearer token。 |

完整面向請見 [CLI 參考](/purplemux/zh-TW/docs/cli-reference/)。

## 組合起來

幾個常見組合：

```bash
# 預設：純 localhost、連接埠 8022
purplemux

# 全部繫結（LAN + Tailscale + 遠端）
HOST=all purplemux

# 只允許 localhost + Tailscale
HOST=localhost,tailscale purplemux

# 自訂連接埠 + 詳細的 hook tracing
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# 除錯時的全配
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
若要永久安裝，把它們設定在你的 launchd / systemd unit 的 `Environment=` 區塊。範例 unit 檔請見 [安裝](/purplemux/zh-TW/docs/installation/#開機自動啟動)。
{% endcall %}

## 下一步

- **[安裝](/purplemux/zh-TW/docs/installation/)** — 這些變數通常放哪裡。
- **[資料目錄](/purplemux/zh-TW/docs/data-directory/)** — `port` 與 `cli-token` 如何與 hook 指令稿互動。
- **[CLI 參考](/purplemux/zh-TW/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` 的脈絡。
