---
title: 分頁與窗格
description: 工作區內分頁的運作方式、分割窗格的方法，以及在窗格之間移動焦點的快速鍵。
eyebrow: 工作區與終端機
permalink: /zh-TW/docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

工作區會被切分為多個 **窗格**（pane），每個窗格內又包含一疊 **分頁**（tab）。分割可以讓你並排檢視多個內容；分頁則允許單一窗格容納多個 shell，又不會搶占螢幕空間。

## 分頁

每個分頁都是真實的 shell，連到一個 tmux 工作階段。分頁標題來自前景程序 — 輸入 `vim`，分頁就會自動更名；離開 vim 後又會回到目錄名稱。

| 動作 | macOS | Linux / Windows |
|---|---|---|
| 新分頁 | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| 關閉分頁 | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| 上一個分頁 | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| 下一個分頁 | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| 切換到分頁 1–9 | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

直接在分頁列上拖曳分頁即可重新排序。分頁列尾端的 **+** 按鈕會打開與 <kbd>⌘T</kbd> 相同的範本選擇器。

{% call callout('tip', 'Terminal 之外的範本') %}
新分頁選單可以選擇 **Terminal**、**Claude**、**Diff** 或 **Web browser** 作為面板類型。它們都是分頁 — 可以混用在同一個窗格中，並用上述快速鍵在它們之間切換。
{% endcall %}

## 分割窗格

分頁會共用螢幕空間。若想同時看到兩件事，就分割窗格。

| 動作 | macOS | Linux / Windows |
|---|---|---|
| 往右分割 | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| 往下分割 | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

新分割會繼承工作區的預設目錄，並從一個空的終端機分頁開始。每個窗格都有自己的分頁列，因此右側窗格可以放 diff 檢視，左側窗格則執行 `claude`。

## 在窗格間移動焦點

使用方向鍵的快速鍵 — 它會走訪分割樹，所以從一個深層巢狀的窗格按 <kbd>⌘⌥→</kbd>，仍會落到視覺上相鄰的那一個。

| 動作 | macOS | Linux / Windows |
|---|---|---|
| 焦點往左 | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| 焦點往右 | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| 焦點往上 | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| 焦點往下 | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## 調整大小與平均

直接拖曳窗格之間的分隔條可做精細控制，也能用鍵盤。

| 動作 | macOS | Linux / Windows |
|---|---|---|
| 縮小左側 | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| 縮小右側 | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| 縮小上方 | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| 縮小下方 | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| 平均分割 | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

當版面被拉到難以使用的極端時，平均分割是最快的重置方式。

## 清除畫面

<kbd>⌘K</kbd> 會清除目前窗格的終端機畫面，與大多數原生終端機相同。shell 程序仍會持續執行；只有可見的緩衝區被清空。

| 動作 | macOS | Linux / Windows |
|---|---|---|
| 清除畫面 | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## 分頁能撐過任何情況

關閉分頁會終止它對應的 tmux 工作階段。但是關閉 *瀏覽器*、重新整理、網路斷線都不會 — 每個分頁會繼續在伺服器上運作。重新打開後，相同的窗格、分割與分頁都會回來。

伺服器重啟時的還原機制請見 [儲存與還原版面](/purplemux/zh-TW/docs/save-restore/)。

## 下一步

- **[儲存與還原版面](/purplemux/zh-TW/docs/save-restore/)** — 版面是如何保留下來的。
- **[鍵盤快速鍵](/purplemux/zh-TW/docs/keyboard-shortcuts/)** — 所有繫結一覽表。
- **[Git 工作流面板](/purplemux/zh-TW/docs/git-workflow/)** — 一個值得擺進分割視窗的好用分頁類型。
