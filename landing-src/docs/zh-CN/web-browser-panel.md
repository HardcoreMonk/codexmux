---
title: Web 浏览器面板
description: 内置的浏览器标签页用来测试开发输出,可通过 purplemux CLI 控制,自带移动视口的设备模拟器。
eyebrow: 工作区与终端
permalink: /zh-CN/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

把 Web 浏览器标签页放到终端和 Claude 会话旁边。它可以跑你的本地开发服务、预发布站点,或者任何能访问的地址 — 而且能直接从 `purplemux` CLI 控制,不需要离开 shell。

## 打开浏览器标签

新建标签页并选择 **Web 浏览器** 作为面板类型。在地址栏输入 URL — `localhost:3000`、IP 或完整的 https URL。地址栏会自动补全:裸主机名和 IP 走 `http://`,其他则走 `https://`。

当 purplemux 是 macOS 原生应用(Electron 构建)时,面板以真正的 Chromium webview 运行;在普通浏览器里访问时则回退到 iframe。iframe 路径覆盖大多数页面,但无法运行那些发送 `X-Frame-Options: deny` 的站点;Electron 路径没有这个限制。

{% call callout('note', '原生应用里最完整') %}
设备模拟、CLI 截图、控制台 / 网络捕获只在 Electron 构建中工作。浏览器标签的回退方案提供地址栏、前进 / 后退和刷新,但更深的集成需要 webview。
{% endcall %}

## CLI 驱动的导航

面板暴露了一个小型 HTTP API,内置的 `purplemux` CLI 对其做了封装。从任何终端 — 包括与浏览器面板并排的那个 — 你都可以:

```bash
# 列出标签并找到 Web 浏览器标签的 ID
purplemux tab list -w <workspace-id>

# 读取当前 URL + 标题
purplemux tab browser url -w <ws> <tabId>

# 截图保存到文件(或用 --full 整页)
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# 查看最近的控制台日志(500 条环形缓冲)
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# 查看网络活动,可选地获取单个响应体
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# 在标签里执行 JavaScript 并返回序列化结果
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

CLI 通过 `~/.purplemux/cli-token` 中的 token 鉴权,从 `~/.purplemux/port` 读端口。在同一台机器上运行时无需任何参数。运行 `purplemux help` 查看完整命令,`purplemux api-guide` 查看底层 HTTP 端点。

这就是面板对 Claude 来说很有用的原因:可以让 Claude 截图、检查控制台错误、运行探测脚本 — 它跟你用的是同一套 CLI。

## 设备模拟器

做移动端工作时,把面板切到移动模式。设备选择器提供从 iPhone SE 到 14 Pro Max、Pixel 7、Galaxy S20 Ultra、iPad Mini、iPad Pro 12.9" 的预设。每个预设包含:

- 宽度 / 高度
- 设备像素比
- 匹配的移动 user agent

可以切换横竖屏,并选择缩放级别(`fit` 自动适应面板,或固定 `50% / 75% / 100% / 125% / 150%`)。切换设备时,webview 会用新 UA 重新加载,这样服务端的移动检测看到的就是手机会看到的样子。

## 下一步

- **[标签页与窗格](/purplemux/zh-CN/docs/tabs-panes/)** — 把浏览器分割到 Claude 旁边。
- **[Git 工作流面板](/purplemux/zh-CN/docs/git-workflow/)** — 另一种专用面板类型。
- **[安装](/purplemux/zh-CN/docs/installation/)** — macOS 原生应用,完整 webview 集成所在的地方。
