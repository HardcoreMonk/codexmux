---
title: エディタ連携
description: 現在のフォルダをお好みのエディタで開く — VS Code、Cursor、Zed、code-server、またはカスタム URL — ヘッダから直接。
eyebrow: カスタマイズ
permalink: /ja/docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

すべてのワークスペースのヘッダには **EDITOR** ボタンがあります。クリックすると、アクティブセッションのフォルダをお好みのエディタで開きます。プリセットを選んで URL を指定するか OS のハンドラに任せれば、設定完了です。

## ピッカーを開く

設定 (<kbd>⌘,</kbd>) → **エディタ** タブ。プリセットのリストが表示され、選択次第で URL フィールドが現れます。

## 利用可能なプリセット

| プリセット | 動作 |
|---|---|
| **Code Server (Web)** | ホストされた [code-server](https://github.com/coder/code-server) インスタンスを `?folder=<path>` で開く。URL が必要。 |
| **VS Code** | `vscode://file/<path>?windowId=_blank` をトリガー。 |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **Custom URL** | `{folder}` / `{folderEncoded}` プレースホルダ付きの自由な URL テンプレート。 |
| **Disabled** | EDITOR ボタンを完全に隠す。 |

4 つのデスクトップ IDE プリセット (VS Code、Cursor、Windsurf、Zed) は OS が URI ハンドラを登録していることが前提です。IDE がローカルにインストールされていれば期待通りに動きます。

## Web vs ローカル

各プリセットでフォルダの開き方には意味のある違いがあります:

- **code-server** はブラウザ内で動作します。URL はあなたがホストしているサーバ (自分のもの、ネットワーク上、または Tailscale の前面に置いたもの) を指します。EDITOR ボタンを押すと新しいタブでフォルダが読み込まれます。
- **ローカル IDE** (VS Code、Cursor、Windsurf、Zed) は *ブラウザを動かしているマシン* に IDE がインストールされている必要があります。リンクは OS に渡され、登録されたハンドラが起動します。

スマートフォンで purplemux を使っている場合、code-server プリセットだけが動作します — スマートフォンは `vscode://` URL をデスクトップアプリで開けません。

## code-server セットアップ

製品内で案内される典型的なローカルセットアップ:

```bash
# macOS にインストール
brew install code-server

# 実行
code-server --port 8080

# Tailscale 経由の外部アクセス (任意)
tailscale serve --bg --https=8443 http://localhost:8080
```

エディタタブで URL に code-server が到達可能なアドレスを設定します — ローカルなら `http://localhost:8080`、Tailscale Serve の背後なら `https://<machine>.<tailnet>.ts.net:8443`。purplemux は URL が `http://` または `https://` で始まることを検証し、`?folder=<absolute path>` を自動で付加します。

{% call callout('note', '8022 以外のポートを選ぶ') %}
purplemux はすでに `8022` に住んでいます。code-server は別のポート (例では `8080`) で動かして、ぶつからないようにしてください。
{% endcall %}

## カスタム URL テンプレート

Custom プリセットを使うと、URL にフォルダを渡すあらゆるもの — Coder workspaces、Gitpod、Theia、内部ツール — を指定できます。テンプレートには **少なくとも 1 つ** のプレースホルダが必要です:

- `{folder}` — 絶対パス、未エンコード。
- `{folderEncoded}` — URL エンコード済み。

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux は保存時にテンプレートを検証し、プレースホルダのないものを拒否します。

## ボタンを無効にする

**Disabled** を選びます。ボタンがワークスペースヘッダから消えます。

## 次のステップ

- **[サイドバーと Claude オプション](/purplemux/ja/docs/sidebar-options/)** — サイドバー項目並び替え、Claude フラグの切り替え。
- **[カスタム CSS](/purplemux/ja/docs/custom-css/)** — さらなるビジュアル調整。
- **[Tailscale](/purplemux/ja/docs/tailscale/)** — code-server にも安全な外部アクセス。
