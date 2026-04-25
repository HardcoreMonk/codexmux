---
title: Tailscale 访问
description: 通过 Tailscale Serve 在 HTTPS 上从手机访问 purplemux — 无需端口转发,无需折腾证书。
eyebrow: 移动与远程
permalink: /zh-CN/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 默认只本地监听。Tailscale Serve 是把它暴露给其他设备最干净的方式:WireGuard 加密、自动 Let's Encrypt 证书、零防火墙改动。

## 为什么用 Tailscale

- **WireGuard** — 每个连接都是设备到设备加密。
- **自动 HTTPS** — Tailscale 为 `*.<tailnet>.ts.net` 颁发真实证书。
- **不需要端口转发** — 你的机器从不向公网开端口。
- **iOS 强制要求 HTTPS** — PWA 安装和 Web Push 都不接受非 HTTPS。见 [PWA 设置](/purplemux/zh-CN/docs/pwa-setup/) 和 [Web Push](/purplemux/zh-CN/docs/web-push/)。

## 前置条件

- 一个 Tailscale 账户,在运行 purplemux 的机器上安装了 `tailscale` 守护进程并已登录。
- 在 tailnet 上启用了 HTTPS(管理控制台 → DNS → 启用 HTTPS Certificates,如果还没启用)。
- purplemux 运行在默认端口 `8022`(或你设的 `PORT`)。

## 一行命令

```bash
tailscale serve --bg 8022
```

Tailscale 把你本地的 `http://localhost:8022` 包裹成 HTTPS,在 tailnet 内部以下面的地址暴露:

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` 是机器主机名;`<tailnet>` 是你 tailnet 的 MagicDNS 后缀。在登录到同一 tailnet 的任何设备上打开该 URL 即可访问。

停止 serve:

```bash
tailscale serve --bg off 8022
```

## 跑通之后能做什么

- 在手机上打开 URL,点 **分享 → 添加到主屏幕**,按 [PWA 设置](/purplemux/zh-CN/docs/pwa-setup/) 操作。
- 从独立 PWA 内打开推送:[Web Push](/purplemux/zh-CN/docs/web-push/)。
- 从平板、笔记本或另一台桌面访问同一仪表盘 — 工作区状态实时同步。

{% call callout('tip', 'Funnel 与 Serve') %}
`tailscale serve` 让 purplemux 仅对你的 tailnet 可见 — 这几乎总是你想要的。`tailscale funnel` 会把它暴露到公网,这对一个个人复用器来说太过(也有风险)。
{% endcall %}

## 反向代理回退方案

如果 Tailscale 不可用,任何带真实 TLS 证书的反向代理都行。唯一必须做对的事是 **WebSocket 升级** — purplemux 用它做终端 I/O、状态同步和实时时间线。

Nginx(示意):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy 更简单 — `reverse_proxy 127.0.0.1:8022` 自动处理升级 header。

如果不转发 `Upgrade` / `Connection`,仪表盘能渲染,但终端永远连不上、状态卡住。当感觉 "半工作" 时,优先怀疑这两个 header。

## 故障排查

- **HTTPS 还没颁发好** — 首张证书可能需要一分钟。短暂等待后再次运行 `tailscale serve --bg 8022` 通常就好。
- **浏览器警告证书** — 确认你打的是 `<machine>.<tailnet>.ts.net` 这个 URL,而不是 LAN IP。
- **手机说 "无法访问"** — 确认手机已登录到同一 tailnet,且 OS 设置中 Tailscale 处于活动状态。
- **自签名证书** — Web Push 拒绝注册。请用 Tailscale Serve 或经反向代理签发的真实 ACME 证书。

## 下一步

- **[PWA 设置](/purplemux/zh-CN/docs/pwa-setup/)** — 现在有 HTTPS 了,把它装到主屏幕。
- **[Web Push 通知](/purplemux/zh-CN/docs/web-push/)** — 打开后台提醒。
- **[安全与认证](/purplemux/zh-CN/docs/security-auth/)** — 密码、哈希,以及 tailnet 暴露的含义。
