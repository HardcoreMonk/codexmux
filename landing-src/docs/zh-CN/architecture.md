---
title: 架构
description: 浏览器、Node.js 服务、tmux 与 Claude CLI 是如何拼到一起的。
eyebrow: 参考
permalink: /zh-CN/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 是三层缝合而成:浏览器前端、跑在 `:8022` 上的 Node.js 服务、主机上的 tmux + Claude CLI。中间走的不是二进制 WebSocket,就是小型 HTTP POST。

## 三层结构

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

每个 WebSocket 都有单一目的,不复用。认证是 NextAuth JWT cookie,在 WS upgrade 时校验。

## 浏览器

前端是 Next.js(Pages Router)应用。与服务通信的部分:

| 组件 | 库 | 作用 |
|---|---|---|
| 终端窗格 | `xterm.js` | 渲染来自 `/api/terminal` 的字节。发送按键、resize、标题变更(`onTitleChange`)。 |
| 会话时间线 | React + `useTimeline` | 渲染来自 `/api/timeline` 的 Claude 轮次。不在客户端推导 `cliState` — 全在服务端。 |
| 状态指示 | Zustand `useTabStore` | 标签徽章、侧边栏圆点、通知计数,由 `/api/status` 消息驱动。 |
| 多设备同步 | `useSyncClient` | 通过 `/api/sync` 关注另一台设备做的工作区 / 布局编辑。 |

标签标题和前台进程来自 xterm.js 的 `onTitleChange` — tmux 配置(`src/config/tmux.conf`)每两秒发出 `#{pane_current_command}|#{pane_current_path}`,`lib/tab-title.ts` 做解析。

## Node.js 服务

`server.ts` 是一个自定义 HTTP 服务,在同一端口上同时托管 Next.js 与四个 `ws` `WebSocketServer` 实例。

### WebSocket 端点

| 路径 | 处理器 | 方向 | 用途 |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | 双向,二进制 | 终端 I/O,通过 `node-pty` 挂到 tmux 会话 |
| `/api/timeline` | `timeline-server.ts` | 服务 → 客户端 | 把 JSONL 解析后的 Claude 会话条目流送过去 |
| `/api/status` | `status-server.ts` | 双向,JSON | 服务端发出 `status:sync` / `status:update` / `status:hook-event`,客户端发出 `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` |
| `/api/sync` | `sync-server.ts` | 双向,JSON | 跨设备工作区状态 |

外加首次运行安装的 `/api/install`(无需认证)。

### 终端二进制协议

`/api/terminal` 用 `src/lib/terminal-protocol.ts` 中定义的小型二进制协议:

| 编码 | 名称 | 方向 | Payload |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | 客户端 → 服务 | 按键字节 |
| `0x01` | `MSG_STDOUT` | 服务 → 客户端 | 终端输出 |
| `0x02` | `MSG_RESIZE` | 客户端 → 服务 | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | 双向 | 30 秒间隔,90 秒超时 |
| `0x04` | `MSG_KILL_SESSION` | 客户端 → 服务 | 终止底层 tmux 会话 |
| `0x05` | `MSG_WEB_STDIN` | 客户端 → 服务 | Web 输入栏文本(在退出 copy-mode 后投递) |

背压:WS `bufferedAmount > 1 MB` 时 `pty.pause`,降到 `256 KB` 以下时 resume。每个服务最多 32 个并发连接,超出则丢最老的。

### 状态管理器

`src/lib/status-manager.ts` 是 `cliState` 的唯一真相源。Hook 事件经过 `/api/status/hook`(token 鉴权 POST),按标签 `eventSeq` 排序,由 `deriveStateFromEvent` 归并为 `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown`。JSONL 监视器只更新元数据,例外是合成的 `interrupt` 事件。

