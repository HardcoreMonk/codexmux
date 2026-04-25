---
title: 主题与字体
description: 浅色、深色,或跟随系统;三档字号;统一在一个设置面板。
eyebrow: 自定义
permalink: /zh-CN/docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 走一致的视觉风格,只提供一小组开关:应用主题、字号,以及独立的终端调色板。本页讲前两项 — 终端配色单独有一页。

## 打开设置

按 <kbd>⌘,</kbd>(macOS)或 <kbd>Ctrl,</kbd>(Linux)打开设置。**通用** 标签页就是主题和字号所在。

也可以点击顶栏的齿轮图标。

## 应用主题

三种模式,即时生效:

| 模式 | 行为 |
|---|---|
| **浅色** | 强制浅色主题,不论 OS 偏好。 |
| **深色** | 强制深色主题。 |
| **跟随系统** | 跟随 OS — macOS / GNOME / KDE 在浅深之间切换时自动同步。 |

主题存放在 `~/.purplemux/config.json` 的 `appTheme` 字段,并同步到连接到该服务的每个浏览器标签。在 macOS 原生应用里,OS 标题栏也会跟着更新。

{% call callout('note', '深色优先设计') %}
品牌围绕深紫调中性色构建,深色模式把饱和度压到零,得到严格的无色表面。浅色模式应用了几乎察觉不到的紫色色调(色相 287)以增添温暖。两者都为长会话调过;选你眼睛喜欢的。
{% endcall %}

## 字号

三个预设,以按钮组形式呈现:

- **正常** — 默认;根字号跟随浏览器。
- **大** — 根字号设为 `18px`。
- **超大** — 根字号设为 `20px`。

因为整个 UI 用 `rem` 度量,切换预设会同时缩放整个界面 — 侧边栏、对话框、终端。改动实时生效,不需要刷新。

## 哪些会变,哪些不变

字号会缩放 **UI 框架和终端文本**。它不改变:

- 标题层级(相对大小保持不变)
- 间距 — 比例被保留
- 代码块的语法配色

如果想单独调整某些元素(例如只改终端,或只改侧边栏),见 [自定义 CSS](/purplemux/zh-CN/docs/custom-css/)。

## 按设备,而非按浏览器

设置存放在服务端,不是 localStorage。你在笔记本上切到深色,手机也会切到深色 — 从手机打开 `https://<host>/`,改动已经在那里。

如果想让移动和桌面保持不同,目前不支持;有需要请提 issue。

## 下一步

- **[自定义 CSS](/purplemux/zh-CN/docs/custom-css/)** — 覆盖单独的颜色和间距。
- **[终端主题](/purplemux/zh-CN/docs/terminal-themes/)** — xterm.js 的独立调色板。
- **[键盘快捷键](/purplemux/zh-CN/docs/keyboard-shortcuts/)** — 完整按键绑定表。
