---
title: Web Push 通知
description: 针对 needs-input 和任务完成状态的后台推送提醒,即便浏览器标签已关闭也能收到。
eyebrow: 移动与远程
permalink: /zh-CN/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push 让 purplemux 在 Claude 会话需要你关注时提醒你 — 权限提示、任务完成 — 哪怕你已经关掉了标签页。点一下通知,直接落到那个会话上。

## 什么会触发通知

purplemux 在你看到的侧边栏彩色徽章相同的转换上发推送。

- **Needs input** — Claude 触发了权限提示或在问问题。
- **任务完成** — Claude 完成了一轮(**review** 状态)。

idle 和 busy 转换有意不推送。它们是噪音。

## 启用

开关在 **设置 → 通知**。步骤:

1. 打开 **设置 → 通知**,把开关 **打开**。
2. 浏览器请求通知权限 — 授予。
3. purplemux 用服务端的 VAPID 密钥注册一个 Web Push 订阅。

订阅存放在 `~/.purplemux/push-subscriptions.json`,标识你这台特定的浏览器/设备。每个想接收通知的设备都要重复一次。

{% call callout('warning', 'iOS 需要 Safari 16.4 + 一个 PWA') %}
在 iPhone 和 iPad 上,Web Push 只在你把 purplemux 添加到主屏幕并从该图标启动后才生效。从独立 PWA 窗口里打开设置页 — 在普通 Safari 标签中触发的通知权限提示是空操作。先设置好 PWA:[PWA 设置](/purplemux/zh-CN/docs/pwa-setup/)。
{% endcall %}

## VAPID 密钥

purplemux 在首次运行时生成一个应用服务端的 VAPID 密钥对,存放在 `~/.purplemux/vapid-keys.json`(权限 `0600`)。你不需要做任何事 — 订阅时公钥会自动提供给浏览器。

如果你需要重置所有订阅(例如轮换密钥之后),删除 `vapid-keys.json` 和 `push-subscriptions.json` 然后重启 purplemux。每个设备需要重新订阅。

## 后台投递

订阅之后,你的手机通过 OS 推送服务接收通知:

- **iOS** — 通过 Safari 的 Web Push 桥到 APNs。投递是尽力而为,在手机被严重节流时可能合并。
- **Android** — 通过 Chrome 走 FCM。一般是即时的。

无论 purplemux 是否在前台,通知都会到达。如果仪表盘当前在你 *任意* 一台设备上可见,purplemux 会跳过推送以避免双重打扰。

## 点击进入

点击通知会直接打开 purplemux 到触发它的会话。如果 PWA 已在运行,焦点切到对应标签;否则应用启动并直接导航过去。

## 故障排查

- **开关变灰** — Service Workers 或 Notifications API 不被支持。运行 **设置 → 浏览器检查**,或见 [浏览器支持](/purplemux/zh-CN/docs/browser-support/)。
- **权限被拒绝** — 在浏览器设置里清掉该站点的通知权限,然后在 purplemux 重新打开。
- **iOS 上没推送** — 确认是从主屏幕图标启动的,不是 Safari。确认 iOS 是 **16.4 或更新**。
- **自签名证书** — Web Push 拒绝注册。请用 Tailscale Serve 或带真实证书的反向代理。见 [Tailscale 访问](/purplemux/zh-CN/docs/tailscale/)。

## 下一步

- **[PWA 设置](/purplemux/zh-CN/docs/pwa-setup/)** — iOS 推送的前提。
- **[Tailscale 访问](/purplemux/zh-CN/docs/tailscale/)** — 外部投递所需的 HTTPS。
- **[安全与认证](/purplemux/zh-CN/docs/security-auth/)** — `~/.purplemux/` 下还有什么。
