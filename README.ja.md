# purplemux

**Claude Code、複数のタスクを同時に。もっと速く。**

1 つの画面ですべてのセッションを、スマホでも途切れることなく。

<a href="README.md">English</a> | 日本語 | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.ru.md">Русский</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.tr.md">Türkçe</a>

![purplemux](docs/images/screenshot.png)

## インストール

```bash
npx purplemux
```

ブラウザで [http://localhost:8022](http://localhost:8022) を開いてください。以上。

> Node.js 18+ と tmux が必要です。macOS または Linux。

## purplemux を選ぶ理由

- **マルチセッションダッシュボード** — すべての Claude Code セッションの「作業中 / 入力待ち」ステータスを一目で把握
- **レート制限モニタリング** — 5 時間 / 7 日の残量とリセットまでのカウントダウンを表示
- **プッシュ通知** — タスク完了や入力要求をデスクトップ / モバイルへ通知
- **モバイル & マルチデバイス** — スマホ、タブレット、別のデスクトップからも同じセッションへ
- **ライブセッションビュー** — CLI 出力をスクロールする必要なし。進捗をタイムラインで整理して表示

さらに

- **途切れないセッション** — tmux ベース。ブラウザを閉じてもセッションと作業環境はそのまま。再接続すればタブ、ペイン、ディレクトリまで最後の状態のまま
- **セルフホスト & オープンソース** — コードとセッションデータは自分のマシンにのみ存在。外部サーバーを経由しない
- **暗号化されたリモートアクセス** — Tailscale でどこからでも HTTPS アクセス

## 公式 Remote Control との違い

> 公式 Remote Control は単一セッションのリモート操作に特化しています。マルチセッション管理、プッシュ通知、セッション永続化が必要なときは purplemux を使ってください。

## 特徴

### ターミナル

- **ペイン分割** — 水平 / 垂直に自由分割、ドラッグでリサイズ
- **タブ管理** — 複数タブ、ドラッグで並べ替え、プロセス名ベースの自動タイトル
- **キーボードショートカット** — 分割、タブ切り替え、フォーカス移動
- **ターミナルテーマ** — ダーク / ライトモード、多彩なカラーテーマ
- **ワークスペース** — ペインレイアウト、タブ、作業ディレクトリをワークスペース単位で保存 / 復元
- **Git Diff ビューア** — ターミナルペイン内で git diff を確認。Side-by-side / Line-by-line 切り替え、シンタックスハイライト対応
- **Web ブラウザペイン** — ターミナルの隣に組み込みブラウザで開発結果を確認 (Electron)

### Claude Code 連携

- **リアルタイムステータス** — 作業中 / 入力待ちインジケーター、セッション間の切り替え
- **ライブセッションビュー** — メッセージ、ツール呼び出し、タスク、権限リクエスト、thinking ブロック
- **ワンクリック Resume** — 中断したセッションをブラウザからそのまま再開
- **自動 Resume** — サーバー起動時に以前の Claude セッションを自動復元
- **クイックプロンプト** — よく使うプロンプトを登録してワンクリック送信
- **メッセージ履歴** — 過去のメッセージを再利用
- **使用量分析** — トークン (input / output / cache read / cache write)、コスト、プロジェクト別分析、日次 AI レポート
- **レート制限** — 5 時間 / 7 日の残量、リセットまでのカウントダウン

### モバイル & アクセシビリティ

- **レスポンシブ UI** — スマホ / タブレットでもターミナルとタイムラインを利用可能
- **PWA** — ホーム画面に追加してネイティブアプリのように
- **Web Push** — タブを閉じても通知を受信
- **マルチデバイス同期** — ワークスペースの変更をリアルタイムで反映
- **Tailscale** — WireGuard 暗号化トンネル経由で外部から HTTPS アクセス
- **パスワード認証** — scrypt ハッシュ、外部公開時でも安全
- **多言語対応** — 한국어、English、日本語、中文 など 11 言語

### AI エージェント (Beta)

独立した AI エージェントを作成し、役割と性格 (soul) を与え、マルチタブでタスクを並列実行します。エージェントごとにチャット、メモリ、ワークスペースを保有します。

## 対応プラットフォーム

| プラットフォーム | ステータス | 備考 |
|---|---|---|
| macOS (Apple Silicon / Intel) | ✅ | Electron アプリ同梱 |
| Linux | ✅ | Electron 非対応 |
| Windows | ❌ | 未サポート |

## インストール詳細

### 必須要件

- macOS 13+ または Linux
- [Node.js](https://nodejs.org/) 18+
- [tmux](https://github.com/tmux/tmux)

### npx (最速)

```bash
npx purplemux
```

### グローバルインストール

```bash
npm install -g purplemux
purplemux
```

### ソースから実行

```bash
git clone https://github.com/subicura/purplemux.git
cd purplemux
pnpm install
pnpm start
```

開発モード:

```bash
pnpm dev
```

#### ログレベル設定

全体のレベルは `LOG_LEVEL` (既定 `info`) で調整します。

```bash
LOG_LEVEL=debug pnpm dev
```

特定モジュールだけ切り替えたい場合は `LOG_LEVELS` に `モジュール=レベル` ペアをカンマ区切りで指定します。使用可能なレベル: `trace` / `debug` / `info` / `warn` / `error` / `fatal`。

```bash
# Claude Code フックの動作だけ debug で追跡
LOG_LEVELS=hooks=debug pnpm dev

# 複数モジュールを同時指定
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

`LOG_LEVELS` に含まれないモジュールは `LOG_LEVEL` の値が適用されます。

## 外部アクセス (Tailscale Serve)

```bash
tailscale serve --bg 8022
```

`https://<machine>.<tailnet>.ts.net` でアクセスできます。解除:

```bash
tailscale serve --bg off 8022
```

## セキュリティ

### パスワード

初回アクセス時にパスワードを設定します。scrypt でハッシュ化され `~/.purplemux/config.json` に保存されます。

初期化するには `~/.purplemux/config.json` を削除して再起動すると、オンボーディング画面が再表示されます。

### HTTPS

デフォルトは HTTP です。外部公開する場合は必ず HTTPS を適用してください:

- **Tailscale Serve** — WireGuard 暗号化 + 証明書自動適用
- **Nginx / Caddy** — WebSocket アップグレードヘッダー (`Upgrade`, `Connection`) の転送が必須

### データディレクトリ (`~/.purplemux/`)

| ファイル | 説明 |
|---|---|
| `config.json` | 認証情報 (ハッシュ)、アプリ設定 |
| `workspaces.json` | ワークスペースレイアウト、タブ、ディレクトリ |
| `vapid-keys.json` | Web Push VAPID キー (自動生成) |
| `push-subscriptions.json` | プッシュ購読情報 |
| `hooks/` | ユーザー定義フック |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐   │
│  │  xterm.js │ │ Timeline  │ │ Status   │ │ Multi-device│   │
│  │  Terminal │ │           │ │          │ │ Sync        │   │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘   │
└────────┼─────────────┼────────────┼──────────────┼──────────┘
         │ws           │ws          │ws            │ws
         │/terminal    │/timeline   │/status       │/sync
         ▼             ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Server (:8022)                                     │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────────────┐   │
│  │ node-pty │  │ JSONL Watcher │  │ Status Manager      │   │
│  │ PTY↔WS   │  │ File watch →  │  │ Process tree +      │   │
│  │ Binary   │  │ Parse → Send  │  │ JSONL tail analysis │   │
│  └────┬─────┘  └───────┬───────┘  └──────────┬──────────┘   │
└───────┼────────────────┼─────────────────────┼──────────────┘
        ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  System                                                     │
│  tmux (purple socket)         Claude Code                   │
│  ┌────────┐ ┌────────┐       ┌────────────────────────────┐ │
│  │Session1│ │Session2│  ...  │ ~/.claude/sessions/        │ │
│  │ (shell)│ │ (shell)│       │ ~/.claude/projects/        │ │
│  └────────┘ └────────┘       │   └─ {project}/{sid}.jsonl │ │
│                              └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**ターミナル I/O** — xterm.js は WebSocket 経由で node-pty に接続し、node-pty は tmux セッションにアタッチされます。バイナリプロトコルで stdin / stdout / resize を処理し、バックプレッシャーを制御します。

**ステータス検出** — Claude Code イベントフック (`SessionStart`, `Stop`, `Notification`) が HTTP POST で即時更新を配信します。5〜15 秒ごとにプロセスツリーを確認し、JSONL ファイル末尾 8KB を解析します。

**タイムライン** — `~/.claude/projects/` 配下の JSONL セッションログを監視し、変更時に新しい行をパースして構造化エントリをブラウザへストリーミングします。

**tmux 分離** — 専用の `purple` ソケットを使用し、既存の tmux と完全に分離されています。prefix キーなし、ステータスバーなし。

**自動復旧** — サーバー起動時に `claude --resume {sessionId}` で以前の Claude セッションを復元します。

## License

[MIT](LICENSE)
