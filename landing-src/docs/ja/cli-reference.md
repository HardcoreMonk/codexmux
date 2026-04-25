---
title: CLI リファレンス
description: purplemux と pmux バイナリのすべてのサブコマンドとフラグ。
eyebrow: リファレンス
permalink: /ja/docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

`purplemux` バイナリには 2 つの使い方があります: サーバスタータ (`purplemux` / `purplemux start`) として、そして実行中のサーバと話す HTTP API ラッパー (`purplemux <subcommand>`) として。短いエイリアス `pmux` は同一のものです。

## 1 つのバイナリ、2 つの役割

| 形式 | 動作 |
|---|---|
| `purplemux` | サーバを起動。`purplemux start` と同じ。 |
| `purplemux <subcommand>` | 実行中のサーバの CLI HTTP API と話す。 |
| `pmux ...` | `purplemux ...` のエイリアス。 |

`bin/purplemux.js` のディスパッチャは最初の引数を取り出します: 既知のサブコマンドは `bin/cli.js` にルーティング、それ以外 (または引数なし) はサーバを起動します。

## サーバを起動する

```bash
purplemux              # デフォルト
purplemux start        # 同じ、明示的に
PORT=9000 purplemux    # カスタムポート
HOST=all purplemux     # どこからでもバインド
```

完全な env サーフェスは [ポート & 環境変数](/purplemux/ja/docs/ports-env-vars/) を参照。

サーバはバインドした URL、モード、認証ステータスを表示します:

```
  ⚡ purplemux  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

`8022` がすでに使用中なら、サーバは警告を出してランダムな空きポートにバインドします。

## サブコマンド

すべてのサブコマンドは実行中のサーバを必要とします。ポートは `~/.purplemux/port` から、認証トークンは `~/.purplemux/cli-token` から読み、いずれもサーバ起動時に自動で書き込まれます。

| コマンド | 目的 |
|---|---|
| `purplemux workspaces` | ワークスペース一覧 |
| `purplemux tab list [-w WS]` | タブ一覧 (任意でワークスペーススコープ) |
| `purplemux tab create -w WS [-n NAME] [-t TYPE]` | 新しいタブを作成 |
| `purplemux tab send -w WS TAB_ID CONTENT...` | タブに入力を送る |
| `purplemux tab status -w WS TAB_ID` | タブのステータスを確認 |
| `purplemux tab result -w WS TAB_ID` | タブペインの現在の内容をキャプチャ |
| `purplemux tab close -w WS TAB_ID` | タブを閉じる |
| `purplemux tab browser ...` | `web-browser` タブを操作 (Electron のみ) |
| `purplemux api-guide` | 完全な HTTP API リファレンスを表示 |
| `purplemux help` | 使い方を表示 |

特に明記がなければ出力は JSON です。`--workspace` と `-w` は同義です。

### `tab create` のパネルタイプ

`-t` / `--type` フラグでパネルタイプを選びます。有効な値:

| 値 | パネル |
|---|---|
| `terminal` | 素のシェル |
| `claude-code` | `claude` がすでに動作しているシェル |
| `web-browser` | 組み込みブラウザ (Electron のみ) |
| `diff` | Git diff パネル |

`-t` なしでは素のターミナルになります。

### `tab browser` のサブコマンド

これらはタブのパネルタイプが `web-browser` のとき、しかも macOS Electron アプリ内でのみ動作します — そうでない場合ブリッジは 503 を返します。

| サブコマンド | 返り値 |
|---|---|
| `purplemux tab browser url -w WS TAB_ID` | 現在の URL + ページタイトル |
| `purplemux tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG。`-o` でディスクに保存、なしなら base64 を返す。`--full` でフルページキャプチャ。 |
| `purplemux tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | 直近のコンソールエントリ (リングバッファ、500 件) |
| `purplemux tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | 直近のネットワークエントリ。`--request ID` で 1 つのボディを取得 |
| `purplemux tab browser eval -w WS TAB_ID EXPR` | JS 式を評価し、結果をシリアライズ |

## 例

```bash
# ワークスペースを見つける
purplemux workspaces

# ワークスペース ws-MMKl07 に Claude タブを作成
purplemux tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# プロンプトを送る (TAB_ID は `tab list` から)
purplemux tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# 状態を確認
purplemux tab status -w ws-MMKl07 tb-abc

# ペインのスナップショット
purplemux tab result -w ws-MMKl07 tb-abc

# web-browser タブのフルページスクリーンショット
purplemux tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## 認証

すべてのサブコマンドは `x-pmux-token: $(cat ~/.purplemux/cli-token)` を送り、サーバ側で `timingSafeEqual` で検証されます。`~/.purplemux/cli-token` ファイルは初回サーバ起動時に `randomBytes(32)` で生成され、モード `0600` で保存されます。

`~/.purplemux/` を見られない別のシェルやスクリプトから CLI を駆動する必要がある場合、env で渡してください:

| 変数 | デフォルト | 効果 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` の内容 | CLI が話すポート |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` の内容 | `x-pmux-token` として送られる Bearer トークン |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) purplemux workspaces
```

{% call callout('warning') %}
CLI トークンはサーバへの完全なアクセスを与えます。パスワードのように扱ってください。チャットに貼ったり、コミットしたり、ビルドの env 変数に出したりしないでください。ローテートするには `~/.purplemux/cli-token` を削除してサーバを再起動します。
{% endcall %}

## update-notifier

`purplemux` は (起動のたびに) `update-notifier` で npm に新しいバージョンがないか確認し、あればバナーを表示します。`NO_UPDATE_NOTIFIER=1` または [標準的な `update-notifier` のオプトアウト](https://github.com/yeoman/update-notifier#user-settings) で無効化できます。

## 完全な HTTP API

`purplemux api-guide` はすべての `/api/cli/*` エンドポイントの完全な HTTP API リファレンスを (リクエストボディとレスポンスシェイプを含めて) 出力します。`curl` や別のランタイムから直接 purplemux を駆動したいときに便利です。

## 次のステップ

- **[ポート & 環境変数](/purplemux/ja/docs/ports-env-vars/)** — 広い env サーフェスでの `PMUX_PORT` / `PMUX_TOKEN`。
- **[アーキテクチャ](/purplemux/ja/docs/architecture/)** — CLI が実際に話している相手。
- **[トラブルシューティング](/purplemux/ja/docs/troubleshooting/)** — CLI が「サーバは起動していますか?」と言うとき。
