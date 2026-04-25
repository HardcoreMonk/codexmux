---
title: アーキテクチャ
description: ブラウザ、Node.js サーバ、tmux、Claude CLI の組み合わせ方。
eyebrow: リファレンス
permalink: /ja/docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux は 3 つの層を縫い合わせたものです: ブラウザフロントエンド、`:8022` の Node.js サーバ、ホスト上の tmux + Claude CLI。間にあるすべてはバイナリ WebSocket か小さな HTTP POST です。

## 3 つの層

```
ブラウザ                        Node.js サーバ (:8022)             ホスト
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple ソケット)
タイムライン ◀──ws /api/timeline──▶  timeline-server.ts                    │
ステータス ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

各 WebSocket は単一の目的を持ち、多重化しません。認証は WS アップグレード中に検証される NextAuth JWT クッキーです。

## ブラウザ

フロントエンドは Next.js (Pages Router) アプリです。サーバと話すパーツ:

| コンポーネント | ライブラリ | 目的 |
|---|---|---|
| ターミナルペイン | `xterm.js` | `/api/terminal` のバイトを描画。キーストローク、リサイズイベント、タイトル変更 (`onTitleChange`) を発信。 |
| セッションタイムライン | React + `useTimeline` | `/api/timeline` から Claude のターンを描画。`cliState` の派生はしない — それはすべてサーバ側。 |
| ステータスインジケータ | Zustand `useTabStore` | `/api/status` メッセージで駆動されるタブバッジ、サイドバードット、通知数。 |
| マルチデバイス同期 | `useSyncClient` | `/api/sync` 経由で他のデバイスで行われたワークスペース / レイアウト編集を監視。 |

タブのタイトルとフォアグラウンドプロセスは xterm.js の `onTitleChange` イベントから来ます — tmux は (`src/config/tmux.conf` で) `#{pane_current_command}|#{pane_current_path}` を 2 秒ごとに発するよう設定され、`lib/tab-title.ts` がそれをパースします。

## Node.js サーバ

`server.ts` は Next.js と、同じポート上の 4 つの `ws` `WebSocketServer` インスタンスをホストするカスタム HTTP サーバです。

### WebSocket エンドポイント

| パス | ハンドラ | 方向 | 用途 |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | 双方向、バイナリ | tmux セッションにアタッチした `node-pty` 経由のターミナル I/O |
| `/api/timeline` | `timeline-server.ts` | サーバ → クライアント | JSONL からパースした Claude セッションエントリをストリーム |
| `/api/status` | `status-server.ts` | 双方向、JSON | サーバから `status:sync` / `status:update` / `status:hook-event`、クライアントから `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` |
| `/api/sync` | `sync-server.ts` | 双方向、JSON | クロスデバイスのワークスペース状態 |

加えて初回インストーラ用の `/api/install` (認証不要)。

### ターミナルバイナリプロトコル

`/api/terminal` は `src/lib/terminal-protocol.ts` で定義された小さなバイナリプロトコルを使います:

| コード | 名前 | 方向 | ペイロード |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | クライアント → サーバ | キーバイト |
| `0x01` | `MSG_STDOUT` | サーバ → クライアント | ターミナル出力 |
| `0x02` | `MSG_RESIZE` | クライアント → サーバ | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | 双方向 | 30 秒間隔、90 秒タイムアウト |
| `0x04` | `MSG_KILL_SESSION` | クライアント → サーバ | 内部の tmux セッションを終了 |
| `0x05` | `MSG_WEB_STDIN` | クライアント → サーバ | Web 入力バーのテキスト (copy-mode 終了後に配信) |

バックプレッシャー: WS の `bufferedAmount > 1 MB` で `pty.pause`、`256 KB` を下回ったら resume。サーバごとに最大 32 同時接続、それを超えたら最古のものを drop。

### ステータスマネージャ

`src/lib/status-manager.ts` は `cliState` の単一の信頼できるソースです。フックイベントは `/api/status/hook` (トークン認証 POST) を経由し、(タブごとに `eventSeq` で) シーケンス化され、`deriveStateFromEvent` によって `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` に reduce されます。JSONL ウォッチャーは合成 `interrupt` イベントを除いてメタデータのみを更新します。

完全な状態マシンは [Session status (STATUS.md)](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) を参照してください。

## tmux 層

purplemux は専用ソケット — `-L purple` — で隔離された tmux を、自前の設定 `src/config/tmux.conf` で実行します。あなたの `~/.tmux.conf` は決して読まれません。

セッション名は `pt-{workspaceId}-{paneId}-{tabId}`。ブラウザの 1 ターミナルペインが 1 つの tmux セッションに対応し、`node-pty` 経由でアタッチされます。

