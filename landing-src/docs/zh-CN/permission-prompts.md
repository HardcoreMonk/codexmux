---
title: 权限提示
description: purplemux 如何拦截 Claude Code 的 "可以运行这个吗?" 对话框,让你从仪表盘、键盘或手机批准。
eyebrow: Claude Code
permalink: /zh-CN/docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code 默认会在权限对话框上阻塞 — 工具调用、文件写入等。purplemux 在它出现的瞬间抓住,然后把它路由到你刚好在用的设备。

## 什么会被拦截

Claude Code 因为多种原因触发 `Notification` hook。purplemux 只把两种通知类型当作权限提示处理:

- `permission_prompt` — 标准的 "允许该工具运行?" 对话框
- `worker_permission_prompt` — 来自子代理的同类提示

其他(空闲提醒等)在状态侧被忽略,不会把标签翻到 **needs-input** 也不会发推送。

## 触发时会发生什么

1. Claude Code 触发 `Notification` hook。`~/.purplemux/status-hook.sh` 把事件和通知类型 POST 给本地服务。
2. 服务把标签状态翻到 **needs-input**(琥珀色脉冲),并通过状态 WebSocket 广播变化。
3. 仪表盘把提示 **内联渲染到时间线**,选项与 Claude 提供的一致 — 没有模态,没有上下文切换。
4. 如果你已授予通知权限,会触发针对 `needs-input` 的 Web Push 和 / 或桌面通知。

Claude CLI 自身仍在等 stdin。purplemux 从 tmux 读出提示选项,在你选择后再把答案转发回去。

## 三种回答方式

三种等价做法:

- 在时间线里 **点击** 选项。
- **按数字** — <kbd>1</kbd>、<kbd>2</kbd>、<kbd>3</kbd>,匹配选项序号。
- 在手机上 **点推送**,深链直达该提示;在那里选一个。

选完后,purplemux 把输入送到 tmux,标签转回 **busy**,Claude 继续流式输出。无需再确认任何东西 — 那一下点击就是确认。

{% call callout('tip', '连续提示自动重取') %}
如果 Claude 接连问几个问题,只要新的 `Notification` 一到,内联提示就会用新选项重新渲染。无需先关掉上一条。
{% endcall %}

## 移动端流程

安装 PWA 并授予通知权限后,Web Push 在浏览器标签是打开、后台还是关闭都会触发:

- 通知文案为 "Input Required" 并标识会话。
- 点击它会打开 purplemux 并聚焦到该标签。
- 内联提示已经渲染好;一次点击就能选。

这就是配置 [Tailscale + PWA](/purplemux/zh-CN/docs/quickstart/#reach-it-from-your-phone) 的主要原因 — 让审批跟着你离开桌面。

## 当选项无法解析时

罕见情况下(在 purplemux 来得及读取前,提示已经从 tmux 滚动条里滚出去),选项列表会回空。时间线会显示一张 "无法读取该提示" 的卡片,带最多 4 次退避重试。如果仍失败,把该标签切到 **Terminal** 模式,在原始 CLI 中回答 — 底层 Claude 进程仍在等。

## 那空闲提醒呢?

Claude 的其他通知类型 — 比如空闲提醒 — 仍然会到达 hook 端点。服务端会记日志,但不会改变标签状态、不发推送、也不弹出 UI 提示。这是有意为之:只有 *阻塞* Claude 的事件才需要你关注。

## 下一步

- **[会话状态](/purplemux/zh-CN/docs/session-status/)** — **needs-input** 状态的含义和检测方式。
- **[实时会话视图](/purplemux/zh-CN/docs/live-session-view/)** — 内联提示在哪里渲染。
- **[浏览器支持](/purplemux/zh-CN/docs/browser-support/)** — Web Push 要求(尤其 iOS Safari 16.4+)。
