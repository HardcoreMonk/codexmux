---
title: 会话状态
description: purplemux 如何把 Claude Code 的活动转换成四态徽章 — 以及为什么它几乎是即时更新。
eyebrow: Claude Code
permalink: /zh-CN/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

侧边栏中每个会话都带一个彩色圆点,一眼就能看出 Claude 在做什么。本页解释这四种状态从哪来,以及它们如何在你不去看终端的情况下保持同步。

## 四种状态

| 状态 | 指示 | 含义 |
|---|---|---|
| **Idle** | 无 / 灰色 | Claude 在等待你的下一条提示。 |
| **Busy** | 紫色加载中 | Claude 在处理 — 读、改、跑工具。 |
| **Needs input** | 琥珀色脉冲 | 有权限提示或问题在等你回应。 |
| **Review** | 紫色脉冲 | Claude 完成了,有东西需要你检查。 |

第五个值 **unknown** 会短暂出现在那些服务器重启时还在 `busy` 状态的标签上。一旦 purplemux 能够重新校验,它会自行解析。

## hook 是事实来源

purplemux 在 `~/.purplemux/hooks.json` 安装一份 Claude Code hook 配置,并在 `~/.purplemux/status-hook.sh` 安装一个微型 shell 脚本。该脚本注册到五个 Claude Code hook 事件,每次都用 CLI token 把事件 POST 给本地服务:

| Claude Code hook | 对应状态 |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification`(仅权限) | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | 显示压缩中指示(状态不变) |

因为 hook 在 Claude Code 转换的瞬间就触发,侧边栏的更新比你在终端里注意到还要早。

{% call callout('note', '只关心权限通知') %}
Claude 的 `Notification` hook 因为多种原因触发。purplemux 仅在通知是 `permission_prompt` 或 `worker_permission_prompt` 时翻到 **needs-input**。空闲提醒和其他通知类型不会触发徽章。
{% endcall %}

## 进程检测并行运行

Claude CLI 是否真的在跑,跟工作状态分开追踪。两条路径协作:

- **tmux 标题变化** — 每个窗格把 `pane_current_command|pane_current_path` 报为标题。xterm.js 通过 `onTitleChange` 通知,purplemux 调 `/api/check-claude` 确认。
- **进程树遍历** — 服务端,`detectActiveSession` 看窗格的 shell PID,遍历其子进程,与 `~/.claude/sessions/` 下 Claude 写的 PID 文件匹配。

如果该目录不存在,UI 会显示 "Claude 未安装" 屏而不是状态点。

## JSONL 监视器填空白

Claude Code 为每个会话在 `~/.claude/projects/` 下写一个 JSONL 转录文件。当一个标签处于 `busy`、`needs-input`、`unknown` 或 `ready-for-review` 时,purplemux 用 `fs.watch` 监视该文件,有两个目的:

- **元数据** — 当前工具、最近的 assistant 片段、token 计数。这些流入时间线和侧边栏,但不改变状态。
- **合成 interrupt** — 当你在流过程中按 Esc,Claude 会把 `[Request interrupted by user]` 写入 JSONL 但不触发任何 hook。监视器检测到这一行后合成一个 `interrupt` 事件,让标签回到 idle 而不是卡在 busy。

## 轮询是兜底,不是引擎

每 30–60 秒(取决于标签数)运行一次元数据轮询。它 **不** 决定状态 — 那严格归 hook 路径所有。轮询的目的是:

- 发现新的 tmux 窗格
- 恢复任何已经 busy 超过 10 分钟、但 Claude 进程已死的会话
- 刷新进程信息、端口和标题

这就是落地页提到的 "5–15 秒兜底轮询",在 hook 证明可靠之后已被放慢和收窄。

## 服务器重启后的存活

purplemux 关闭期间 hook 无法触发,所以任何在途状态都可能过期。恢复规则是保守的:

- 持久化的 `busy` 变成 `unknown` 并被重新校验:如果 Claude 不在跑,标签静默翻到 idle;如果 JSONL 干净结束,变为 review。
- 其他状态 — `idle`、`needs-input`、`ready-for-review` — 球在你那一边,所以保持原样。

恢复期间的自动状态变更不会推送通知。只有 *新的* 工作进入 needs-input 或 review 时才提醒你。

## 状态出现在哪

- 侧边栏会话行的圆点
- 每个窗格的标签栏圆点
- 工作区圆点(整个工作区中优先级最高的状态)
- 铃铛图标计数和通知面板
- 浏览器标签页标题(计入需关注项)
- 针对 `needs-input` 和 `ready-for-review` 的 Web Push 与桌面通知

## 下一步

- **[权限提示](/purplemux/zh-CN/docs/permission-prompts/)** — **needs-input** 状态背后的工作流。
- **[实时会话视图](/purplemux/zh-CN/docs/live-session-view/)** — 标签处于 `busy` 时时间线显示什么。
- **[第一个会话](/purplemux/zh-CN/docs/first-session/)** — 在上下文中浏览仪表盘。
