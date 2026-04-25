---
title: 浏览器支持
description: 桌面和移动端兼容性矩阵,以及一些浏览器特有的注意事项。
eyebrow: 入门
permalink: /zh-CN/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是个 Web 应用,使用体验取决于打开它的浏览器。下面这些是我们持续测试的版本 — 更早的浏览器或许能用,但不在支持范围内。

## 桌面端

| 浏览器 | 最低版本 | 备注 |
|---|---|---|
| Chrome | 110+ | 推荐。完整 PWA + Web Push。 |
| Edge | 110+ | 与 Chrome 同源,支持情况一致。 |
| Safari | 17+ | macOS Sonoma+ 完整支持 PWA。Web Push 需要 macOS 13+ 并安装为 PWA。 |
| Firefox | 115+ ESR | 工作良好。PWA 安装需要手动操作(没有安装提示)。 |

xterm.js 终端、实时时间线、Claude 会话视图、Git 差异面板等所有功能在这些引擎上表现一致。

## 移动端

| 浏览器 | 最低版本 | 备注 |
|---|---|---|
| iOS Safari | **16.4+** | Web Push 必需。必须先 **添加到主屏幕**;普通标签页无法接收推送。 |
| Android Chrome | 110+ | Web Push 在普通标签页也能工作,但仍建议安装为 PWA 以获得全屏布局。 |
| Samsung Internet | 22+ | 可用。安装提示会自动出现。 |

{% call callout('warning', 'iOS Safari ≥ 16.4 是分水岭') %}
Apple 直到 Safari 16.4(2023 年 3 月)才在 iOS 上加入 Web Push。更早的 iOS 版本仍然可以用仪表盘,但即使安装了 PWA 也收不到推送通知。
{% endcall %}

## 功能依赖

purplemux 用到了一些现代浏览器 API。如果其中某个不可用,应用会优雅降级,只是丢掉对应的功能。

| API | 用途 | 降级行为 |
|---|---|---|
| WebSocket | 终端 I/O、状态同步、时间线 | 硬性要求,无降级。 |
| Clipboard API | 复制 `npx purplemux`、复制代码块 | 按钮在不可用时被隐藏。 |
| Notifications API | 桌面 / 移动端推送 | 跳过 — 你仍能在应用内看到状态。 |
| Service Workers | PWA + Web Push | 仅作为普通 Web 应用提供。 |
| IntersectionObserver | 实时会话时间线、导航出现 | 元素无动画地直接渲染。 |
| `backdrop-filter` | 半透明导航栏、对话框 | 回退到带色调的实心背景。 |
| CSS `color-mix()` + OKLCH | 主题变量 | Safari < 16.4 会丢失部分着色状态。 |

## 我的浏览器是否符合要求?

purplemux 内置了一个自检工具,在 **设置 → 浏览器检查** 中运行。它会执行上面列出的探测,并对每个特性给出绿 / 黄 / 红的状态徽章,无需自己对照规范表。

## 已知注意事项

- **Safari 17 + 隐私窗口** — IndexedDB 被禁用,工作区缓存不会跨重启保留。请用普通窗口。
- **iOS Safari + 后台标签页** — 终端在后台 30 秒左右会被回收。tmux 仍保持真实会话存活;返回时 UI 会自动重连。
- **Firefox + Tailscale Serve 证书** — 如果你用了不在 `ts.net` 下的自定义 tailnet 名称,Firefox 在 HTTPS 信任上比 Chrome 严格。接受证书一次后会持续生效。
- **自签名证书** — Web Push 直接拒绝注册。请改用 Tailscale Serve(自动 Let's Encrypt)或真实域名 + 反向代理。

## 不支持

- **Internet Explorer** — 永不支持。
- **UC 浏览器、Opera Mini、Puffin** — 这类基于代理的浏览器破坏 WebSocket。无法工作。
- **任何超过 3 年的浏览器** — 我们的 CSS 用到了 OKLCH 颜色和容器查询,需要 2023 年代左右的引擎。

如果你用的是某种特殊配置且某些功能无法工作,请提交 [issue](https://github.com/subicura/purplemux/issues),附上 user agent 和自检输出。
