---
title: 保存与恢复布局
description: 为什么你的标签页能精确回到离开时的位置 — 哪怕服务器重启之后。
eyebrow: 工作区与终端
permalink: /zh-CN/docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 的核心理念是:在浏览器里关掉标签页不应该结束会话。两块东西一起工作:tmux 让 shell 持续运行,`~/.purplemux/workspaces.json` 记住布局。

## 哪些东西被持久化

在工作区里能看到的所有东西:

- 标签页及其顺序
- 窗格分割及其比例
- 每个标签页的面板类型 — Terminal、Claude、Diff、Web 浏览器
- 每个 shell 的工作目录
- 工作区分组、名称和顺序

`workspaces.json` 在每次布局变更时事务性更新,所以文件始终反映当前状态。磁盘文件结构见 [数据目录](/purplemux/zh-CN/docs/data-directory/)。

## 关闭浏览器

关闭标签页、刷新、合上笔记本盖。它们都不会终止会话。

每个 shell 都跑在专用的 `purple` socket 上的 tmux 会话里 — 与你个人的 `~/.tmux.conf` 完全隔离。一小时后再次打开 `http://localhost:8022`,WebSocket 会重新接入同一个 tmux 会话,重放回滚缓冲,把活跃 PTY 交还给 xterm.js。

不是恢复任何东西;是重新连接。

{% call callout('tip', '手机也一样') %}
同样适用于你的手机。关闭 PWA、锁定设备、明天再回来 — 仪表盘会重新接入,一切照旧。
{% endcall %}

## 服务器重启后的恢复

重启确实会杀掉 tmux 进程 — 它们也只是普通的操作系统进程。purplemux 在下次启动时处理:

1. **读取布局** — `workspaces.json` 描述了每个工作区、窗格和标签页。
2. **并行重建会话** — 对每个标签页,在保存的工作目录中启动一个新的 tmux 会话。
3. **自动恢复 Claude** — 之前在跑 Claude 的标签页会用 `claude --resume {sessionId}` 重启,让对话从离开的地方继续。

"并行" 这点很关键:如果你有十个标签页,所有十个 tmux 会话会同时启动而不是一个接一个。等你打开浏览器时,布局已经在那里了。

## 不会回来的东西

有几样东西无法持久化:

- **内存中的 shell 状态** — 你设置的环境变量、后台任务、思路一半的 REPL。
- **正在等待的权限提示** — 服务挂掉时如果 Claude 在等权限决定,恢复后会再次看到该提示。
- **`claude` 之外的前台进程** — `vim` 缓冲区、`htop`、`docker logs -f`。shell 仍在同一个目录,但进程已不在。

这是 tmux 的标准契约:shell 活下来,但里面的进程不一定。

## 手动控制

通常不需要碰这些,以下是好奇用:

- tmux socket 名为 `purple`。用 `tmux -L purple ls` 查看。
- 会话命名为 `pt-{workspaceId}-{paneId}-{tabId}`。
- 在 purplemux 运行时编辑 `workspaces.json` 不安全 — 服务持有它并写入。

更深的细节(二进制协议、背压、JSONL 监视)见落地页的 [工作原理](/purplemux/#how)。

## 下一步

- **[工作区与分组](/purplemux/zh-CN/docs/workspaces-groups/)** — 每个工作区都保存了什么。
- **[标签页与窗格](/purplemux/zh-CN/docs/tabs-panes/)** — 每个标签页都保存了什么。
- **[浏览器支持](/purplemux/zh-CN/docs/browser-support/)** — 关于移动后台标签页和重连的已知注意事项。
