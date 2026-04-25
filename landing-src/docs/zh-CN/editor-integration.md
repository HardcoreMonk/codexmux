---
title: 编辑器集成
description: 直接从顶栏在你选的编辑器中打开当前文件夹 — VS Code、Cursor、Zed、code-server,或自定义 URL。
eyebrow: 自定义
permalink: /zh-CN/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

每个工作区在顶栏都有一个 **EDITOR** 按钮。点击它会在你选择的编辑器中打开当前会话所在文件夹。挑一个预设、指向 URL 或依赖系统处理器,就完事了。

## 打开选择器

设置(<kbd>⌘,</kbd>) → **编辑器** 标签页。会看到预设列表,以及(根据所选项)一个 URL 输入框。

## 可选预设

| 预设 | 行为 |
|---|---|
| **Code Server (Web)** | 用 `?folder=<path>` 打开托管的 [code-server](https://github.com/coder/code-server) 实例。需要 URL。 |
| **VS Code** | 触发 `vscode://file/<path>?windowId=_blank`。 |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **自定义 URL** | 你掌控的 URL 模板,带 `{folder}` / `{folderEncoded}` 占位符。 |
| **禁用** | 完全隐藏 EDITOR 按钮。 |

四个桌面 IDE 预设(VS Code、Cursor、Windsurf、Zed)依赖 OS 注册的 URI 处理器。如果本地装了对应 IDE,链接会按预期工作。

## Web 与本地

每个预设打开文件夹的方式有重要区别:

- **code-server** 在浏览器内运行。URL 指向你正在托管的服务(本地、内网,或经 Tailscale)。点 EDITOR 会新开一个 tab 加载文件夹。
- **本地 IDE**(VS Code、Cursor、Windsurf、Zed)要求 IDE 安装在 *运行浏览器的那台机器* 上。链接交给 OS,OS 调起注册的处理器。

如果你在手机上用 purplemux,只有 code-server 预设能工作 — 手机无法把 `vscode://` URL 转交到桌面应用。

## code-server 设置

一个典型的本地设置(产品内也展示了):

```bash
# macOS 安装
brew install code-server

# 运行
code-server --port 8080

# 通过 Tailscale 提供外部访问(可选)
tailscale serve --bg --https=8443 http://localhost:8080
```

然后在 Editor 标签页把 URL 设到 code-server 可达的地址 — 本地为 `http://localhost:8080`,经 Tailscale Serve 时为 `https://<machine>.<tailnet>.ts.net:8443`。purplemux 会校验 URL 以 `http://` 或 `https://` 开头,并自动追加 `?folder=<absolute path>`。

{% call callout('note', '挑一个不是 8022 的端口') %}
purplemux 已经占了 `8022`。让 code-server 在另一个端口运行(例子用 `8080`),免得它们抢端口。
{% endcall %}

## 自定义 URL 模板

自定义预设让你指向任何把文件夹放在 URL 里的工具 — Coder workspaces、Gitpod、Theia、内部工具。模板 **必须** 包含至少一个占位符:

- `{folder}` — 绝对路径,未编码。
- `{folderEncoded}` — URL 编码。

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux 在保存时校验模板,缺占位符会被拒。

## 禁用按钮

选 **禁用**,按钮就从工作区顶栏消失。

## 下一步

- **[侧边栏与 Claude 选项](/purplemux/zh-CN/docs/sidebar-options/)** — 重排序侧边栏条目、切换 Claude 标志。
- **[自定义 CSS](/purplemux/zh-CN/docs/custom-css/)** — 进一步视觉调整。
- **[Tailscale](/purplemux/zh-CN/docs/tailscale/)** — 同样可用于 code-server 的外部安全访问。
