---
title: 筆記（AI 每日報告）
description: 由 LLM 撰寫、儲存於本機的 Markdown，每天結束後總結所有 Claude Code 工作階段。
eyebrow: Claude Code
permalink: /zh-TW/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

當一天結束時，purplemux 可以讀取當日的工作階段紀錄，幫你寫一行簡報加上每專案的 Markdown 摘要。它住在側邊欄裡稱為 **筆記**，存在的目的是讓回顧、站立會議與一對一不必再以「我昨天到底做了什麼？」開頭。

## 每天能得到什麼

每筆條目有兩層：

- **一行簡報** — 一句話捕捉一天的輪廓，直接顯示在筆記清單。
- **詳細檢視** — 展開簡報以查看依專案分組的 Markdown 報告，每個主題用 H3 區段，下方列出重點清單。

簡報用來掃讀；詳細檢視用來貼進回顧文件。

每一天的小標頭顯示工作階段數與總費用 — 與 [統計儀表板](/purplemux/zh-TW/docs/usage-rate-limits/) 相同的數字，以摘要呈現。

## 產生報告

報告是依需求產生的，不是自動產生。從筆記檢視中：

- 在缺漏日期旁的 **產生** 會從 JSONL 紀錄產生當天的報告。
- 在現有條目上的 **重新產生** 會以新內容重建同一天（適合在補充了 context 或切換語言後使用）。
- **全部產生** 會依序走過每個缺漏的日期填補。可隨時停止批次。

LLM 會先個別處理每個工作階段，再依專案合併，因此即使是分頁眾多的長日，context 也不會丟失。

{% call callout('note', '語系跟隨 App') %}
報告以 purplemux 設定的語言撰寫。切換 App 語言並重新產生即可在新語系下取得相同內容。
{% endcall %}

## 它住在哪裡

| 介面 | 路徑 |
|---|---|
| 側邊欄 | **筆記** 條目，打開清單檢視 |
| 快速鍵 | macOS <kbd>⌘⇧E</kbd>，Linux <kbd>Ctrl⇧E</kbd> |
| 儲存位置 | `~/.purplemux/stats/daily-reports/<date>.json` |

每天是一個 JSON 檔案，包含簡報、詳細 Markdown、語系與工作階段 metadata。除了 LLM 呼叫本身（會走主機所設定的 Claude Code 帳號），不會有任何東西離開你的機器。

## 每專案結構

詳細檢視中，典型的一天看起來像：

```markdown
**purplemux**

### Landing page draft
- Designed the eight-section structure with Hero / Why / Mobile / Stats layouts
- Made the purple brand color an OKLCH variable
- Applied desktop / mobile screenshot mockup frames

### Feature card mockups
- Reproduced real spinner / pulse indicators on the multi-session dashboard
- Tightened Git Diff, workspace, and self-hosted mockup CSS
```

在同一專案中工作的工作階段會合併到一個專案標題下；專案內的主題成為 H3 區段。你可以把渲染後的 Markdown 直接貼進回顧模板。

## 不適合摘要的日子

完全沒有 Claude 工作階段的日子不會產生條目。只有一個小工作階段的日子可能產出非常短的簡報 — 沒關係，下次你真正動手後再重新產生會比較長。

批次產生會略過目前語系下已有報告的日子，只填補真正缺漏的部分。

## 隱私

用來產生報告的文字，就是你自己也可以在 `~/.claude/projects/` 中讀到的 JSONL 紀錄。摘要請求是每天一次的 LLM 呼叫；快取輸出留在 `~/.purplemux/`。沒有遙測、沒有上傳、沒有共用快取。

## 下一步

- **[用量與用量限制](/purplemux/zh-TW/docs/usage-rate-limits/)** — 工作階段數與費用所來自的儀表板。
- **[即時工作階段檢視](/purplemux/zh-TW/docs/live-session-view/)** — 來源資料，即時呈現。
- **[鍵盤快速鍵](/purplemux/zh-TW/docs/keyboard-shortcuts/)** — 包含開啟筆記的 <kbd>⌘⇧E</kbd>。
