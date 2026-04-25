---
title: 数据目录
description: ~/.purplemux/ 下到底放了什么、什么可以安全删除、怎么备份。
eyebrow: 参考
permalink: /zh-CN/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 的所有持久状态 — 设置、布局、会话历史、缓存 — 都放在 `~/.purplemux/` 下。仅此而已。没有 `localStorage`,没有系统钥匙串,没有外部服务。

## 整体结构

```
~/.purplemux/
├── config.json              # 应用配置(认证、主题、语言等)
├── workspaces.json          # 工作区列表 + 侧边栏状态
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # 窗格 / 标签树
│       ├── message-history.json  # 每个工作区的输入历史
│       └── claude-prompt.md      # --append-system-prompt-file 内容
├── hooks.json               # Claude Code hook + 状态行配置(自动生成)
├── status-hook.sh           # hook 脚本(自动生成,0755)
├── statusline.sh            # 状态行脚本(自动生成,0755)
├── rate-limits.json         # 最新的状态行 JSON
├── session-history.json     # 已完成 Claude 会话日志(跨工作区)
├── quick-prompts.json       # 自定义快捷提示 + 已禁用内置
├── sidebar-items.json       # 自定义侧边栏条目 + 已禁用内置
├── vapid-keys.json          # Web Push VAPID 密钥对(自动生成)
├── push-subscriptions.json  # Web Push endpoint 订阅
├── cli-token                # CLI 认证 token(自动生成)
├── port                     # 当前服务端口
├── pmux.lock                # 单实例锁 {pid, port, startedAt}
├── logs/                    # pino-roll 日志文件
├── uploads/                 # 通过聊天输入栏附加的图片
└── stats/                   # Claude 用量统计缓存
```

包含敏感数据的文件(配置、token、布局、VAPID 密钥、锁)用 `tmpFile → rename` 模式以 `0600` 写入。

## 顶层文件

| 文件 | 内容 | 可以删除吗? |
|---|---|---|
| `config.json` | scrypt 哈希的登录密码、HMAC 会话密钥、主题、语言、字号、通知开关、编辑器 URL、网络访问、自定义 CSS | 可以 — 重新走引导流程 |
| `workspaces.json` | 工作区索引、侧边栏宽度 / 折叠状态、活动工作区 ID | 可以 — 清空所有工作区和标签 |
| `hooks.json` | Claude Code `--settings` 映射(事件 → 脚本)+ `statusLine.command` | 可以 — 下次启动时重生成 |
| `status-hook.sh`、`statusline.sh` | 用 `x-pmux-token` 向 `/api/status/hook` 和 `/api/status/statusline` POST | 可以 — 下次启动时重生成 |
| `rate-limits.json` | 最新 Claude 状态行 JSON:`ts`、`model`、`five_hour`、`seven_day`、`context`、`cost` | 可以 — Claude 运行时会重新填充 |
| `session-history.json` | 最近 200 个已完成 Claude 会话(提示、结果、时长、工具、文件) | 可以 — 清除历史 |
| `quick-prompts.json`、`sidebar-items.json` | 在内置列表上的覆盖:`{ custom: […], disabledBuiltinIds: […], order: […] }` | 可以 — 恢复默认 |
| `vapid-keys.json` | 首次运行生成的 Web Push VAPID 密钥对 | 不要单独删 — 除非也删 `push-subscriptions.json`(否则现有订阅会失效) |
| `push-subscriptions.json` | 每浏览器的推送 endpoint | 可以 — 每个设备需重新订阅 |
| `cli-token` | 32 字节 hex token,供 `purplemux` CLI 和 hook 脚本使用(`x-pmux-token` header) | 可以 — 下次启动时重生成,但已生成的 hook 脚本仍持有旧 token,直到服务覆盖它 |
| `port` | 当前端口的纯文本,被 hook 脚本和 CLI 读取 | 可以 — 下次启动时重生成 |
| `pmux.lock` | 单实例守卫 `{ pid, port, startedAt }` | 仅当没有 purplemux 进程存活时 |

