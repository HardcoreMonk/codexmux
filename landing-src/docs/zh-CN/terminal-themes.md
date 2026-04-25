---
title: 终端主题
description: xterm.js 终端的独立调色板 — 浅色一套、深色一套。
eyebrow: 自定义
permalink: /zh-CN/docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

终端窗格使用 xterm.js,自带调色板,与其余 UI 独立。你为深色和浅色各挑一套主题;purplemux 会跟着应用主题切换。

## 打开选择器

设置(<kbd>⌘,</kbd>) → **终端** 标签页。会看到 Dark 和 Light 两个子标签,每个都是一组主题卡片。点击其中一个,所有打开的终端立刻应用。

## 为什么要独立调色板

终端应用依赖 16 色 ANSI 调色板(red、green、yellow、blue、magenta、cyan,加上各自的 bright 变体)。UI 调色板是有意压低饱和度的,直接用会让终端输出难以阅读。专门的调色板让 `vim`、`git diff`、语法高亮和 TUI 工具能正确渲染。

每个主题定义:

- 背景、前景、光标、选区
- 八种基本 ANSI 颜色(black、red、green、yellow、blue、magenta、cyan、white)
- 八种 bright 变体

## 内置主题

**深色**

- Snazzy *(默认)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**浅色**

- Catppuccin Latte *(默认)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

卡片预览把七种核心 ANSI 颜色置于主题背景上,可以在确定之前肉眼判断对比度。

## 浅 / 深切换怎么工作

你独立挑选 **一个深色主题** 和 **一个浅色主题**。当前激活由解析后的应用主题决定:

- 应用主题为 **深色** → 使用你选的深色主题。
- 应用主题为 **浅色** → 使用你选的浅色主题。
- 应用主题为 **跟随系统** → 跟随 OS,自动切换。

所以应用主题选 "跟随系统",两侧都配置好,就能得到一个跟随 OS 昼夜切换的终端,不需要额外设置。

{% call callout('tip', '匹配应用,或刻意对比') %}
有人喜欢终端跟其他 UI 一致。也有人偏爱在浅色应用里用高对比度的 Dracula 或 Tokyo Night 终端。两种都行;选择器不强制。
{% endcall %}

## 按主题,而非按标签页

选择是全局的。每个终端窗格、每个 Claude 会话都用相同的激活主题。没有按标签页覆盖;有需要请提 issue。

## 添加自己的主题

UI 中目前没有自定义主题入口。内置列表在 `src/lib/terminal-themes.ts`。如果你从源码构建可以追加自己的;否则的话,正规途径是提 PR 加入新主题。

## 下一步

- **[主题与字体](/purplemux/zh-CN/docs/themes-fonts/)** — 应用主题和字号。
- **[自定义 CSS](/purplemux/zh-CN/docs/custom-css/)** — 覆盖其余 UI。
- **[编辑器集成](/purplemux/zh-CN/docs/editor-integration/)** — 用外部编辑器打开文件。
