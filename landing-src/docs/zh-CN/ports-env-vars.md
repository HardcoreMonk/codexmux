---
title: 端口与环境变量
description: purplemux 打开的每个端口和影响其运行的每个环境变量。
eyebrow: 参考
permalink: /zh-CN/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 旨在一行命令安装,但运行时仍可配置。本页列出它打开的每个端口,以及服务读取的每个环境变量。

## 端口

| 端口 | 默认 | 覆盖方式 | 备注 |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | `8022` 已被占用时,服务记录警告并改绑随机空闲端口。 |
| 内部 Next.js(生产) | 随机 | — | `pnpm start` / `purplemux start` 中,外层服务代理到绑定 `127.0.0.1:<random>` 的 Next.js standalone。不对外暴露。 |

`8022` 是 `web` + `ssh` 拼起来的。选这个就是好玩,跟协议无关。

{% call callout('note', '绑定接口跟随访问策略') %}
purplemux 仅当访问策略实际允许外部客户端时才绑 `0.0.0.0`。仅本地的设置绑 `127.0.0.1`,这样 LAN 上的其他机器连 TCP 连接都打不开。见下文的 `HOST`。
{% endcall %}

## 服务环境变量

由 `server.ts` 及其启动加载的模块读取。

| 变量 | 默认 | 作用 |
|---|---|---|
| `PORT` | `8022` | HTTP/WS 监听端口。`EADDRINUSE` 时回退到随机端口。 |
| `HOST` | 未设 | 控制哪些客户端被允许的逗号分隔 CIDR / 关键字规约。关键字:`localhost`、`tailscale`、`lan`、`all`(或 `*` / `0.0.0.0`)。例:`HOST=localhost`、`HOST=localhost,tailscale`、`HOST=10.0.0.0/8,localhost`。通过环境变量设置时,应用内 **设置 → 网络访问** 会被锁定。 |
| `NODE_ENV` | `production`(`purplemux start`)、`development`(`pnpm dev`) | 在开发流水线(`tsx watch`、Next dev)和生产流水线(`tsup` 打包并代理到 Next standalone)之间选择。 |
| `__PMUX_APP_DIR` | `process.cwd()` | 覆盖包含 `dist/server.js` 和 `.next/standalone/` 的目录。由 `bin/purplemux.js` 自动设置,通常不要动。 |
| `__PMUX_APP_DIR_UNPACKED` | 未设 | macOS Electron 应用中 asar-unpacked 路径下 `__PMUX_APP_DIR` 的变体。 |
| `__PMUX_ELECTRON` | 未设 | 当 Electron 主进程在进程内启动服务时设此值,让 `server.ts` 跳过自动 `start()` 调用,把生命周期交给 Electron。 |
| `PURPLEMUX_CLI` | `1`(由 `bin/purplemux.js` 设置) | 让共享模块知道当前进程是 CLI / 服务,而不是 Electron。被 `pristine-env.ts` 使用。 |
| `__PMUX_PRISTINE_ENV` | 未设 | 父 shell 环境变量的 JSON 快照,由 `bin/purplemux.js` 捕获,这样子进程(claude、tmux)继承用户的 `PATH` 而不是被消毒过的版本。内部使用 — 自动设置。 |
| `AUTH_PASSWORD` | 未设 | 启动时由服务从 `config.json` 的 scrypt 哈希设置后,Next 才启动。NextAuth 从那读取。不要手动设置。 |
| `NEXTAUTH_SECRET` | 未设 | 同样 — 启动时从 `config.json` 填充。 |

## 日志环境变量

由 `src/lib/logger.ts` 读取。

| 变量 | 默认 | 作用 |
|---|---|---|
| `LOG_LEVEL` | `info` | 未在 `LOG_LEVELS` 中命名的所有内容的根级别。 |
| `LOG_LEVELS` | 未设 | 按模块覆盖,以逗号分隔的 `name=level` 对。 |

级别(从低到高):`trace` · `debug` · `info` · `warn` · `error` · `fatal`。

```bash
LOG_LEVEL=debug purplemux

# 只对 Claude hook 模块开启 debug
LOG_LEVELS=hooks=debug purplemux

# 同时多个模块
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

最有用的模块名:

| 模块 | 来源 | 显示什么 |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`、`status-manager.ts` 部分 | hook 接收 / 处理 / 状态转换 |
| `status` | `status-manager.ts` | 轮询、JSONL 监视、广播 |
| `tmux` | `lib/tmux.ts` | 每个 tmux 命令及其结果 |
| `server`、`lock` 等 | 对应 `lib/*.ts` | 进程生命周期 |

无论级别如何,日志文件都落到 `~/.purplemux/logs/`。

## 文件(等价于环境变量)

少量值在行为上像环境变量,但放在磁盘里,以便 CLI 和 hook 脚本不需要环境握手就能找到:

| 文件 | 内容 | 使用者 |
|---|---|---|
| `~/.purplemux/port` | 当前服务端口(纯文本) | `bin/cli.js`、`status-hook.sh`、`statusline.sh` |
| `~/.purplemux/cli-token` | 32 字节 hex CLI token | `bin/cli.js`、hook 脚本(以 `x-pmux-token` 发送) |

CLI 也接受这些通过环境变量传入,优先级更高:

| 变量 | 默认 | 作用 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` 的内容 | CLI 通信的端口。 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` 的内容 | 作为 `x-pmux-token` 发送的 bearer token。 |

完整命令面见 [CLI 参考](/purplemux/zh-CN/docs/cli-reference/)。

## 组合起来

几个常见组合:

```bash
# 默认:仅本地,端口 8022
purplemux

# 全部绑定(LAN + Tailscale + 远程)
HOST=all purplemux

# 仅本地 + Tailscale
HOST=localhost,tailscale purplemux

# 自定义端口 + 详细 hook 跟踪
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# 调试用全配
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
对于永久安装,把这些放进你的 launchd / systemd 单元的 `Environment=` 块。一份示例单元文件见 [安装](/purplemux/zh-CN/docs/installation/#start-on-boot)。
{% endcall %}

## 下一步

- **[安装](/purplemux/zh-CN/docs/installation/)** — 这些变量通常放在哪。
- **[数据目录](/purplemux/zh-CN/docs/data-directory/)** — `port` 和 `cli-token` 与 hook 脚本如何配合。
- **[CLI 参考](/purplemux/zh-CN/docs/cli-reference/)** — 上下文中的 `PMUX_PORT` / `PMUX_TOKEN`。
