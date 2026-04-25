---
title: 笔记(AI 每日报告)
description: 一天结束时,由 LLM 撰写的每个 Claude Code 会话的总结,以 Markdown 格式存在本地。
eyebrow: Claude Code
permalink: /zh-CN/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

一天结束后,purplemux 可以读取当天的会话日志,为你写一句话简报和按项目分解的 Markdown 总结。它在侧边栏中以 **笔记** 形式存在,目的是让回顾会、站会和 1:1 不再以 "我昨天做了啥来着?" 开场。

## 每天的两层内容

每条记录有两层:

- **一句话简报** — 一句话概括这一天的形貌。直接显示在笔记列表里。
- **详细视图** — 展开简报可以看到按项目分组的 Markdown 报告,每个主题一个 H3 小节,下面是要点列表。

简报用来扫读;详细视图用来粘到回顾文档里。

每一天的小标头显示会话数和总成本 — 与 [统计仪表盘](/purplemux/zh-CN/docs/usage-rate-limits/) 用同样的数字,只是简报形式。

## 生成报告

报告是按需生成,不是自动的。在笔记视图中:

- **生成** 出现在缺失的某天旁边,点击会从 JSONL 转录生成那天的报告。
- **重新生成** 在已有记录上重新构建同一天的内容(添加了上下文或切换语言时有用)。
- **生成全部** 顺序遍历每一个缺失日并补全。可以随时停止批处理。

LLM 先单独处理每个会话再按项目合并,因此跨多个标签的长日子里上下文不会丢失。

{% call callout('note', '语言跟随应用') %}
报告用 purplemux 当前的语言写。切换应用语言后重新生成,可以得到同样内容的新语种版本。
{% endcall %}

## 在哪里

| 入口 | 路径 |
|---|---|
| 侧边栏 | **笔记** 入口,打开列表视图 |
| 快捷键 | macOS <kbd>⌘⇧E</kbd>,Linux <kbd>Ctrl⇧E</kbd> |
| 存储 | `~/.purplemux/stats/daily-reports/<date>.json` |

每一天是一个 JSON 文件,包含简报、详细 Markdown、语言和会话元数据。除了 LLM 调用本身(走主机上配置的 Claude Code 账户),没有任何东西离开你的机器。

## 按项目结构

详细视图里,典型一天看起来像:

```markdown
**purplemux**

### 落地页草稿
- 设计了 Hero / Why / Mobile / Stats 八节结构布局
- 把品牌紫色变成 OKLCH 变量
- 应用了桌面 / 移动截图 mockup 框

### 功能卡 mockup
- 在多会话仪表盘上重现真实的 spinner / pulse 指示
- 收紧了 Git Diff、工作区和自托管 mockup 的 CSS
```

同一个项目内的会话被合并到一个项目标题下;项目内的主题成为 H3 小节。可以把渲染后的 Markdown 直接粘到回顾模板里。

## 当某天不值得总结

没有 Claude 会话的日子不会生成记录。只有一个微小会话的日子可能产生很短的简报 — 这没问题;真正干活的下一次会重新生成更长的版本。

批量生成器会跳过当前语种已有报告的日子,只填补真正的空缺。

## 隐私

构建报告所用的文本就是 `~/.claude/projects/` 下你自己也能读的 JSONL 转录。总结请求是每天一次的 LLM 调用;缓存输出留在 `~/.purplemux/`。没有遥测、没有上传、没有共享缓存。

## 下一步

- **[用量与速率限制](/purplemux/zh-CN/docs/usage-rate-limits/)** — 那些会话计数和成本数字所在的仪表盘。
- **[实时会话视图](/purplemux/zh-CN/docs/live-session-view/)** — 数据来源,实时版。
- **[键盘快捷键](/purplemux/zh-CN/docs/keyboard-shortcuts/)** — 包括用于笔记的 <kbd>⌘⇧E</kbd>。
