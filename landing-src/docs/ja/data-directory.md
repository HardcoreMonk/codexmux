---
title: データディレクトリ
description: ~/.purplemux/ の中身、安全に削除できるもの、バックアップの方法。
eyebrow: リファレンス
permalink: /ja/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux が保持する永続状態 — 設定、レイアウト、セッション履歴、キャッシュ — はすべて `~/.purplemux/` の下にあります。それ以外には何もありません。`localStorage` も、システムキーチェーンも、外部サービスもありません。

## 概観

```
~/.purplemux/
├── config.json              # アプリ設定 (認証、テーマ、ロケール、…)
├── workspaces.json          # ワークスペースリスト + サイドバー状態
├── workspaces/
│   └── {wsId}/
│       ├── layout.json           # ペイン / タブツリー
│       ├── message-history.json  # ワークスペース別の入力履歴
│       └── claude-prompt.md      # --append-system-prompt-file の内容
├── hooks.json               # Claude Code フック + statusline 設定 (生成)
├── status-hook.sh           # フックスクリプト (生成、0755)
├── statusline.sh            # statusline スクリプト (生成、0755)
├── rate-limits.json         # 最新の statusline JSON
├── session-history.json     # 完了済み Claude セッションログ (ワークスペース横断)
├── quick-prompts.json       # カスタムクイックプロンプト + 無効化されたビルトイン
├── sidebar-items.json       # カスタムサイドバー項目 + 無効化されたビルトイン
├── vapid-keys.json          # Web Push VAPID 鍵ペア (生成)
├── push-subscriptions.json  # Web Push エンドポイントサブスクリプション
├── cli-token                # CLI 認証トークン (生成)
├── port                     # 現在のサーバポート
├── pmux.lock                # 単一インスタンスロック {pid, port, startedAt}
├── logs/                    # pino-roll ログファイル
├── uploads/                 # チャット入力バー経由で添付された画像
└── stats/                   # Claude 使用量統計キャッシュ
```

機密を含むファイル (config、トークン、レイアウト、VAPID 鍵、ロック) は `tmpFile → rename` パターンでモード `0600` で書き込まれます。

## トップレベルファイル

| ファイル | 内容 | 削除しても安全? |
|---|---|---|
| `config.json` | scrypt ハッシュ化されたログインパスワード、HMAC セッションシークレット、テーマ、ロケール、フォントサイズ、通知トグル、エディタ URL、ネットワークアクセス、カスタム CSS | はい — オンボーディング再実行 |
| `workspaces.json` | ワークスペースインデックス、サイドバー幅 / 折り畳み状態、アクティブワークスペース ID | はい — 全ワークスペースとタブを消去 |
| `hooks.json` | Claude Code `--settings` マッピング (イベント → スクリプト) + `statusLine.command` | はい — 次回起動時に再生成 |
| `status-hook.sh`、`statusline.sh` | `/api/status/hook` と `/api/status/statusline` に `x-pmux-token` 付きで POST | はい — 次回起動時に再生成 |
| `rate-limits.json` | 最新の Claude statusline JSON: `ts`、`model`、`five_hour`、`seven_day`、`context`、`cost` | はい — Claude 実行に伴い再構築 |
| `session-history.json` | 完了済み Claude セッション直近 200 件 (プロンプト、結果、所要時間、ツール、ファイル) | はい — 履歴をクリア |
| `quick-prompts.json`、`sidebar-items.json` | ビルトインリストへの `{ custom: […], disabledBuiltinIds: […], order: […] }` のオーバーレイ | はい — デフォルトに戻す |
| `vapid-keys.json` | Web Push VAPID 鍵ペア、初回起動時に生成 | `push-subscriptions.json` も削除しない限りはやめておく (既存サブスクリプションが壊れる) |
| `push-subscriptions.json` | ブラウザごとのプッシュエンドポイント | はい — 各デバイスで再サブスクライブ |
| `cli-token` | `purplemux` CLI とフックスクリプト用 32 バイト hex トークン (`x-pmux-token` ヘッダ) | はい — 次回起動時に再生成。ただしすでに生成済みのフックスクリプトは、サーバが上書きするまで古いトークンを保持します |
| `port` | 現在のポートをプレーンテキストで保持。フックスクリプトと CLI が読みます | はい — 次回起動時に再生成 |
| `pmux.lock` | 単一インスタンスガード `{ pid, port, startedAt }` | purplemux プロセスが生きていない場合のみ |

{% call callout('warning', 'ロックファイルの落とし穴') %}
purplemux が「すでに実行中」と言って起動を拒否するのにプロセスが生きていない場合、`pmux.lock` が古くなっています。`rm ~/.purplemux/pmux.lock` で再試行してください。一度でも `sudo` で purplemux を実行したことがある場合、ロックファイルが root 所有になっているかもしれません — 一度 `sudo rm` してください。
{% endcall %}

