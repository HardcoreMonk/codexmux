---
title: 故障排查与 FAQ
description: 常见问题、快速答案,以及最常被问到的疑问。
eyebrow: 参考
permalink: /zh-CN/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

如果这里没有匹配你看到的现象,请提一个 [issue](https://github.com/subicura/purplemux/issues),附上平台、浏览器,以及 `~/.purplemux/logs/` 下相关的日志文件。

## 安装与启动

### `tmux: command not found`

purplemux 在主机上需要 tmux 3.0+。安装:

```bash
# macOS(Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

用 `tmux -V` 验证。tmux 2.9+ 在技术上能通过预检,但我们测试的对标版本是 3.0+。

### `node: command not found` 或 "Node.js 20 or newer"

安装 Node 20 LTS 或更高版本。用 `node -v` 检查。macOS 原生应用打包了自己的 Node,所以这条只对 `npx` / `npm install -g` 路径适用。

### "purplemux is already running (pid=…, port=…)"

另一个 purplemux 实例还活着并在响应 `/api/health`。要么直接用它(打开打印的 URL),要么先停掉:

```bash
# 找到它
ps aux | grep purplemux

# 或者直接通过锁文件杀掉
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### 锁文件陈旧 — 拒绝启动,但其实没有进程在跑

`~/.purplemux/pmux.lock` 留下了。删除它:

```bash
rm ~/.purplemux/pmux.lock
```

如果你曾经用 `sudo` 跑过 purplemux,这个文件可能属于 root — 一次 `sudo rm` 即可。

### `Port 8022 is in use, finding an available port...`

另一个进程占了 `8022`。服务回退到一个随机空闲端口并打印新 URL。要自己挑端口:

```bash
PORT=9000 purplemux
```

用 `lsof -iTCP:8022 -sTCP:LISTEN -n -P` 找出谁占了 `8022`。

### 在 Windows 上能用吗?

**官方不支持。** purplemux 依赖 `node-pty` 和 tmux,两者都不能在 Windows 上原生运行。WSL2 通常能用(此时你实际上在 Linux 上),但不在我们的测试范围。

## 会话与恢复

### 关掉浏览器把所有东西都干掉了

不应如此 — tmux 在服务端保持每个 shell 存活。如果刷新没把标签找回来:

1. 检查服务是否还在跑(`http://localhost:8022/api/health`)。
2. 检查 tmux 会话是否存在:`tmux -L purple ls`。
3. 看 `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` 中 `autoResumeOnStartup` 期间的报错。

如果 tmux 提示 "no server running",说明主机重启了或某些事杀掉了 tmux。会话没了,但布局(工作区、标签、工作目录)在 `~/.purplemux/workspaces/{wsId}/layout.json` 中保留着,会在下次启动 purplemux 时重新拉起。

### 一个 Claude 会话拒绝 resume

`autoResumeOnStartup` 会为每个标签重跑保存的 `claude --resume <uuid>`,但如果对应的 `~/.claude/projects/.../sessionId.jsonl` 已经不存在(被删、归档,或者项目搬走了),resume 会失败。打开标签开新对话即可。

### 我的标签全显示 "unknown"

`unknown` 表示标签在服务重启前是 `busy` 的,恢复仍在进行。`resolveUnknown` 在后台运行,确认 `idle`(Claude 已退出)或 `ready-for-review`(有最终 assistant 消息)。如果一个标签卡在 `unknown` 超过 10 分钟,**busy 卡死兜底** 会静默将其翻到 `idle`。完整状态机见 [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md)。

## 浏览器与 UI

### Web Push 通知从不触发

走一遍清单:

1. **仅限 iOS Safari ≥ 16.4。** 更早的 iOS 完全没有 Web Push。
2. **iOS 上必须是 PWA。** 先点 **分享 → 添加到主屏幕**;普通 Safari 标签不会触发推送。
3. **必须 HTTPS。** 自签名证书无效 — Web Push 静默拒绝注册。请用 Tailscale Serve(免费 Let's Encrypt)或挂在 Nginx / Caddy 后的真实域名。
4. **通知权限已授予。** purplemux 内 **设置 → 通知 → 开** *和* 浏览器级权限都必须允许。
5. **订阅存在。** `~/.purplemux/push-subscriptions.json` 应该有该设备的条目。如果是空,重新授予权限。

完整兼容性矩阵见 [浏览器支持](/purplemux/zh-CN/docs/browser-support/)。

### iOS Safari 16.4+ 但仍然没通知

某些 iOS 版本在 PWA 长时间未打开后会丢失订阅。打开 PWA,先拒绝后再次授予通知权限,然后再检查 `push-subscriptions.json`。

### Safari 私密窗口什么都不持久化

Safari 17+ 私密窗口禁用 IndexedDB,工作区缓存撑不过重启。请用普通窗口。

### 移动端终端在切到后台后消失

iOS Safari 在标签后台约 30 秒后会拆掉 WebSocket。tmux 仍保持真实会话存活 — 当你回到标签时,purplemux 会重新连接并重新渲染。这是 iOS 的行为,不是我们造成的。

### Firefox + Tailscale serve = 证书警告

如果你的 tailnet 用了非 `*.ts.net` 的自定义域名,Firefox 在 HTTPS 信任上比 Chrome 严格。接受证书一次后会持续生效。

### "浏览器太旧" 或缺特性

运行 **设置 → 浏览器检查** 查看每 API 报告。低于 [浏览器支持](/purplemux/zh-CN/docs/browser-support/) 中最低要求的浏览器会优雅地丢失功能,但不被支持。

## 网络与远程访问

### 我能把 purplemux 暴露到公网吗?

可以,但请始终走 HTTPS。推荐:

1. **Tailscale Serve** — `tailscale serve --bg 8022` 提供 WireGuard 加密 + 自动证书。无需端口转发。
2. **反向代理** — Nginx / Caddy / Traefik。务必转发 `Upgrade` 和 `Connection` header,否则 WebSocket 会断。

直接把纯 HTTP 暴露在公网是个坏主意 — 认证 cookie 是 HMAC 签名的,但 WebSocket 的 payload(终端字节!)并未加密。

### 局域网上的其他设备无法访问 purplemux

purplemux 默认只允许 localhost。通过环境变量或应用内设置开通:

```bash
HOST=lan,localhost purplemux       # LAN 友好
HOST=tailscale,localhost purplemux # tailnet 友好
HOST=all purplemux                 # 全开
```

或者在应用内 **设置 → 网络访问**,会写入 `~/.purplemux/config.json`。(当 `HOST` 通过环境变量设置时,该字段被锁定。) 关键字和 CIDR 语法见 [端口与环境变量](/purplemux/zh-CN/docs/ports-env-vars/)。

### 反向代理 WebSocket 问题

如果 `/api/terminal` 连上后立即断,代理在剥掉 `Upgrade` / `Connection` header。最小 Nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy:WebSocket 转发是默认行为;直接 `reverse_proxy 127.0.0.1:8022` 即可。

## 数据与存储

### 我的数据在哪?

全部在本地的 `~/.purplemux/` 下。没有任何东西离开你的机器。登录密码是 `config.json` 中的 scrypt 哈希。完整结构见 [数据目录](/purplemux/zh-CN/docs/data-directory/)。

### 我忘了密码

删除 `~/.purplemux/config.json` 并重启。引导从头来。工作区、布局和历史保留(它们是单独的文件)。

### 标签指示器永久卡在 "busy"

`busy 卡死兜底` 会在 Claude 进程死了之后约 10 分钟将标签静默翻到 `idle`。如果不想等,关闭并重新打开该标签 — 这会重置本地状态,下一个 hook 事件会从干净状态恢复。要做根因排查,跑 `LOG_LEVELS=hooks=debug,status=debug`。

### 它会跟我现有的 tmux 配置冲突吗?

不会。purplemux 在专用 socket 上跑一个隔离的 tmux(`-L purple`),用自己的配置(`src/config/tmux.conf`)。你的 `~/.tmux.conf` 和现有 tmux 会话都不受影响。

## 成本与用量

### purplemux 能帮我省钱吗?

直接不会。它做的是 **让用量透明**:今天 / 当月 / 按项目的成本、按模型的 token 分解、5h / 7d 速率限制倒计时都在一屏,这样你能在撞墙之前调好节奏。

### purplemux 自身收费吗?

不。purplemux 是 MIT 许可的开源软件。Claude Code 的用量由 Anthropic 单独计费。

### 我的数据会被发送到任何地方吗?

不会。purplemux 完全自托管。它发起的网络调用只有:本地 Claude CLI(它自己跟 Anthropic 通信)和启动时通过 `update-notifier` 检查版本。用 `NO_UPDATE_NOTIFIER=1` 关闭版本检查。

## 下一步

- **[浏览器支持](/purplemux/zh-CN/docs/browser-support/)** — 详细兼容性矩阵和已知浏览器注意事项。
- **[数据目录](/purplemux/zh-CN/docs/data-directory/)** — 每个文件的作用,以及哪些可以安全删除。
- **[架构](/purplemux/zh-CN/docs/architecture/)** — 部件如何拼接,在需要深挖时参考。
