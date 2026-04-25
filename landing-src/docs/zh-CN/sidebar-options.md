---
title: 侧边栏与 Claude 选项
description: 重排序和隐藏侧边栏快捷方式、管理快捷提示库、切换 Claude CLI 标志。
eyebrow: 自定义
permalink: /zh-CN/docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

侧边栏和输入栏由若干你可以重塑的小列表组成 — 侧边栏底部的快捷方式、输入栏上方的提示按钮。设置中的 Claude 标签页则承载从仪表盘启动的会话相关的 CLI 级别开关。

## 侧边栏条目

设置(<kbd>⌘,</kbd>) → **侧边栏** 标签页。该列表控制侧边栏底部的快捷方式行 — 链接到仪表盘、内部工具,或任何带 URL 的资源。

每行有抓手、名称、URL 和开关。你可以:

- **拖动** 抓手重排序。内置和自定义条目都能自由移动。
- **切换** 开关来隐藏条目而不删除。
- **编辑** 自定义条目(铅笔图标) — 修改名称、图标或 URL。
- **删除** 自定义条目(垃圾桶图标)。
- **重置为默认** — 恢复内置条目、删除所有自定义、清除排序。

### 添加自定义条目

点击底部的 **添加条目**。会出现一个小表单:

- **名称** — 显示为提示文字和标签。
- **图标** — 在可搜索的 lucide-react 图库中挑。
- **URL** — 任何 `http(s)://...` 都行。内部 Grafana、Vercel 仪表盘、内部管理工具皆可。

点保存,行会出现在列表底部。把它拖到你想要的位置。

{% call callout('note', '内置可隐藏,不可删除') %}
内置条目(purplemux 自带的)只有开关和抓手 — 没有编辑或删除。它们一直在那里,以便你改变主意。自定义条目则有完整的工具集。
{% endcall %}

## 快捷提示

设置 → **快捷提示** 标签页。这些是 Claude 输入框上方的按钮 — 一键发送预设的消息。

模式与侧边栏条目相同:

- 拖动重排序。
- 切换隐藏。
- 编辑 / 删除自定义提示。
- 重置为默认。

添加提示时填 **名称**(按钮文字)和 **提示** 本身(多行文本)。用它来装那些你常打的内容:"运行测试套件"、"总结上次提交"、"审阅当前 diff"。

## Claude CLI 选项

设置 → **Claude** 标签页。这些标志影响 *purplemux 在新标签里如何启动 Claude CLI* — 它们不改变已经在运行的会话的行为。

### 跳过权限检查

把 `--dangerously-skip-permissions` 加到 `claude` 命令上。Claude 会运行工具和编辑文件而不再每次询问。

这就是官方 CLI 暴露的同一个标志 — purplemux 没有在它之上再放松什么安全。打开之前请先读 [Anthropic 的文档](https://docs.anthropic.com/en/docs/claude-code/cli-reference)。把它当作只对可信工作区开放的选项。

### 与 Claude 一同显示终端

**开** 时(默认):Claude 标签同时并排显示实时会话视图 *和* 底层终端窗格,你可以随时切到 shell。

**关** 时:新 Claude 标签以折叠的终端打开,会话视图占满整个窗格。你仍可以按需手动展开终端;此项只改变新建标签的默认行为。

如果你主要靠时间线视图驱动 Claude 并希望默认更整洁,选择关闭。

## 下一步

- **[主题与字体](/purplemux/zh-CN/docs/themes-fonts/)** — 浅 / 深 / 跟随系统;字号预设。
- **[编辑器集成](/purplemux/zh-CN/docs/editor-integration/)** — 接入 VS Code、Cursor、code-server。
- **[第一个会话](/purplemux/zh-CN/docs/first-session/)** — 复习仪表盘布局。