## ワークスペース別ディレクトリ (`workspaces/{wsId}/`)

各ワークスペースは生成されたワークスペース ID を名前とする独自のフォルダを持ちます。

| ファイル | 内容 |
|---|---|
| `layout.json` | 再帰的なペイン / タブツリー: リーフ `pane` ノードは `tabs[]` を、`split` ノードは `children[]` と `ratio` を持ちます。各タブは tmux セッション名 (`pt-{wsId}-{paneId}-{tabId}`)、キャッシュされた `cliState`、`claudeSessionId`、最後の resume コマンドを保持。 |
| `message-history.json` | ワークスペース別の Claude 入力履歴。500 件まで。 |
| `claude-prompt.md` | このワークスペース内のすべての Claude タブに渡される `--append-system-prompt-file` の内容。ワークスペース作成 / 名前変更 / ディレクトリ変更時に再生成。 |

単一の `workspaces/{wsId}/layout.json` を削除すると、他に影響を与えずにそのワークスペースのレイアウトをデフォルトのペインにリセットできます。

## `logs/`

Pino-roll の出力。UTC 1 日に 1 ファイル、サイズ制限を超えると数値サフィックスが付きます:

```
logs/purplemux.2026-04-19.1.log
```

デフォルトレベルは `info`。`LOG_LEVEL` で上書き、または `LOG_LEVELS` でモジュール単位 — [ポート & 環境変数](/purplemux/ja/docs/ports-env-vars/) 参照。

ログは週次ローテーション (7 ファイルまで)。いつでも削除して構いません。

## `uploads/`

チャット入力バー (ドラッグ、ペースト、クリップ) 経由で添付された画像:

```
uploads/{wsId}/{tabId}/{timestamp}-{rand}-{name}.{ext}
```

- 許可: `image/png`、`image/jpeg`、`image/gif`、`image/webp`
- 1 ファイル最大 10 MB、モード `0600`
- サーバ起動時に自動クリーンアップ: 24 時間以上前のものは削除
- 手動クリーンアップ: **設定 → システム → 添付画像 → 今すぐクリーン**

## `stats/`

純粋なキャッシュ。`~/.claude/projects/**/*.jsonl` から派生 — purplemux はそのディレクトリを読むだけです。

| ファイル | 内容 |
|---|---|
| `cache.json` | 日ごとの集計: メッセージ、セッション、ツール呼び出し、時間別カウント、モデル別トークン使用量 |
| `uptime-cache.json` | 日ごとのアップタイム / アクティブ分の集計 |
| `daily-reports/{YYYY-MM-DD}.json` | AI 生成の日次ブリーフ |

フォルダ全体を削除すると、次の統計リクエスト時に再計算が走ります。

## リセット表

| リセット対象 | 削除するもの |
|---|---|
| ログインパスワード (オンボーディング再実行) | `config.json` |
| すべてのワークスペースとタブ | `workspaces.json` + `workspaces/` |
| 単一ワークスペースのレイアウト | `workspaces/{wsId}/layout.json` |
| 使用量統計 | `stats/` |
| プッシュサブスクリプション | `push-subscriptions.json` |
| 「すでに実行中」で詰まった | `pmux.lock` (プロセスが生きていない場合のみ) |
| すべて (ファクトリリセット) | `~/.purplemux/` |

`hooks.json`、`status-hook.sh`、`statusline.sh`、`port`、`cli-token`、`vapid-keys.json` はすべて次回起動時に自動再生成されるので、削除しても無害です。

## バックアップ

ディレクトリ全体は素の JSON といくつかのシェルスクリプトです。バックアップ:

```bash
tar czf purplemux-backup.tgz -C ~ .purplemux
```

新しいマシンに復元するには展開して purplemux を起動するだけです。フックスクリプトは新しいサーバのポートで書き換えられ、それ以外 (ワークスペース、履歴、設定) はそのまま引き継がれます。

{% call callout('warning') %}
`pmux.lock` を復元しないでください — 特定の PID に紐付いており、起動をブロックします。除外してください: `--exclude pmux.lock`。
{% endcall %}

## すべて消去

```bash
rm -rf ~/.purplemux
```

先に purplemux が動いていないことを確認してください。次回起動時には初回実行体験が再開します。

## 次のステップ

- **[ポート & 環境変数](/purplemux/ja/docs/ports-env-vars/)** — このディレクトリに影響するすべての変数。
- **[アーキテクチャ](/purplemux/ja/docs/architecture/)** — これらのファイルが動作中のサーバとどうつながるか。
- **[トラブルシューティング](/purplemux/ja/docs/troubleshooting/)** — よくある問題と対処。