```
tmux ソケット: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← ブラウザタブ 1
├── pt-ws-MMKl07-pa-1-tb-2   ← ブラウザタブ 2
└── pt-ws-MMKl07-pa-2-tb-1   ← 分割ペイン、タブ 1
```

`prefix` は無効、ステータスバーはオフ (xterm.js がクロームを描画)、`set-titles` はオン、`mouse on` でホイールが copy-mode に入ります。tmux こそが、ブラウザを閉じても、Wi-Fi が切れても、サーバが再起動してもセッションが生き残る理由です。

完全な tmux セットアップ、コマンドラッパー、プロセス検出の詳細は [tmux & process detection (TMUX.md)](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) を参照してください。

## Claude CLI 統合

purplemux は Claude を fork したりラップしたりしません — `claude` バイナリはあなたがインストールしているものそのままです。2 つだけ追加されます:

1. **フック設定** — 起動時に `ensureHookSettings()` が `~/.purplemux/hooks.json`、`status-hook.sh`、`statusline.sh` を書き込みます。すべての Claude タブは `--settings ~/.purplemux/hooks.json` 付きで起動するので、`SessionStart`、`UserPromptSubmit`、`Notification`、`Stop`、`PreCompact`、`PostCompact` がすべてサーバに POST し返されます。
2. **JSONL 読み込み** — `~/.claude/projects/**/*.jsonl` は `timeline-server.ts` がライブ会話ビュー用にパースし、`session-detection.ts` が `~/.claude/sessions/` の PID ファイル経由で動作中の Claude プロセスを検出するために監視します。

フックスクリプトは `~/.purplemux/port` と `~/.purplemux/cli-token` を読み、`x-pmux-token` 付きで POST します。サーバが落ちていれば静かに失敗するので、Claude が動いている最中に purplemux を閉じても何もクラッシュしません。

## 起動シーケンス

`server.ts:start()` は以下の順に進みます:

1. `acquireLock(port)` — `~/.purplemux/pmux.lock` 経由の単一インスタンスガード
2. `initConfigStore()` + `initShellPath()` (ユーザのログインシェル `PATH` を解決)
3. `initAuthCredentials()` — scrypt ハッシュ化されたパスワードと HMAC シークレットを env にロード
4. `scanSessions()` + `applyConfig()` — 死んだ tmux セッションをクリーンアップ、`tmux.conf` を適用
5. `initWorkspaceStore()` — `workspaces.json` とワークスペースごとの `layout.json` をロード
6. `autoResumeOnStartup()` — 保存されたディレクトリでシェルを再起動、Claude resume を試みる
7. `getStatusManager().init()` — メタデータポーリングを開始
8. `app.prepare()` (Next.js dev) または `require('.next/standalone/server.js')` (prod)
9. `listenWithFallback()` を `bindPlan.host:port` で実行 (アクセスポリシーに基づいて `0.0.0.0` または `127.0.0.1`)
10. `ensureHookSettings(result.port)` — 実際のポートでフックスクリプトを書き込み / リフレッシュ
11. `getCliToken()` — `~/.purplemux/cli-token` を読み込みまたは生成
12. `writeAllClaudePromptFiles()` — 各ワークスペースの `claude-prompt.md` をリフレッシュ

ポート解決と手順 10 の間のウィンドウが、起動のたびにフックスクリプトが再生成される理由です: 実際のポートを焼き込む必要があるからです。

## カスタムサーバ vs Next.js のモジュールグラフ

{% call callout('warning', '1 プロセス内に 2 つのモジュールグラフ') %}
外側のカスタムサーバ (`server.ts`) と Next.js (pages + API routes) は Node プロセスを共有しますが、モジュールグラフは**共有しません**。両側からインポートされる `src/lib/*` 配下のものは 2 度インスタンス化されます。共有が必要なシングルトン (StatusManager、WebSocket クライアントセット、CLI トークン、ファイル書き込みロック) は `globalThis.__pt*` キーにぶら下げます。完全な根拠は `CLAUDE.md §18` を参照。
{% endcall %}

## さらに読むには

- [`docs/TMUX.md`](https://github.com/subicura/purplemux/blob/main/docs/TMUX.md) — tmux 設定、コマンドラッパー、プロセスツリー走査、ターミナルバイナリプロトコル。
- [`docs/STATUS.md`](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) — Claude CLI の状態マシン、フックフロー、合成 interrupt イベント、JSONL ウォッチャー。
- [`docs/DATA-DIR.md`](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) — purplemux が書き込むすべてのファイル。

## 次のステップ

- **[データディレクトリ](/purplemux/ja/docs/data-directory/)** — 上記のアーキテクチャが触れるすべてのファイル。
- **[CLI リファレンス](/purplemux/ja/docs/cli-reference/)** — ブラウザ外からサーバと話す方法。
- **[トラブルシューティング](/purplemux/ja/docs/troubleshooting/)** — ここで何かが期待通りに動かないときの診断。
