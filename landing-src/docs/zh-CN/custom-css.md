---
title: 自定义 CSS
description: 覆盖 CSS 变量来重新调校颜色、间距和单独的表面。
eyebrow: 自定义
permalink: /zh-CN/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 建立在一套 CSS 变量系统上。你几乎可以在不改源码的情况下改动任何视觉 — 在 **外观** 标签页粘贴规则,点应用,即可在每个连接的客户端立即生效。

## 在哪里写

打开设置(<kbd>⌘,</kbd>),选 **外观**。你会看到一个标着自定义 CSS 的文本框。

1. 写下你的规则。
2. 点 **应用**。CSS 会注入到每个页面的 `<style>` 标签里。
3. 点 **重置** 清除所有覆盖。

CSS 存在服务端的 `~/.purplemux/config.json`(`customCSS`),所以会应用在所有连接的设备上。

{% call callout('note', '全服务端范围,不是按设备') %}
自定义 CSS 存在服务端配置里,跟着你到每个浏览器。如果想让某台设备看起来不同,目前不支持。
{% endcall %}

## 工作原理

purplemux 中大多数颜色、表面和强调色暴露为 `:root`(浅色)和 `.dark` 下的 CSS 变量。覆盖一个变量会把改动级联到所有用到它的地方 — 侧边栏、对话框、图表、状态徽章。

改单个变量几乎总是优于直接覆盖组件选择器。组件类不是稳定 API;变量是。

## 一个最小例子

让浅色模式下侧边栏稍微暖一点,深色模式下背景更深:

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

或者重新染色品牌色而不动其他:

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## 变量分组

外观面板的 **可用变量** 处暴露完整列表。主要分组有:

- **表面** — `--background`、`--card`、`--popover`、`--muted`、`--secondary`、`--accent`、`--sidebar`
- **文本** — `--foreground` 和对应的 `*-foreground` 变体
- **交互** — `--primary`、`--primary-foreground`、`--destructive`
- **边框** — `--border`、`--input`、`--ring`
- **调色板** — `--ui-blue`、`--ui-teal`、`--ui-coral`、`--ui-amber`、`--ui-purple`、`--ui-pink`、`--ui-green`、`--ui-gray`、`--ui-red`
- **语义** — `--positive`、`--negative`、`--accent-color`、`--brand`、`--focus-indicator`、`--claude-active`

完整 token 列表(包含默认 OKLCH 值和设计逻辑)见仓库的 [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md)。该文档是事实来源。

## 只针对一种模式

把规则包在 `:root` 里(浅色)和 `.dark` 里(深色)。该 class 由 `next-themes` 设在 `<html>` 上。

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

只想改一种模式时,把另一种保持原样即可。

## 终端怎么办

xterm.js 终端有自己的调色板,从一份精选列表中选择 — 不被这些 CSS 变量驱动。在 **终端** 标签页里切换。见 [终端主题](/purplemux/zh-CN/docs/terminal-themes/)。

## 下一步

- **[主题与字体](/purplemux/zh-CN/docs/themes-fonts/)** — 浅色 / 深色 / 跟随系统;字号预设。
- **[终端主题](/purplemux/zh-CN/docs/terminal-themes/)** — 终端区域的独立调色板。
- **[侧边栏与 Claude 选项](/purplemux/zh-CN/docs/sidebar-options/)** — 重排序条目、切换 Claude 标志。
