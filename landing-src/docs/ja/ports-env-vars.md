---
title: ポートと環境変数
description: purplemux が開くすべてのポートと、その動作に影響するすべての環境変数。
eyebrow: リファレンス
permalink: /ja/docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux はワンライナーインストールを目指していますが、ランタイムは設定可能です。このページではサーバが開くすべてのポートと、サーバが読むすべての環境変数を列挙します。

## ポート

| ポート | デフォルト | 上書き | 備考 |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux` | `8022` がすでに使用中ならサーバは警告を出してランダムな空きポートにバインドします。 |
| 内部 Next.js (本番) | ランダム | — | `pnpm start` / `purplemux start` では外側のサーバが `127.0.0.1:<random>` にバインドされた Next.js standalone にプロキシします。外部公開なし。 |

`8022` は `web` + `ssh` をくっつけたもの。プロトコルではなくユーモアです。

{% call callout('note', 'バインドするインターフェースはアクセスポリシーに従う') %}
purplemux は、アクセスポリシーが実際に外部クライアントを許可している場合にのみ `0.0.0.0` にバインドします。localhost のみのセットアップは `127.0.0.1` にバインドするので、LAN 上の他のマシンは TCP 接続すら開けません。下記の `HOST` を参照。
{% endcall %}

## サーバ環境変数

`server.ts` と起動時にロードされるモジュールが読みます。

| 変数 | デフォルト | 効果 |
|---|---|---|
| `PORT` | `8022` | HTTP/WS の待ち受けポート。`EADDRINUSE` 時はランダムポートにフォールバック。 |
| `HOST` | 未設定 | 許可するクライアントを示すカンマ区切りの CIDR / キーワード。キーワード: `localhost`、`tailscale`、`lan`、`all` (または `*` / `0.0.0.0`)。例: `HOST=localhost`、`HOST=localhost,tailscale`、`HOST=10.0.0.0/8,localhost`。env で設定された場合、アプリ内の **設定 → ネットワークアクセス** はロックされます。 |
| `NODE_ENV` | `purplemux start` では `production`、`pnpm dev` では `development` | 開発パイプライン (`tsx watch`、Next dev) と本番パイプライン (`tsup` バンドルが Next standalone にプロキシ) を切り替え。 |
| `__PMUX_APP_DIR` | `process.cwd()` | `dist/server.js` と `.next/standalone/` を保持するディレクトリを上書き。`bin/purplemux.js` が自動設定。通常触る必要はありません。 |
| `__PMUX_APP_DIR_UNPACKED` | 未設定 | macOS Electron アプリ内の asar-unpacked パス用の `__PMUX_APP_DIR` バリアント。 |
| `__PMUX_ELECTRON` | 未設定 | Electron メインプロセスがプロセス内でサーバを起動するときに設定し、`server.ts` の自動 `start()` 呼び出しをスキップして Electron がライフサイクルを駆動できるようにする。 |
| `PURPLEMUX_CLI` | `1` (`bin/purplemux.js` が設定) | プロセスが Electron ではなく CLI / サーバであることを共有モジュールに知らせるマーカー。`pristine-env.ts` が使用。 |
| `__PMUX_PRISTINE_ENV` | 未設定 | 親シェルの env を `bin/purplemux.js` が JSON スナップショットで取得。子プロセス (claude、tmux) が消毒された PATH ではなくユーザの `PATH` を継承するため。内部用 — 自動設定。 |
| `AUTH_PASSWORD` | 未設定 | Next 起動前にサーバが `config.json` の scrypt ハッシュから設定。NextAuth がそこから読みます。手動設定しないでください。 |
| `NEXTAUTH_SECRET` | 未設定 | 同様 — 起動時に `config.json` から populate。 |

## ロギング環境変数

`src/lib/logger.ts` が読みます。

| 変数 | デフォルト | 効果 |
|---|---|---|
| `LOG_LEVEL` | `info` | `LOG_LEVELS` で名前指定されないものすべてのルートレベル。 |
| `LOG_LEVELS` | 未設定 | カンマ区切りの `name=level` ペアによるモジュール単位の上書き。 |

レベル順: `trace` · `debug` · `info` · `warn` · `error` · `fatal`。

```bash
LOG_LEVEL=debug purplemux

# Claude フックモジュールだけをデバッグ
LOG_LEVELS=hooks=debug purplemux

# 複数モジュールを同時に
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux
```

最も役立つモジュール名:

| モジュール | ソース | 見えるもの |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`、`status-manager.ts` の一部 | フック受信 / 処理 / 状態遷移 |
| `status` | `status-manager.ts` | ポーリング、JSONL ウォッチャー、ブロードキャスト |
| `tmux` | `lib/tmux.ts` | すべての tmux コマンドと結果 |
| `server`、`lock` など | 対応する `lib/*.ts` | プロセスライフサイクル |

ログファイルはレベルに関わらず `~/.purplemux/logs/` に着地します。

## ファイル (環境変数相当)

いくつかの値は環境変数のように振る舞いますが、CLI とフックスクリプトが env のやり取りなしに見つけられるようにディスクに置かれます:

| ファイル | 内容 | 使用元 |
|---|---|---|
| `~/.purplemux/port` | 現在のサーバポート (プレーンテキスト) | `bin/cli.js`、`status-hook.sh`、`statusline.sh` |
| `~/.purplemux/cli-token` | 32 バイト hex の CLI トークン | `bin/cli.js`、フックスクリプト (`x-pmux-token` で送信) |

CLI は env でも受け取り、こちらが優先されます:

| 変数 | デフォルト | 効果 |
|---|---|---|
| `PMUX_PORT` | `~/.purplemux/port` の内容 | CLI が話すポート。 |
| `PMUX_TOKEN` | `~/.purplemux/cli-token` の内容 | `x-pmux-token` として送られる Bearer トークン。 |

完全なコマンドは [CLI リファレンス](/purplemux/ja/docs/cli-reference/) を参照してください。

## 組み合わせの例

いくつかのよくある組み合わせ:

```bash
# デフォルト: localhost のみ、ポート 8022
purplemux

# どこからでもバインド (LAN + Tailscale + リモート)
HOST=all purplemux

# Localhost + Tailscale のみ
HOST=localhost,tailscale purplemux

# カスタムポート + 詳細なフックトレース
PORT=9000 LOG_LEVELS=hooks=debug purplemux

# デバッグ用フルセット
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux
```

{% call callout('tip') %}
永続インストールでは launchd / systemd ユニットの `Environment=` ブロックで設定してください。ユニットファイル例は [インストール](/purplemux/ja/docs/installation/#start-on-boot) を参照。
{% endcall %}

## 次のステップ

- **[インストール](/purplemux/ja/docs/installation/)** — これらの変数が通常置かれる場所。
- **[データディレクトリ](/purplemux/ja/docs/data-directory/)** — `port` と `cli-token` がフックスクリプトとどう連携するか。
- **[CLI リファレンス](/purplemux/ja/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` の文脈。
