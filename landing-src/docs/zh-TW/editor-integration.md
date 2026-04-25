---
title: 編輯器整合
description: 從標頭直接在你選擇的編輯器中打開目前資料夾 — VS Code、Cursor、Zed、code-server，或自訂 URL。
eyebrow: 自訂
permalink: /zh-TW/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

每個工作區的標頭都有一個 **EDITOR** 按鈕。點選後，目前作用工作階段的資料夾會在你選的編輯器中打開。挑一個預設、指向 URL 或仰賴系統處理常式即可。

## 開啟選擇器

設定（<kbd>⌘,</kbd>）→ **編輯器** 分頁。你會看到一份預設清單，視選擇而定還會有 URL 欄位。

## 可用預設

| 預設 | 行為 |
|---|---|
| **Code Server (Web)** | 以 `?folder=<path>` 開啟一個託管的 [code-server](https://github.com/coder/code-server) 實例。需要 URL。 |
| **VS Code** | 觸發 `vscode://file/<path>?windowId=_blank`。 |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **Custom URL** | 你自行控制的 URL 模板，附 `{folder}` / `{folderEncoded}` 佔位符。 |
| **Disabled** | 完全隱藏 EDITOR 按鈕。 |

四個桌面 IDE 預設（VS Code、Cursor、Windsurf、Zed）依靠 OS 註冊的 URI 處理常式。如果你本機已安裝該 IDE，連結就能如預期運作。

## Web vs. 本機

每個預設打開資料夾的方式有意義上的差異：

- **code-server** 在瀏覽器內執行。URL 指向你託管的伺服器（自己的、區網上的，或經由 Tailscale 對外）。點選 EDITOR 按鈕，新分頁就會載入該資料夾。
- **本機 IDE**（VS Code、Cursor、Windsurf、Zed）需要在 *執行瀏覽器的機器* 上安裝該 IDE。連結會交給 OS，由註冊的處理常式啟動。

如果你在手機上用 purplemux，只有 code-server 預設可用 — 手機沒辦法把 `vscode://` URL 打開到桌面 App。

## code-server 設定

一個典型的本機設定，在產品內也會提示：

```bash
# 在 macOS 安裝
brew install code-server

# 執行
code-server --port 8080

# 透過 Tailscale 對外（選擇性）
tailscale serve --bg --https=8443 http://localhost:8080
```

接著在編輯器分頁，把 URL 設為 code-server 可達的位址 — 本機是 `http://localhost:8080`，若你已用 Tailscale Serve 包過則是 `https://<machine>.<tailnet>.ts.net:8443`。purplemux 會驗證 URL 必須以 `http://` 或 `https://` 開頭，並自動附加 `?folder=<absolute path>`。

{% call callout('note', '挑一個非 8022 的連接埠') %}
purplemux 已經住在 `8022`。讓 code-server 跑在不同連接埠（範例使用 `8080`），它們才不會互搶。
{% endcall %}

## 自訂 URL 模板

Custom 預設讓你指向任何在 URL 中接受資料夾的工具 — Coder workspaces、Gitpod、Theia、內部工具。模板 **必須** 至少包含其中一個佔位符：

- `{folder}` — 絕對路徑，未編碼。
- `{folderEncoded}` — URL 編碼。

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux 會在儲存時驗證模板，沒有佔位符的會被拒絕。

## 停用按鈕

選擇 **Disabled**，按鈕就會從工作區標頭消失。

## 下一步

- **[側邊欄與 Claude 選項](/purplemux/zh-TW/docs/sidebar-options/)** — 重新排序側邊欄項目、切換 Claude 旗標。
- **[自訂 CSS](/purplemux/zh-TW/docs/custom-css/)** — 進一步視覺調整。
- **[Tailscale](/purplemux/zh-TW/docs/tailscale/)** — 也用安全的對外存取連到 code-server。
