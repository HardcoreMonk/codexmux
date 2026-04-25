---
title: 疑難排解與 FAQ
description: 常見問題、快速解答，以及最常被問到的疑問。
eyebrow: 參考資料
permalink: /zh-TW/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

如果這裡的內容與你看到的情況不符，請[提交 issue](https://github.com/subicura/purplemux/issues)，附上你的平台、瀏覽器，以及 `~/.purplemux/logs/` 中的相關紀錄檔。

## 安裝與啟動

### `tmux: command not found`

purplemux 需要主機上有 tmux 3.0+。安裝它：

```bash
# macOS（Homebrew）
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

用 `tmux -V` 確認。tmux 2.9+ 在技術上能通過預檢查，但我們測試的版本是 3.0+。

### `node: command not found` 或「Node.js 20 or newer」

請安裝 Node 20 LTS 或更新版本。用 `node -v` 檢查。macOS 原生 App 已內建自己的 Node，所以這只適用於 `npx` / `npm install -g` 路徑。

### "purplemux is already running (pid=…, port=…)"

另一個 purplemux 實例正在執行並回應 `/api/health`。你可以使用那個（打開印出的 URL）或先停掉：

```bash
# 找它
ps aux | grep purplemux

# 或直接透過 lock 檔殺掉
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### 過期 lock — 無法啟動，但沒有程序在跑

`~/.purplemux/pmux.lock` 殘留了。移除它：

```bash
rm ~/.purplemux/pmux.lock
```

如果你曾用 `sudo` 執行過 purplemux，該檔案可能屬於 root — 用 `sudo rm` 一次。

### `Port 8022 is in use, finding an available port...`

另一個程序持有 `8022`。伺服器會回退到隨機可用連接埠並印出新 URL。如果你想自己選連接埠：

```bash
PORT=9000 purplemux
```

用 `lsof -iTCP:8022 -sTCP:LISTEN -n -P` 找出誰持有 `8022`。

### Windows 上能跑嗎？

**官方不支援。** purplemux 倚賴 `node-pty` 與 tmux，這兩者在 Windows 上都無法原生運作。WSL2 通常可以（在那裡你實際上是 Linux），但不在我們的測試範圍內。

## 工作階段與還原

### 關閉瀏覽器把所有東西都殺了

不應該如此 — tmux 在伺服器上保留每個 shell 持續運作。如果重新整理沒讓分頁回來：

1. 確認伺服器仍在執行（`http://localhost:8022/api/health`）。
2. 確認 tmux 工作階段存在：`tmux -L purple ls`。
3. 看 `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` 中 `autoResumeOnStartup` 期間的錯誤。

如果 tmux 說「no server running」，主機重啟過或有東西殺掉了 tmux。工作階段不見了，但版面（工作區、分頁、工作目錄）保留在 `~/.purplemux/workspaces/{wsId}/layout.json`，下次 purplemux 啟動時會重新啟動。

### Claude 工作階段無法 resume

`autoResumeOnStartup` 會為每個分頁重新執行儲存的 `claude --resume <uuid>`，但若對應的 `~/.claude/projects/.../sessionId.jsonl` 已不存在（被刪、封存，或專案搬走），resume 會失敗。打開分頁開始一個新對話即可。

### 我的分頁全部顯示「unknown」

`unknown` 表示分頁在伺服器重啟前處於 `busy`，恢復仍在進行中。`resolveUnknown` 會在背景執行並確認 `idle`（Claude 已結束）或 `ready-for-review`（最後一則助理訊息已存在）。如果分頁卡在 `unknown` 超過十分鐘，**busy stuck safety net** 會悄悄把它翻成 `idle`。完整狀態機請見 [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md)。

## 瀏覽器與 UI

### Web Push 通知從來不會觸發

依序檢查：

1. **僅 iOS Safari ≥ 16.4**。較舊的 iOS 完全沒有 Web Push。
2. **iOS 必須是 PWA**。先點選 **分享 → 加入主畫面**；普通 Safari 分頁不會觸發推播。
3. **必須是 HTTPS**。自簽憑證不行 — Web Push 會靜默拒絕註冊。請使用 Tailscale Serve（免費 Let's Encrypt）或在 Nginx / Caddy 後面的真實網域。
4. **通知權限已授予**。purplemux 中的 **設定 → 通知 → 開** *與* 瀏覽器層級的權限都必須允許。
5. **訂閱已存在**。`~/.purplemux/push-subscriptions.json` 應該有該裝置的條目。若是空的，請重新授予權限。

完整相容性表請見 [瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)。

### iOS Safari 16.4+，但仍沒有通知

某些 iOS 版本會在 PWA 長期關閉後遺失訂閱。打開 PWA、拒絕後再重新授予通知權限，再檢查一次 `push-subscriptions.json`。

### Safari 私密視窗不會持久化任何東西

Safari 17+ 的私密視窗已停用 IndexedDB，所以工作區快取不會跨重啟保留。請改用一般視窗。

### 行動裝置上的終端機背景後消失

iOS Safari 在背景約 30 秒後會關閉 WebSocket。tmux 仍維持實際工作階段運作 — 當你回到分頁時，purplemux 會重新連線並重新渲染。這是 iOS 的問題，不是我們的。

### Firefox + Tailscale serve = 憑證警告

如果你的 tailnet 使用非 `*.ts.net` 的自訂網域，Firefox 對 HTTPS 信任會比 Chrome 嚴格。接受憑證一次後就會記住。

### 「瀏覽器太舊」或缺少功能

執行 **設定 → 瀏覽器檢查** 取得逐 API 報告。任何低於 [瀏覽器支援](/purplemux/zh-TW/docs/browser-support/) 中最低需求的會優雅降級，但不在支援之列。

## 網路與遠端存取

### 我可以把 purplemux 公開到網際網路嗎？

可以，但永遠走 HTTPS。建議：

1. **Tailscale Serve** — `tailscale serve --bg 8022` 提供 WireGuard 加密 + 自動憑證。不需連接埠轉送。
2. **反向代理** — Nginx / Caddy / Traefik。記得轉送 `Upgrade` 與 `Connection` headers，否則 WebSocket 會壞。

在開放網路上走純 HTTP 是個壞主意 — 認證 cookie 是 HMAC 簽署的，但 WebSocket payload（終端機位元組！）並未加密。

### LAN 上的其他裝置連不到 purplemux

預設情況下 purplemux 只允許 localhost。透過 env 或 App 內設定打開存取：

```bash
HOST=lan,localhost purplemux       # 對 LAN 友善
HOST=tailscale,localhost purplemux # 對 tailnet 友善
HOST=all purplemux                 # 全部開
```

或使用 App 中的 **設定 → 網路存取**，它會寫入 `~/.purplemux/config.json`。（透過 env 設定 `HOST` 時，該欄位會被鎖定。）關鍵字與 CIDR 語法請見 [連接埠與環境變數](/purplemux/zh-TW/docs/ports-env-vars/)。

### 反向代理 WebSocket 問題

如果 `/api/terminal` 連線後立即斷開，代理可能正在剝除 `Upgrade` / `Connection` headers。最小 Nginx：

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy：WebSocket 轉送是預設的；只要 `reverse_proxy 127.0.0.1:8022` 即可。

## 資料與儲存

### 我的資料在哪裡？

全部都在本機的 `~/.purplemux/`。沒有東西離開你的機器。登入密碼是 `config.json` 中的 scrypt 雜湊。完整配置請見 [資料目錄](/purplemux/zh-TW/docs/data-directory/)。

### 我忘記密碼了

刪掉 `~/.purplemux/config.json` 並重啟。引導會重新開始。工作區、版面與歷史會保留（它們是分開的檔案）。

### 分頁指示燈永遠卡在「busy」

在 Claude 程序已死的情況下，`busy stuck safety net` 會在十分鐘後悄悄把分頁翻成 `idle`。如果你不想等，關閉再重新打開分頁 — 這會重設本機狀態，下個 hook 事件會從乾淨的狀態開始。要進行根因調查，請以 `LOG_LEVELS=hooks=debug,status=debug` 執行。

### 它會與我現有的 tmux 設定衝突嗎？

不會。purplemux 在專屬 socket 上執行隔離的 tmux（`-L purple`），有自己的設定（`src/config/tmux.conf`）。你的 `~/.tmux.conf` 與任何既有的 tmux 工作階段都不會被動到。

## 費用與用量

### purplemux 會幫我省錢嗎？

它不會直接省錢。它做的是**讓用量透明**：今日 / 本月 / 每專案的費用、每模型 token 拆解、5 小時 / 7 天用量倒數，全部都在同一個畫面上，讓你能在撞牆前就調整節奏。

### purplemux 本身要付費嗎？

不需要。purplemux 是 MIT 授權的開源軟體。Claude Code 的用量是 Anthropic 另外計費。

### 我的資料會被傳到任何地方嗎？

不會。purplemux 完全是自架。它做的網路呼叫只有：發給你本機 Claude CLI 的（CLI 自己會跟 Anthropic 通訊），以及啟動時透過 `update-notifier` 的版本檢查。停用版本檢查請設 `NO_UPDATE_NOTIFIER=1`。

## 下一步

- **[瀏覽器支援](/purplemux/zh-TW/docs/browser-support/)** — 詳細的相容性表與已知瀏覽器差異。
- **[資料目錄](/purplemux/zh-TW/docs/data-directory/)** — 每個檔案的用途以及哪些可以安全刪除。
- **[架構](/purplemux/zh-TW/docs/architecture/)** — 當需要更深入挖掘時，各部分如何拼在一起。
