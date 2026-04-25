---
title: 終端機主題
description: 為 xterm.js 終端機設定獨立的調色盤 — 淺色一個、深色一個。
eyebrow: 自訂
permalink: /zh-TW/docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

終端機窗格使用 xterm.js，並有自己的調色盤，與其他 UI 部分獨立。你選一個深色主題與一個淺色主題；purplemux 會在應用程式主題切換時跟著切換。

## 開啟選擇器

設定（<kbd>⌘,</kbd>）→ **終端機** 分頁。你會看到 Dark 與 Light 兩個子分頁，各有一格主題卡。點一張 — 它會即時套用到每個打開的終端機。

## 為何需要獨立調色盤

終端機應用程式仰賴 16 色的 ANSI 調色盤（red、green、yellow、blue、magenta、cyan，加上 bright 變體）。UI 調色盤刻意低彩，會讓終端機輸出難以閱讀。為終端機量身打造的調色盤能讓 `vim`、`git diff`、語法高亮與 TUI 工具正確渲染。

每個主題定義：

- 背景、前景、游標、選取
- 八個基本 ANSI 色（black、red、green、yellow、blue、magenta、cyan、white）
- 八個 bright 變體

## 內建主題

**Dark**

- Snazzy *(預設)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**Light**

- Catppuccin Latte *(預設)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

卡片預覽會在主題背景上顯示七個核心 ANSI 色，這樣你就能在套用前先目測對比度。

## 淺/深切換如何運作

你獨立挑選 **一個深色主題** 與 **一個淺色主題**。實際生效的主題由解析後的應用程式主題決定：

- 應用程式主題為 **深色** → 你選的深色主題。
- 應用程式主題為 **淺色** → 你選的淺色主題。
- 應用程式主題為 **跟隨系統** → 跟隨 OS，自動切換。

所以選擇 **跟隨系統** 並把兩邊都設好，你就能得到一個跟著作業系統日夜切換的終端機，無需任何額外接線。

{% call callout('tip', '配合 App，或對比 App') %}
有些人喜歡讓終端機與其他 UI 一致。也有人偏好即使在淺色 App 中也用高對比的 Dracula 或 Tokyo Night 終端機。兩種都可以；選擇器不強制任何方案。
{% endcall %}

## 跨主題，不跨分頁

選擇是全域的。每個終端機窗格與每個 Claude 工作階段都使用同一個生效主題。沒有逐分頁覆寫；如果你需要，請開 issue。

## 加入自己的主題

自訂主題條目目前還不在 UI 中。內建清單位於 `src/lib/terminal-themes.ts`。如果你從原始碼建置，可以追加自己的；否則，支援的方式是開 PR 加入新主題。

## 下一步

- **[主題與字型](/purplemux/zh-TW/docs/themes-fonts/)** — 應用程式主題與字級。
- **[自訂 CSS](/purplemux/zh-TW/docs/custom-css/)** — 覆寫 UI 其餘部分。
- **[編輯器整合](/purplemux/zh-TW/docs/editor-integration/)** — 在外部編輯器中打開檔案。
