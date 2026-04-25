---
title: 安全與認證
description: purplemux 如何保護你的儀表板 — scrypt 雜湊密碼、純本地資料、對外存取的 HTTPS。
eyebrow: 行動與遠端
permalink: /zh-TW/docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是自架的，留在你自己的機器上。沒有外部伺服器、沒有遙測、沒有雲端帳號。以下說明的是真正用來守住儀表板的那幾個機制。

## 密碼設定

第一次打開 purplemux 時，引導畫面會請你選擇密碼。送出後：

- 密碼會用 **scrypt** 雜湊（隨機 16 位元組 salt、64 位元組 derived key）。
- 雜湊以 `scrypt:{salt}:{hash}` 寫入 `~/.purplemux/config.json` — 純文字永遠不會被儲存。
- 同時會產生一個獨立的 `authSecret`（隨機 hex）並一起儲存。purplemux 會用它來簽署登入後發出的 session cookie。

之後的造訪會顯示登入畫面，使用 `crypto.timingSafeEqual` 與儲存的雜湊比對。

{% call callout('note', '密碼長度') %}
最低長度很短（4 個字元），讓純 localhost 設定不至於麻煩。如果你把 purplemux 公開到 tailnet — 或任何其他地方 — 請選擇更強的密碼。失敗的登入會被限制為每個程序每 15 分鐘 16 次。
{% endcall %}

## 重設密碼

忘記了？只需要對主機的 shell 存取：

```bash
rm ~/.purplemux/config.json
```

重啟 purplemux（`pnpm start`、`npx purplemux`，或你啟動它的方式），引導畫面會再次出現讓你選新密碼。

這會清掉同一檔案中的其他設定（主題、語系、字級、通知切換等）。你的工作區與分頁存在 `workspaces.json` 與 `workspaces/` 目錄中，所以版面不受影響。

## 外部存取的 HTTPS

預設綁定為 `localhost`，以純 HTTP 提供。同機使用沒問題 — 但只要你從另一台裝置存取 purplemux，就應該走 HTTPS。

- **Tailscale Serve** 是建議路徑：WireGuard 加密加上自動 Let's Encrypt 憑證。請見 [Tailscale 存取](/purplemux/zh-TW/docs/tailscale/)。
- **反向代理**（Nginx、Caddy 等）也可以，前提是要轉送 WebSocket 的 `Upgrade` 與 `Connection` headers。

iOS Safari 額外要求 PWA 安裝與 Web Push 註冊都需要 HTTPS。請見 [PWA 設定](/purplemux/zh-TW/docs/pwa-setup/) 與 [Web Push](/purplemux/zh-TW/docs/web-push/)。

## `~/.purplemux/` 裡放什麼

全部都在本機。敏感檔案的權限為 `0600`。

| 檔案 | 內容 |
|---|---|
| `config.json` | scrypt 密碼雜湊、session secret、應用程式偏好設定 |
| `workspaces.json` + `workspaces/` | 工作區清單與每工作區窗格/分頁版面 |
| `vapid-keys.json` | Web Push VAPID 金鑰對（自動產生） |
| `push-subscriptions.json` | 各裝置推播訂閱 |
| `cli-token` | hooks/CLI 與本機伺服器通訊的共用權杖 |
| `pmux.lock` | 單例鎖（`pid`、`port`、`startedAt`） |
| `logs/` | 滾動的 pino log 檔案 |

完整清單與重設表，請見 repo 中作為真實來源的 [docs/DATA-DIR.md](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md)。

## 沒有遙測

purplemux 自己不會發出對外請求。它主動發起的網路呼叫只有：

- 你訂閱的 Web Push 通知，透過 OS 推播服務送出。
- Claude CLI 自己做的事 — 那是你跟 Anthropic 之間的事，與 purplemux 無關。

程式碼與工作階段資料永遠不離開你的機器。

## 下一步

- **[Tailscale 存取](/purplemux/zh-TW/docs/tailscale/)** — 對外 HTTPS 的安全路徑。
- **[PWA 設定](/purplemux/zh-TW/docs/pwa-setup/)** — 認證搞定後，安裝到主畫面。
- **[Web Push 通知](/purplemux/zh-TW/docs/web-push/)** — 背景提醒。
