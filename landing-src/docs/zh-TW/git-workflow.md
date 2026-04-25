---
title: Git 工作流面板
description: 與終端機並排的 diff 檢視器、歷史瀏覽器與同步控制 — 出問題時可一鍵把問題交給 Claude。
eyebrow: 工作區與終端機
permalink: /zh-TW/docs/git-workflow/index.html
---
{% from "docs/callouts.njk" import callout %}

Git 面板是一種分頁類型，就像終端機一樣。把它放在 Claude 工作階段旁邊，你就能讀取變更、瀏覽歷史並推送，全程不必離開儀表板。當 git 自己出狀況時，「詢問 Claude」會把問題一鍵交給某個工作階段處理。

## 開啟面板

新增分頁並選擇 **Diff** 作為面板類型，或在現有分頁的面板類型選單切換到它。面板會綁定到與其同層級 shell 相同的工作目錄 — 如果分頁位於 `~/code/api`，diff 面板就會讀取那個 repo。

| 動作 | macOS | Linux / Windows |
|---|---|---|
| 把目前分頁切換到 Diff 模式 | <kbd>⌘⇧F</kbd> | <kbd>Ctrl+Shift+F</kbd> |

如果該目錄不是 git repo，面板會明說，且不會擋路。

## Diff 檢視器

Changes 分頁會以檔案為單位顯示工作目錄的變更。

- **並排或行內** — 在面板標頭切換。並排視圖類似 GitHub 的 split view；行內視圖則類似 GitHub 的 unified view。
- **語法高亮** — 你的編輯器會高亮的語言，這裡都會偵測到。
- **行內 hunk 展開** — 點選 hunk 旁的 context lines 即可展開周圍程式碼，無須離開面板。
- **檔案清單** — 在面板側邊欄裡瀏覽變更檔案。

當面板可見時，每 10 秒會重新整理；在其他工具中存檔時則會立即更新。

## 提交歷史

切換到 **History** 分頁可看到目前分支的分頁式 commit log。每筆條目顯示 hash、標題、作者與時間；點選即可看到該 commit 帶來的 diff。當你想想起某個檔案為何長這樣，又不想跳回終端機跑 `git log` 時非常實用。

## 同步面板

標頭列顯示目前分支、上游與 ahead/behind 計數，提供三種動作：

- **Fetch** — 在背景每 3 分鐘對上游執行 `git fetch`，亦可手動觸發。
- **Pull** — 條件允許時做 fast-forward。
- **Push** — 推送到設定的上游。

同步刻意設計得很狹窄。需要做決定的情況都會被拒絕 — 分支已分歧、工作目錄髒、缺少上游 — 並告訴你原因。

{% call callout('warning', '同步無法進行時') %}
面板會清楚回報的常見失敗：

- **沒有 upstream** — 還沒執行 `git push -u`。
- **驗證問題** — 憑證遺失或被拒。
- **分歧** — 本地與遠端各有獨立 commit；需先 rebase 或 merge。
- **本地有變更** — 未提交的工作會擋住 pull。
- **被拒絕** — push 因 non-fast-forward 被拒。
{% endcall %}

## 詢問 Claude

當同步失敗時，錯誤的 toast 會提供 **詢問 Claude** 按鈕。點下去會把失敗的脈絡 — 錯誤類型、相關的 `git` 輸出、目前分支狀態 — 當作 prompt 送進同一工作區的 Claude 分頁。Claude 會接著走完恢復流程：rebase、解決衝突、設定 upstream，無論錯誤是什麼。

這就是這個面板的核心賭注：常見情境靠工具，長尾交給 LLM。你不必切換脈絡；prompt 會直接出現在你本來就要用的工作階段裡。

## 下一步

- **[分頁與窗格](/purplemux/zh-TW/docs/tabs-panes/)** — 把 diff 面板分割在 Claude 工作階段旁邊。
- **[第一個工作階段](/purplemux/zh-TW/docs/first-session/)** — Claude 權限提示如何在儀表板上呈現。
- **[網頁瀏覽器面板](/purplemux/zh-TW/docs/web-browser-panel/)** — 另一個值得與終端機並排執行的面板類型。
