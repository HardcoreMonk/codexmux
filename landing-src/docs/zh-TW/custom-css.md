---
title: 自訂 CSS
description: 覆寫 CSS 變數來重新調整色彩、間距與個別表面。
eyebrow: 自訂
permalink: /zh-TW/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux 建立在 CSS 變數系統之上。你可以在不碰原始碼的情況下改變幾乎所有視覺元素 — 在 **外觀** 分頁貼上規則、按下套用，所有連線中的客戶端都會立即生效。

## 寫在哪裡

打開設定（<kbd>⌘,</kbd>）並選 **外觀**。你會看到一個標記為 Custom CSS 的單一文字區。

1. 寫下你的規則。
2. 點選 **套用**。CSS 會被注入到每頁的 `<style>` 標籤中。
3. 點選 **重設** 以清除所有覆寫。

CSS 儲存在伺服器的 `~/.purplemux/config.json`（`customCSS`），所以會套用到每個連線進來的裝置。

{% call callout('note', '伺服器全域，非每裝置獨立') %}
自訂 CSS 存在伺服器設定中，會跟著你到每個瀏覽器。如果你想讓某個裝置看起來與另一個不同，目前還不支援。
{% endcall %}

## 它如何運作

purplemux 中大部分的色彩、表面與裝飾色都以 CSS 變數的形式公開於 `:root`（淺色）與 `.dark`。覆寫變數會把變更層疊到任何使用該變數的地方 — 側邊欄、對話框、圖表、狀態徽章。

更動單一變數幾乎總是比直接覆寫元件選擇器更好。元件 class 不是穩定的 API；變數才是。

## 一個最小範例

把淺色模式的側邊欄調暖一點，並把深色表面再壓深：

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

或者重新著色品牌色而不動其他東西：

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## 變數分組

外觀面板在 **Available Variables** 下公開完整清單。主要分類是：

- **Surface** — `--background`、`--card`、`--popover`、`--muted`、`--secondary`、`--accent`、`--sidebar`
- **Text** — `--foreground` 與相應的 `*-foreground` 變體
- **Interactive** — `--primary`、`--primary-foreground`、`--destructive`
- **Border** — `--border`、`--input`、`--ring`
- **Palette** — `--ui-blue`、`--ui-teal`、`--ui-coral`、`--ui-amber`、`--ui-purple`、`--ui-pink`、`--ui-green`、`--ui-gray`、`--ui-red`
- **Semantic** — `--positive`、`--negative`、`--accent-color`、`--brand`、`--focus-indicator`、`--claude-active`

完整 token 清單、預設 oklch 值與設計理念，請見 repo 中的 [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md)。該文件是真實來源。

## 只針對單一模式

把規則包在 `:root` 裡用於淺色，`.dark` 裡用於深色。`<html>` 上的這個 class 由 `next-themes` 設定。

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

如果你只需要變更其中一個模式，另一個就不要動。

## 那終端機呢？

xterm.js 終端機使用自己的調色盤，從一份精選清單中挑選 — 它不是由這些 CSS 變數驅動。請在 **Terminal** 分頁切換。請見 [終端機主題](/purplemux/zh-TW/docs/terminal-themes/)。

## 下一步

- **[主題與字型](/purplemux/zh-TW/docs/themes-fonts/)** — 淺色、深色、跟隨系統；字級預設。
- **[終端機主題](/purplemux/zh-TW/docs/terminal-themes/)** — 終端機區獨立的調色盤。
- **[側邊欄與 Claude 選項](/purplemux/zh-TW/docs/sidebar-options/)** — 重新排序項目、切換 Claude 旗標。