{% call callout('warning', '锁文件相关的坑') %}
如果 purplemux 拒绝启动并提示 "已经在运行" 但其实没有进程存活,说明 `pmux.lock` 是陈旧的。`rm ~/.purplemux/pmux.lock` 再试一次。如果你曾经用 `sudo` 跑过 purplemux,锁文件可能属于 root — 一次 `sudo rm` 即可。
{% endcall %}

## 每个工作区目录(`workspaces/{wsId}/`)

每个工作区有自己的子目录,以生成的工作区 ID 命名。

| 文件 | 内容 |
|---|---|
| `layout.json` | 递归的窗格 / 标签树:叶子 `pane` 节点带 `tabs[]`,`split` 节点带 `children[]` 和 `ratio`。每个标签携带 tmux 会话名(`pt-{wsId}-{paneId}-{tabId}`)、缓存的 `cliState`、`claudeSessionId`、最近一次 resume 命令。 |
| `message-history.json` | 每个工作区的 Claude 输入历史。上限 500 条。 |
| `claude-prompt.md` | 该工作区每个 Claude 标签传入的 `--append-system-prompt-file` 内容。在工作区创建 / 重命名 / 目录变更时重生成。 |

只删除 `workspaces/{wsId}/layout.json` 即可把那个工作区的布局重置为默认窗格,而不动其他工作区。

## `logs/`

Pino-roll 输出,每个 UTC 日一个文件,文件大小超限时带数字后缀:

```
logs/purplemux.2026-04-19.1.log
```

默认级别 `info`。用 `LOG_LEVEL` 覆盖,或用 `LOG_LEVELS` 按模块覆盖 — 见 [端口与环境变量](/purplemux/zh-CN/docs/ports-env-vars/)。

日志按周轮转(7 文件上限)。可随时安全删除。

## `uploads/`

通过聊天输入栏(拖、粘贴、回形针)附加的图片:

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- 允许:`image/png`、`image/jpeg`、`image/gif`、`image/webp`
- 单文件最大 10 MB,权限 `0600`
- 服务启动时自动清理:24 小时之前的全部移除
- 手动清理在 **设置 → 系统 → 附加图片 → 立即清理**

## `stats/`

纯缓存。从 `~/.claude/projects/**/*.jsonl` 派生 — purplemux 只读取该目录。

| 文件 | 内容 |
|---|---|
| `cache.json` | 每日聚合:消息数、会话数、工具调用数、按小时计数、按模型 token 用量 |
| `uptime-cache.json` | 每日运行时长 / 活跃分钟统计 |
| `daily-reports/{YYYY-MM-DD}.json` | AI 生成的每日简报 |

整个文件夹删除可强制下次统计请求时重算。

## 重置矩阵

| 想重置… | 删除 |
|---|---|
| 登录密码(重新引导) | `config.json` |
| 所有工作区和标签 | `workspaces.json` + `workspaces/` |
| 一个工作区的布局 | `workspaces/{wsId}/layout.json` |
| 用量统计 | `stats/` |
| 推送订阅 | `push-subscriptions.json` |
| 卡死的 "已在运行" | `pmux.lock`(仅当无进程存活时) |
| 一切(出厂重置) | `~/.purplemux/` |

`hooks.json`、`status-hook.sh`、`statusline.sh`、`port`、`cli-token`、`vapid-keys.json` 都会在下次启动时自动重生成,删除它们无害。

## 备份

整个目录就是普通 JSON 加几个 shell 脚本。备份方式:

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

在新机器上恢复时,解包并启动 purplemux。Hook 脚本会用新服务的端口重写;其余(工作区、历史、设置)原样迁过去。

{% call callout('warning') %}
不要恢复 `pmux.lock` — 它绑定到特定 PID 会阻塞启动。排除它:`--exclude pmux.lock`。
{% endcall %}

## 全部清空

```bash
rm -rf ~/.purplemux
```

确保没有 purplemux 在运行。下次启动会再次进入首次运行体验。

## 下一步

- **[端口与环境变量](/purplemux/zh-CN/docs/ports-env-vars/)** — 影响该目录的所有变量。
- **[架构](/purplemux/zh-CN/docs/architecture/)** — 这些文件如何与运行中的服务相连。
- **[故障排查](/purplemux/zh-CN/docs/troubleshooting/)** — 常见问题与修复方法。
