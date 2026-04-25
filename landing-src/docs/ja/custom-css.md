---
title: カスタム CSS
description: CSS 変数を上書きして色、スペーシング、個別のサーフェスを再調整する。
eyebrow: カスタマイズ
permalink: /ja/docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux は CSS 変数システムの上に構築されています。ソースを触らずに視覚的なほぼすべてを変更できます — **外観** タブにルールを貼り付けて Apply をクリックすれば、すべての接続済みクライアントに即座に反映されます。

## どこに書くか

設定 (<kbd>⌘,</kbd>) を開いて **外観** を選びます。Custom CSS というラベルの 1 つの textarea があります。

1. ルールを書く。
2. **Apply** をクリック。CSS は各ページの `<style>` タグに注入されます。
3. **Reset** ですべての上書きをクリア。

CSS はサーバの `~/.purplemux/config.json` の `customCSS` に保存され、接続するすべてのデバイスに適用されます。

{% call callout('note', 'サーバ全体、デバイス単位ではない') %}
カスタム CSS はサーバ設定に住み、すべてのブラウザに付いてきます。1 つのデバイスを別のデバイスと違う見た目にしたい場合、現状サポートされていません。
{% endcall %}

## 仕組み

purplemux のほとんどの色、サーフェス、アクセントは `:root` (ライト) と `.dark` の下に CSS 変数として公開されています。変数を上書きすると、その変数が使われている場所すべて — サイドバー、ダイアログ、チャート、ステータスバッジ — に変更が波及します。

1 つの変数を変えるのは、コンポーネントセレクタを直接上書きするより常にほぼ良い選択です。コンポーネントクラスは安定 API ではなく、変数こそが API です。

## 最小限の例

ライトモードでサイドバーを少し暖色寄りにし、ダークサーフェスをさらに暗く:

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

または他に何も触らずブランドの色だけ変える:

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## 変数のグループ

外観パネルは **Available Variables** 配下に完全なリストを公開しています。主なバケツは:

- **Surface** — `--background`、`--card`、`--popover`、`--muted`、`--secondary`、`--accent`、`--sidebar`
- **Text** — `--foreground` と対応する `*-foreground` バリアント
- **Interactive** — `--primary`、`--primary-foreground`、`--destructive`
- **Border** — `--border`、`--input`、`--ring`
- **Palette** — `--ui-blue`、`--ui-teal`、`--ui-coral`、`--ui-amber`、`--ui-purple`、`--ui-pink`、`--ui-green`、`--ui-gray`、`--ui-red`
- **Semantic** — `--positive`、`--negative`、`--accent-color`、`--brand`、`--focus-indicator`、`--claude-active`

デフォルトの oklch 値とデザイン根拠を含む完全なトークンリストは、リポジトリの [`docs/STYLE.md`](https://github.com/subicura/purplemux/blob/main/docs/STYLE.md) を参照してください。それがソース・オブ・トゥルースです。

## 1 つのモードだけをターゲットにする

ライトには `:root`、ダークには `.dark` でラップします。クラスは `next-themes` によって `<html>` に設定されます。

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

片方のモードだけ変えたい場合は、もう片方を触らずに残してください。

## ターミナルは?

xterm.js ターミナルは、こちらの CSS 変数では駆動されない独自のキュレートされたパレットを使います。**ターミナル** タブで切り替えてください。[ターミナルテーマ](/purplemux/ja/docs/terminal-themes/) を参照。

## 次のステップ

- **[テーマとフォント](/purplemux/ja/docs/themes-fonts/)** — ライト、ダーク、システム; フォントサイズプリセット。
- **[ターミナルテーマ](/purplemux/ja/docs/terminal-themes/)** — ターミナル領域用の独立パレット。
- **[サイドバーと Claude オプション](/purplemux/ja/docs/sidebar-options/)** — 項目並び替え、Claude フラグの切り替え。
