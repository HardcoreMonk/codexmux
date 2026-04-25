---
title: 第一个会话
description: 仪表盘导览 — 从空白工作区到第一个正在运行并被监控的 Claude 会话。
eyebrow: 入门
permalink: /zh-CN/docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

假设 purplemux 已经在运行(还没有的话见 [快速开始](/purplemux/zh-CN/docs/quickstart/))。这页讲讲 UI 实际上能做什么,让最初几分钟少一点抽象感。

## 仪表盘

打开 `http://localhost:8022`,你会进入一个 **工作区**。把工作区想成一组相关标签页 — 一个用于你正在做 Claude 编码的项目,另一个用于你在写的文档,再一个用于临时 shell 工作。

布局:

- **左侧栏** — 工作区和会话、Claude 状态徽章、配额组件、笔记、统计
- **主区域** — 当前工作区内的窗格;每个窗格可以有多个标签页
- **顶栏** — 工作区名称、分割控制、设置

随时按 <kbd>⌘B</kbd> 切换侧边栏。在侧边栏中按 <kbd>⌘⇧B</kbd> 切换 工作区 / 会话 模式。

## 创建工作区

首次启动时会有一个默认工作区。再加一个:

1. 点击侧边栏顶部的 **+ 新建工作区**(<kbd>⌘N</kbd>)。
2. 起个名字并选择默认目录 — 这是新标签页 shell 启动时所在的位置。
3. 按回车。空工作区会被打开。

之后可以在侧边栏里拖动来重新排序和重命名工作区。

## 打开第一个标签页

工作区刚开始是空的。按 <kbd>⌘T</kbd> 或点击标签栏上的 **+** 按钮添加标签页。

选择一个 **模板**:

- **Terminal** — 一个空白 shell。适合 `vim`、`docker`、脚本。
- **Claude** — 启动后 shell 里就已经在运行 `claude`。

{% call callout('tip', '模板只是快捷方式') %}
本质上每个标签页都是一个普通 shell。Claude 模板不过是 "打开一个终端然后运行 `claude`"。如果你之后在 Terminal 标签里手动运行 `claude`,purplemux 也会注意到并以同样的方式开始展示状态。
{% endcall %}

## 阅读会话状态

看一眼 **侧边栏会话行**。你会看到下面其中一个指示:

| 状态 | 含义 |
|---|---|
| **Idle**(灰色) | Claude 在等你输入。 |
| **Busy**(紫色加载中) | Claude 正在工作 — 读文件、运行工具。 |
| **Needs input**(琥珀色) | Claude 触发了权限提示或在问问题。 |
| **Review**(蓝色) | 工作完成,Claude 已停下;有东西需要你检查。 |

转换几乎是即时的。检测原理见 [会话状态](/purplemux/zh-CN/docs/session-status/)。

## 响应权限提示

当 Claude 请求运行工具或修改文件时,purplemux **拦截这个提示** 并在会话视图中内联显示。你可以:

- 点击 **1 · Yes** / **2 · Yes, always** / **3 · No**,或者
- 在键盘上按对应数字键,或者
- 不管它,在手机上回答 — 移动端 Web Push 会触发同样的提醒。

Claude CLI 实际上不会因为被拦截的提示而阻塞;purplemux 把你的回答传回去。

## 分割与切换

跑起一个标签页之后,可以试试:

- <kbd>⌘D</kbd> — 把当前窗格向右分割
- <kbd>⌘⇧D</kbd> — 向下分割
- <kbd>⌘⌥←/→/↑/↓</kbd> — 在分割之间移动焦点
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — 上一个 / 下一个标签页

完整列表见 [键盘快捷键](/purplemux/zh-CN/docs/keyboard-shortcuts/) 页面。

## 保存与恢复

关掉浏览器吧。你的标签页不会消失 — tmux 在服务端保持它们存活。一小时(或一周)之后刷新,purplemux 会恢复完全相同的布局,包括分割比例和工作目录。

即便服务器重启也能恢复:重启时,purplemux 会从 `~/.purplemux/workspaces.json` 读取保存的布局,在正确的目录下重启 shell,并尽可能重新接入 Claude 会话。

## 从手机上访问

运行:

```bash
tailscale serve --bg 8022
```

在手机上打开 `https://<machine>.<tailnet>.ts.net`,点 **分享 → 添加到主屏幕**,并允许通知权限。即使标签页已关闭,你也能在 **needs-input** 和 **review** 状态时收到推送提醒。

完整教程:[PWA 设置](/purplemux/zh-CN/docs/pwa-setup/) · [Web Push](/purplemux/zh-CN/docs/web-push/) · [Tailscale](/purplemux/zh-CN/docs/tailscale/)。

## 下一步

- **[键盘快捷键](/purplemux/zh-CN/docs/keyboard-shortcuts/)** — 所有按键绑定一览。
- **[浏览器支持](/purplemux/zh-CN/docs/browser-support/)** — 兼容性矩阵,特别是 iOS Safari 16.4+。
- 探索侧边栏:**笔记**(<kbd>⌘⇧E</kbd>)用于 AI 每日报告,**统计**(<kbd>⌘⇧U</kbd>)用于使用分析。
