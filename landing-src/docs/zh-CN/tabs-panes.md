---
title: 标签页与窗格
description: 工作区里标签页的工作方式、如何分割窗格,以及在它们之间移动焦点的快捷键。
eyebrow: 工作区与终端
permalink: /zh-CN/docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

一个工作区被切分为若干 **窗格**,每个窗格里又叠着一摞 **标签页**。分割让你并排查看多个东西;标签页让一个窗格容纳多个 shell 而不挤占屏幕空间。

## 标签页

每个标签页都是一个真正的 shell,挂接在 tmux 会话上。标签页标题来自前台进程 — 输入 `vim` 标签页就改名为 vim;退出后变回目录名。

| 操作 | macOS | Linux / Windows |
|---|---|---|
| 新标签页 | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| 关闭标签页 | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| 上一个标签页 | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| 下一个标签页 | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| 跳到标签页 1–9 | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

在标签栏中拖动标签页可以重新排序。标签栏末尾的 **+** 按钮和 <kbd>⌘T</kbd> 一样会打开模板选择器。

{% call callout('tip', '不止 Terminal 模板') %}
新标签菜单允许选择 **Terminal**、**Claude**、**Diff** 或 **Web 浏览器** 作为面板类型。它们都是标签页 — 你可以在同一个窗格里混用,并用上面的快捷键切换。
{% endcall %}

## 分割窗格

标签页共享屏幕空间。如果想同时看到两件事,就把窗格分割。

| 操作 | macOS | Linux / Windows |
|---|---|---|
| 向右分割 | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| 向下分割 | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

新分割沿用工作区的默认目录,以一个空终端标签开始。每个窗格有自己的标签栏,所以右侧窗格可以承载差异查看器,而左侧窗格运行 `claude`。

## 在窗格之间移动焦点

用方向快捷键 — 它们走的是分割树,所以从深层嵌套的窗格按 <kbd>⌘⌥→</kbd> 仍能落到视觉上相邻的那个。

| 操作 | macOS | Linux / Windows |
|---|---|---|
| 焦点向左 | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| 焦点向右 | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| 焦点向上 | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| 焦点向下 | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## 调整大小与等分

拖动窗格之间的分隔线进行精细控制,或者用键盘:

| 操作 | macOS | Linux / Windows |
|---|---|---|
| 向左缩放 | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| 向右缩放 | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| 向上缩放 | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| 向下缩放 | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| 等分分割 | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

布局飘向不可用极值时,等分是最快的复位方式。

## 清屏

<kbd>⌘K</kbd> 清空当前窗格的终端,跟大多数原生终端一样。shell 进程仍在运行,只是可见缓冲区被擦除。

| 操作 | macOS | Linux / Windows |
|---|---|---|
| 清屏 | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## 标签页扛得住一切

关闭标签页会终止其 tmux 会话。关闭 *浏览器*、刷新或断网都不会 — 每个标签页都在服务端继续运行。重新打开时,相同的窗格、分割和标签页都会回来。

跨服务器重启的恢复方式见 [保存与恢复布局](/purplemux/zh-CN/docs/save-restore/)。

## 下一步

- **[保存与恢复布局](/purplemux/zh-CN/docs/save-restore/)** — 这种布局是怎么持续存在的。
- **[键盘快捷键](/purplemux/zh-CN/docs/keyboard-shortcuts/)** — 所有按键绑定一览。
- **[Git 工作流面板](/purplemux/zh-CN/docs/git-workflow/)** — 一个适合扔进分割窗格的标签类型。
