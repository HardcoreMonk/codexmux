---
title: PWA 设置
description: 在 iOS Safari 和 Android Chrome 上把 purplemux 添加到主屏幕,获得全屏的、像原生应用一样的体验。
eyebrow: 移动与远程
permalink: /zh-CN/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

把 purplemux 安装为 Progressive Web App 会把浏览器标签变成主屏幕上的独立图标,带来全屏布局和合适的启动屏。在 iOS 上,这也是 Web Push 的前置条件。

## 你能得到什么

- **全屏布局** — 没有浏览器界面,终端和时间线有更多垂直空间。
- **应用图标** — purplemux 像原生应用一样从主屏幕启动。
- **启动屏** — purplemux 为各 iPhone 提供了对应的启动图,启动过渡感觉原生。
- **Web Push**(仅限 iOS) — 推送通知只有在安装为 PWA 之后才生效。

manifest 在 `/api/manifest` 提供,以 `display: standalone` 注册,带上 purplemux 的标识和主题色。

## 安装之前

页面必须能通过 **HTTPS** 访问,PWA 才能工作。从 `localhost` 在 Chrome 里有效(loopback 例外),但 iOS Safari 拒绝从纯 HTTP 安装。干净的路径是 Tailscale Serve — 见 [Tailscale 访问](/purplemux/zh-CN/docs/tailscale/)。

{% call callout('warning', 'iOS 需要 Safari 16.4 或更新版本') %}
更早的 iOS 版本能装 PWA,但收不到 Web Push。如果推送对你重要,先升级 iOS。逐浏览器的细节见 [浏览器支持](/purplemux/zh-CN/docs/browser-support/)。
{% endcall %}

## iOS Safari

1. 在 **Safari** 中打开 purplemux URL(其他 iOS 浏览器对 PWA 不暴露 "添加到主屏幕")。
2. 点击底部工具栏的 **分享** 图标。
3. 在动作菜单中滚动找到 **添加到主屏幕**。
4. 如愿编辑名称,然后点右上角的 **添加**。
5. 从新出现的主屏幕图标启动 purplemux — 它会全屏打开。

从图标的首次启动是 iOS 真正把它当作 PWA 的时刻。任何推送权限提示都应在这个独立窗口内触发,而不是在普通的 Safari 标签里。

## Android Chrome

Chrome 会自动检测可安装的 manifest 并提供横幅。如果没看到:

1. 在 **Chrome** 里打开 purplemux URL。
2. 点右上角的 **⋮** 菜单。
3. 选 **安装应用**(有时显示为 **添加到主屏幕**)。
4. 确认。图标会出现在主屏幕和应用抽屉里。

Samsung Internet 表现一样 — 安装提示通常会自动出现。

## 验证安装

从主屏幕图标打开 purplemux。浏览器地址栏应该消失。如果仍能看到浏览器界面,说明 manifest 没生效 — 通常因为页面是通过纯 HTTP 加载,或者经过了不寻常的代理。

也可以在 **设置 → 通知** 中确认 — PWA 安装后并支持 Web Push 时,开关会变为可用。

## 更新 PWA

什么都不用做。PWA 加载的是 purplemux 实例提供的同一个 `index.html`,所以升级 purplemux 就等于在下次启动时升级了已安装的应用。

要移除,长按图标,选择系统原生的卸载动作。

## 下一步

- **[Web Push 通知](/purplemux/zh-CN/docs/web-push/)** — PWA 装好后开启后台提醒。
- **[Tailscale 访问](/purplemux/zh-CN/docs/tailscale/)** — 拿到 iOS 需要的 HTTPS URL。
- **[浏览器支持](/purplemux/zh-CN/docs/browser-support/)** — 完整的兼容性矩阵。