完整状态机见 [会话状态(STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md)。

## tmux 层

purplemux 在专用 socket 上跑一个隔离的 tmux — `-L purple` — 用自己的配置 `src/config/tmux.conf`。你的 `~/.tmux.conf` 永远不会被读取。

会话命名为 `pt-{workspaceId}-{paneId}-{tabId}`。浏览器中的一个终端窗格映射到一个 tmux 会话,通过 `node-pty` 挂接。

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← 浏览器标签 1
├── pt-ws-MMKl07-pa-1-tb-2   ← 浏览器标签 2
└── pt-ws-MMKl07-pa-2-tb-1   ← 分割窗格,标签 1
```

`prefix` 被禁用,状态栏关闭(由 xterm.js 绘制框架),`set-titles` 开启,`mouse on` 把滚轮交给 copy-mode。tmux 是会话能撑过浏览器关闭、Wi-Fi 中断或服务重启的原因。

完整 tmux 设置、命令封装和进程检测细节见 [tmux 与进程检测(TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md)。

## Claude CLI 集成

purplemux 不 fork 也不包装 Claude — `claude` 二进制就是你装的那个。只追加两件事:

1. **Hook 设置** — 启动时,`ensureHookSettings()` 写出 `~/.purplemux/hooks.json`、`status-hook.sh` 和 `statusline.sh`。每个 Claude 标签都以 `--settings ~/.purplemux/hooks.json` 启动,这样 `SessionStart`、`UserPromptSubmit`、`Notification`、`Stop`、`PreCompact`、`PostCompact` 都会 POST 回服务。
2. **JSONL 读取** — `~/.claude/projects/**/*.jsonl` 由 `timeline-server.ts` 解析以提供实时对话视图,由 `session-detection.ts` 监视以通过 `~/.claude/sessions/` 下的 PID 文件检测正在运行的 Claude 进程。

Hook 脚本读 `~/.purplemux/port` 和 `~/.purplemux/cli-token`,带 `x-pmux-token` 发起 POST。服务下线时它们静默失败,因此 Claude 运行中关闭 purplemux 不会让任何东西崩。

## 启动顺序

`server.ts:start()` 按下面顺序运行:

1. `acquireLock(port)` — 通过 `~/.purplemux/pmux.lock` 做单实例守卫
2. `initConfigStore()` + `initShellPath()`(解析用户登录 shell 的 `PATH`)
3. `initAuthCredentials()` — 把 scrypt 哈希密码和 HMAC 密钥载入环境变量
4. `scanSessions()` + `applyConfig()` — 清理无效 tmux 会话,应用 `tmux.conf`
5. `initWorkspaceStore()` — 加载 `workspaces.json` 和每个工作区的 `layout.json`
6. `autoResumeOnStartup()` — 在保存的目录中重启 shell,尝试 Claude resume
7. `getStatusManager().init()` — 启动元数据轮询
8. `app.prepare()`(Next.js 开发) 或 `require('.next/standalone/server.js')`(生产)
9. `listenWithFallback()` 在 `bindPlan.host:port`(基于访问策略,`0.0.0.0` 或 `127.0.0.1`)
10. `ensureHookSettings(result.port)` — 用真实端口写入或刷新 hook 脚本
11. `getCliToken()` — 读取或生成 `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — 刷新每个工作区的 `claude-prompt.md`

端口解析与第 10 步之间的窗口正是为什么 hook 脚本每次启动都重生成的原因:它们需要把真实端口烧进去。

## 自定义服务与 Next.js 模块图

{% call callout('warning', '一个进程里两个模块图') %}
外层自定义服务(`server.ts`)与 Next.js(pages + API routes)共享一个 Node 进程,但 **不** 共享模块图。在 `src/lib/*` 下被两边导入的任何东西都会被实例化两次。需要共享的单例(StatusManager、WebSocket 客户端集合、CLI token、文件写入锁)挂在 `globalThis.__pt*` 键上。完整理由见 `CLAUDE.md §18`。
{% endcall %}

## 想读更多

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — tmux 配置、命令封装、进程树遍历、终端二进制协议。
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — Claude CLI 状态机、hook 流程、合成 interrupt 事件、JSONL 监视器。
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — purplemux 写入的每个文件。

## 下一步

- **[数据目录](/purplemux/zh-CN/docs/data-directory/)** — 上面架构涉及的每个文件。
- **[CLI 参考](/purplemux/zh-CN/docs/cli-reference/)** — 从浏览器之外与服务对话。
- **[故障排查](/purplemux/zh-CN/docs/troubleshooting/)** — 这里某处出问题时如何诊断。
