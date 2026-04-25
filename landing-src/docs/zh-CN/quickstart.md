---
title: 快速开始
description: 只要 Node.js 和 tmux,一分钟内即可让 purplemux 跑起来。
eyebrow: 入门
permalink: /zh-CN/docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是一个基于 Web 的终端复用器。它在一个仪表盘里集中管理所有 Claude Code 会话,用 `tmux` 保持会话存活,无论坐在桌前还是拿着手机,都能继续之前的工作。

## 开始之前

你要运行 purplemux 的机器上需要两样东西。

- **Node.js 20 或更新版本** — 用 `node -v` 检查
- **tmux** — 用 `tmux -V` 检查。3.0 以上即可

{% call callout('note', '仅支持 macOS / Linux') %}
不官方支持 Windows。purplemux 依赖 `node-pty` 和 tmux,这两者都不能在 Windows 上原生运行。WSL2 一般可以正常工作,但不在我们的测试范围内。
{% endcall %}

## 启动

一条命令搞定。无需全局安装。

```bash
npx purplemux
```

服务会在 `8022` 端口启动。打开浏览器访问:

```
http://localhost:8022
```

首次启动时会引导你设置密码并创建第一个工作区。

{% call callout('tip') %}
想要永久安装?用 `pnpm add -g purplemux && purplemux` 也可以。升级一句 `pnpm up -g purplemux` 即可。
{% endcall %}

## 打开一个 Claude 会话

在仪表盘中:

1. 在任意工作区点击 **新标签页**。
2. 选择 **Claude** 模板,或者在普通终端里直接运行 `claude`。
3. purplemux 会自动识别正在运行的 Claude CLI,实时展示状态、时间线和权限提示。

即使关掉浏览器,会话也会继续存活 — tmux 在服务端保持进程一直运行。

## 从手机上访问

默认情况下 purplemux 只绑定 `localhost`。要安全地从外部访问,推荐使用 Tailscale Serve(WireGuard 加密 + 自动 HTTPS,无需端口转发):

```bash
tailscale serve --bg 8022
```

在手机上打开 `https://<machine>.<tailnet>.ts.net`,点 **分享 → 添加到主屏幕**,purplemux 就以 PWA 的形式安装,可以在后台收到 Web Push 通知。

完整设置见 [Tailscale 访问](/purplemux/zh-CN/docs/tailscale/),iOS / Android 的具体步骤见 [PWA 设置](/purplemux/zh-CN/docs/pwa-setup/)。

## 下一步

- **[安装](/purplemux/zh-CN/docs/installation/)** — 各平台细节、macOS 原生应用、开机自启动
- **[浏览器支持](/purplemux/zh-CN/docs/browser-support/)** — 桌面 / 移动端兼容性矩阵
- **[第一个会话](/purplemux/zh-CN/docs/first-session/)** — 仪表盘导览
- **[键盘快捷键](/purplemux/zh-CN/docs/keyboard-shortcuts/)** — 所有按键绑定一览
