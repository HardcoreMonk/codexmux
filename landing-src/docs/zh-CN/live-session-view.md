---
title: 实时会话视图
description: 时间线面板实际上展示什么 — 消息、工具调用、任务和提示,以事件而不是 CLI 滚动条的方式呈现。
eyebrow: Claude Code
permalink: /zh-CN/docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

当一个标签在跑 Claude Code 时,purplemux 把原始终端视图替换成结构化的时间线。同一个会话、同一份 JSONL 转录 — 只是布局成可扫读、可滚动、可链接的离散事件。

## 为什么时间线优于滚动条

Claude CLI 是交互式的。要在终端里看 15 分钟前它做了什么,需要滚过此后所有东西、读折行、还要猜一个工具调用从哪结束、下一个从哪开始。

时间线保留同样的数据并加上结构:

- 每条消息、工具调用、任务或提示一行
- 工具的输入和输出归到一起
- 永久锚点 — 缓冲区填满时事件不会从顶部滑走
- 当前步骤始终钉在底部,带上耗时计数

你随时可以通过顶栏的模式切换回终端。时间线只是同一个会话的另一种视图,不是另一个会话。

## 你会看到什么

时间线的每一行对应 Claude Code JSONL 转录中的一条记录:

| 类型 | 显示 |
|---|---|
| **用户消息** | 你的提示,以聊天气泡呈现。 |
| **Assistant 消息** | Claude 的回复,以 Markdown 渲染。 |
| **工具调用** | 工具名、关键参数和响应 — `read`、`edit`、`bash` 等。 |
| **工具组** | 连续的工具调用折叠成一张卡片。 |
| **任务 / 计划** | 多步计划带勾选进度。 |
| **子代理** | 子代理调用与其各自进度归在一起。 |
| **权限提示** | 拦截的提示,与 Claude 提供的选项一致。 |
| **压缩中** | Claude 自动压缩上下文时的细微指示。 |

较长的 assistant 消息折叠为片段并提供展开按钮;较长的工具输出会被截断并有 "显示更多" 切换。

## 它如何保持实时

时间线由 `/api/timeline` 上的 WebSocket 喂数据。服务端对活跃 JSONL 文件运行 `fs.watch`,解析新追加的条目,实时推到浏览器。没有轮询、没有完整重取 — 初始 payload 发送已有条目,之后全是增量。

当 Claude 处于 `busy` 时,你还会看到:

- 当前步骤实时耗时的旋转图标
- 当前的工具调用(例如 "Reading src/lib/auth.ts")
- 最近 assistant 文本的简短片段

这些来自 JSONL 监视器的元数据通道,不改变会话状态。

## 滚动、锚点和历史

当你已经在底部时时间线会自动滚动,你滚上去阅读时它停在原地。一旦你比最新条目高一屏以上,就会出现一个浮动的 **滚到底部** 按钮。

对于长会话,旧条目会按需在向上滚动时加载。Claude 会话 ID 在 resume 时保留,所以接续昨天的会话时仍会落在你离开的地方。

{% call callout('tip', '跳到输入框') %}
在时间线任何位置按 <kbd>⌘I</kbd> 即可聚焦底部的输入栏。<kbd>Esc</kbd> 向运行中的 Claude 进程发送 interrupt。
{% endcall %}

## 内联权限提示

当 Claude 请求运行工具或修改文件时,提示直接在时间线里以行内方式出现,而不是模态。你可以点选项、按对应数字键,或忽略它然后从手机上通过 Web Push 回答。完整流程见 [权限提示](/purplemux/zh-CN/docs/permission-prompts/)。

## 同一标签上的多种模式

顶栏可以让你切换右侧面板对同一会话展示什么:

- **Claude** — 时间线(默认)
- **Terminal** — 原始 xterm.js 视图
- **Diff** — 工作目录的 Git 改动

切换模式不会重启任何东西。会话仍在 tmux 的背后运行,三个视图共用一个。

快捷键:<kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>。

## 下一步

- **[权限提示](/purplemux/zh-CN/docs/permission-prompts/)** — 内联审批流。
- **[会话状态](/purplemux/zh-CN/docs/session-status/)** — 驱动时间线指示的徽章。
- **[快捷提示与附件](/purplemux/zh-CN/docs/quick-prompts-attachments/)** — 底部输入栏能做什么。
