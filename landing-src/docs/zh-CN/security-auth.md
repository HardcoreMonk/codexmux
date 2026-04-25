---
title: 安全与认证
description: purplemux 如何保护你的仪表盘 — scrypt 哈希密码、纯本地数据、外部访问走 HTTPS。
eyebrow: 移动与远程
permalink: /zh-CN/docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是自托管的,完全留在你的机器上。没有外部服务、没有遥测、没有云端账户。下面只描述真正用来守护仪表盘的那几块东西。

## 密码设置

第一次打开 purplemux 时,引导界面要求你设一个密码。提交之后:

- 密码用 **scrypt** 哈希(随机 16 字节盐、64 字节派生密钥)。
- 哈希以 `scrypt:{salt}:{hash}` 形式写入 `~/.purplemux/config.json` — 明文从不存储。
- 同时生成一个独立的 `authSecret`(随机 hex)存放在旁边。purplemux 用它对登录后签发的会话 cookie 签名。

之后访问时显示登录界面,用 `crypto.timingSafeEqual` 把密码与存储的哈希比对。

{% call callout('note', '密码长度') %}
最小长度很短(4 字符)以免本地设置被打扰。如果你把 purplemux 暴露到 tailnet 或别处,选个更强的。失败登录每个进程每 15 分钟限制 16 次。
{% endcall %}

## 重置密码

忘了?只要有主机的 shell 访问权限就够:

```bash
rm ~/.purplemux/config.json
```

重启 purplemux(`pnpm start`、`npx purplemux`,或者你启动的方式),引导界面再次出现,可以选新密码。

这会清掉同一文件中存放的其他设置(主题、语言、字体大小、通知开关等)。工作区和标签页存放在 `workspaces.json` 和 `workspaces/` 目录下,布局不受影响。

## 外部访问的 HTTPS

默认绑到 `localhost`,通过纯 HTTP 提供。在同一台机器上没问题 — 但只要从另一台设备访问 purplemux,就该走 HTTPS。

- **Tailscale Serve** 是推荐路径:WireGuard 加密 + 自动 Let's Encrypt 证书。见 [Tailscale 访问](/purplemux/zh-CN/docs/tailscale/)。
- **反向代理**(Nginx、Caddy 等)也行,只要正确转发 WebSocket 的 `Upgrade` 和 `Connection` header。

iOS Safari 还要求 HTTPS 才能装 PWA 和注册 Web Push。见 [PWA 设置](/purplemux/zh-CN/docs/pwa-setup/) 和 [Web Push](/purplemux/zh-CN/docs/web-push/)。

## `~/.purplemux/` 里有什么

一切都在本地。敏感文件的权限是 `0600`。

| 文件 | 内容 |
|---|---|
| `config.json` | scrypt 密码哈希、会话密钥、应用偏好 |
| `workspaces.json` + `workspaces/` | 工作区列表与每个工作区的窗格 / 标签页布局 |
| `vapid-keys.json` | Web Push VAPID 密钥对(自动生成) |
| `push-subscriptions.json` | 各设备的推送订阅 |
| `cli-token` | hook / CLI 与本地服务通信的共享 token |
| `pmux.lock` | 单实例锁(`pid`、`port`、`startedAt`) |
| `logs/` | 滚动的 pino 日志文件 |

完整清单和重置表见仓库内的 [docs/DATA-DIR.md](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md)。

## 没有遥测

purplemux 自己不发起任何外部请求。它发起的网络调用只有:

- 你订阅的 Web Push 通知,通过 OS 推送服务发送。
- Claude CLI 自己做的事 — 那是你和 Anthropic 之间的事,与 purplemux 无关。

代码和会话数据从不离开你的机器。

## 下一步

- **[Tailscale 访问](/purplemux/zh-CN/docs/tailscale/)** — 通向外部 HTTPS 的安全路径。
- **[PWA 设置](/purplemux/zh-CN/docs/pwa-setup/)** — 处理好认证之后,装到主屏幕。
- **[Web Push 通知](/purplemux/zh-CN/docs/web-push/)** — 后台提醒。
