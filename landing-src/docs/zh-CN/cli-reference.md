---
title: CLI 参考
description: purplemux 和 pmux 二进制的所有子命令与参数。
eyebrow: 参考
permalink: /zh-CN/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux` 提供两种使用方式:作为服务启动器(`purplemux` / `purplemux start`)和作为与运行中服务对话的 HTTP API 包装器(`purplemux <subcommand>`)。短别名 `pmux` 与之等价。

## 一个二进制,两种角色

| 形式 | 行为 |
|---|---|
| `purplemux` | 启动服务。等价于 `purplemux start`。 |
| `purplemux <subcommand>` | 与运行中的服务的 CLI HTTP API 通信。 |
| `pmux ...` | `purplemux ...` 的别名。 |

`bin/purplemux.js` 中的分发器会剥离第一个参数:已知子命令路由到 `bin/cli.js`,其他(或没有参数)则启动服务。

## 启动服务

```bash
purplemux              # 默认
purplemux start        # 同上,显式
PORT=9000 purplemux    # 自定义端口
HOST=all purplemux     # 全部绑定
```

完整环境变量见 [端口与环境变量](/purplemux/zh-CN/docs/ports-env-vars/)。

服务会打印绑定的 URL、模式和认证状态:

```
  ⚡ purplemux  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

如果 `8022` 已被占用,服务会发出警告并改绑随机空闲端口。

## 子命令

所有子命令都需要一个运行中的服务。它们从 `~/.purplemux/port` 读端口、从 `~/.purplemux/cli-token` 读认证 token,这两个文件都会在服务启动时自动写好。

| 命令 | 用途 |
|---|---|
| `purplemux workspaces` | 列出工作区 |
| `purplemux tab list [-w WS]` | 列出标签(可按工作区限定) |
| `purplemux tab create -w WS [-n NAME] [-t TYPE]` | 创建新标签 |
| `purplemux tab send -w WS TAB_ID CONTENT...` | 给标签发送输入 |
| `purplemux tab status -w WS TAB_ID` | 查看标签状态 |
| `purplemux tab result -w WS TAB_ID` | 抓取标签窗格当前内容 |
| `purplemux tab close -w WS TAB_ID` | 关闭标签 |
| `purplemux tab browser ...` | 驱动 `web-browser` 标签(仅 Electron) |
| `purplemux api-guide` | 打印完整 HTTP API 参考 |
| `purplemux help` | 显示用法 |

输出默认为 JSON。`--workspace` 和 `-w` 可互换。

### `tab create` 面板类型

`-t` / `--type` 选择面板类型。有效值:

| 值 | 面板 |
|---|---|
| `terminal` | 普通 shell |
| `claude-code` | 已经在跑 `claude` 的 shell |
| `web-browser` | 内嵌浏览器(仅 Electron) |
| `diff` | Git 差异面板 |

不带 `-t` 时,得到一个普通终端。

### `tab browser` 子命令

只有当标签的面板类型是 `web-browser`,且仅在 macOS Electron 应用中工作时可用 — 否则桥接返回 503。

| 子命令 | 返回内容 |
|---|---|
| `purplemux tab browser url -w WS TAB_ID` | 当前 URL + 页面标题 |
| `purplemux tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG。带 `-o` 保存到磁盘;不带则返回 base64。`--full` 整页截图。 |
| `purplemux tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | 最近控制台条目(环形缓冲,500 条) |
| `purplemux tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | 最近网络条目;`--request ID` 抓取一条响应体 |
| `purplemux tab browser eval -w WS TAB_ID EXPR` | 执行 JS 表达式并序列化结果 |

## 示例

```bash
# 找到工作区
purplemux workspaces

# 在 ws-MMKl07 工作区里创建一个 Claude 标签
purplemux tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# 给它发提示(TAB_ID 来自 `tab list`)
purplemux tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# 查看状态
purplemux tab status -w ws-MMKl07 tb-abc

# 抓取窗格内容
purplemux tab result -w ws-MMKl07 tb-abc

# 给一个 Web 浏览器标签整页截图
purplemux tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## 认证

每个子命令都发送 `x-pmux-token: $(cat ~/.purplemux/cli-token)`,服务端用 `timingSafeEqual` 校验。`~/.purplemux/cli-token` 文件在首次服务启动时通过 `randomBytes(32)` 生成,以 `0600` 模式存放。

如果你需要从看不到 `~/.purplemux/` 的另一个 shell 或脚本驱动 CLI,改用环境变量:

| 变量 | 默认 | 作用 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` 的内容 | CLI 通信的端口 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` 的内容 | 作为 `x-pmux-token` 发送的 bearer token |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux workspaces
```

{% call callout('warning') %}
CLI token 授予服务的完全访问权限。把它当作密码对待。不要粘到聊天里、提交进版本库,或暴露为构建环境变量。要轮换的话,删除 `~/.purplemux/cli-token` 并重启服务。
{% endcall %}

## update-notifier

`purplemux` 在每次启动时检查 npm 上是否有更新版本(通过 `update-notifier`),并在有新版本时打印横幅。用 `NO_UPDATE_NOTIFIER=1` 或任意 [`update-notifier` 标准退出方式](https://github.com/yeoman/update-notifier#user-settings) 关闭。

## 完整 HTTP API

`purplemux api-guide` 打印每个 `/api/cli/*` endpoint 的完整 HTTP API 参考,包括请求体和响应结构 — 当你想直接用 `curl` 或其他运行时驱动 purplemux 时很有用。

## 下一步

- **[端口与环境变量](/purplemux/zh-CN/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` 在更广环境变量中的位置。
- **[架构](/purplemux/zh-CN/docs/architecture/)** — CLI 实际在跟谁通信。
- **[故障排查](/purplemux/zh-CN/docs/troubleshooting/)** — 当 CLI 说 "服务在运行吗?" 的时候。
