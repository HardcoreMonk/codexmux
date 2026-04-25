---
title: トラブルシューティング & FAQ
description: よくある問題、簡単な答え、最も頻繁にあがる質問。
eyebrow: リファレンス
permalink: /ja/docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

ここに書かれていることがあなたの状況と一致しない場合、プラットフォーム、ブラウザ、`~/.purplemux/logs/` の関連ログファイルを添えて [Issue を立てて](https://github.com/subicura/purplemux/issues) ください。

## インストール & 起動

### `tmux: command not found`

purplemux はホストに tmux 3.0+ が必要です。インストール:

```bash
# macOS (Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

`tmux -V` で確認してください。tmux 2.9+ は技術的には preflight チェックを通りますが、テスト対象は 3.0+ です。

### `node: command not found` または「Node.js 20 or newer」

Node 20 LTS 以降をインストールしてください。`node -v` で確認。macOS ネイティブアプリは独自の Node を同梱しているので、これは `npx` / `npm install -g` 経路にのみ当てはまります。

### 「purplemux is already running (pid=…, port=…)」

別の purplemux インスタンスが生きていて `/api/health` に応答しています。それを使う (表示された URL を開く) か、先に止めてください:

```bash
# 探す
ps aux | grep purplemux

# またはロックファイル経由で kill
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### 古いロック — 起動しないがプロセスもいない

`~/.purplemux/pmux.lock` が残っています。削除:

```bash
rm ~/.purplemux/pmux.lock
```

一度でも `sudo` で purplemux を実行したなら、ファイルが root 所有かもしれません — 一度 `sudo rm` してください。

### `Port 8022 is in use, finding an available port...`

別のプロセスが `8022` を保持しています。サーバはランダムな空きポートにフォールバックして新しい URL を表示します。自分でポートを選ぶには:

```bash
PORT=9000 purplemux
```

`8022` を保持しているものを探すには `lsof -iTCP:8022 -sTCP:LISTEN -n -P`。

### Windows で動きますか?

**公式にはサポートしていません。** purplemux は `node-pty` と tmux に依存しており、どちらも Windows ネイティブでは動きません。WSL2 はだいたい動きます (実質 Linux なので) が、テスト対象外です。

## セッション & 復元

### ブラウザを閉じたらすべて消えた

そんなはずはありません — tmux はサーバ上ですべてのシェルを開いたままにしています。リフレッシュでタブが戻ってこない場合:

1. サーバがまだ動いているか確認 (`http://localhost:8022/api/health`)。
2. tmux セッションが存在するか確認: `tmux -L purple ls`。
3. `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` で `autoResumeOnStartup` 中のエラーを確認。

tmux が「no server running」と言ったら、ホストが再起動したか何かが tmux を kill しました。セッションは消えていますが、レイアウト (ワークスペース、タブ、作業ディレクトリ) は `~/.purplemux/workspaces/{wsId}/layout.json` に保持され、次回 purplemux 起動時に再起動されます。

### Claude セッションが再開されない

`autoResumeOnStartup` は各タブについて保存された `claude --resume <uuid>` を再実行しますが、対応する `~/.claude/projects/.../sessionId.jsonl` がもう存在しない (削除、アーカイブ、プロジェクト移動) と再開は失敗します。タブを開いて新しい会話を始めてください。

### タブがすべて「unknown」と表示される

`unknown` は、サーバ再起動前に `busy` だったタブで復旧が進行中であることを意味します。`resolveUnknown` がバックグラウンドで動いて `idle` (Claude 終了) または `ready-for-review` (最終アシスタントメッセージ存在) を確認します。タブが 10 分以上 `unknown` で詰まっていると、**busy stuck safety net** が静かに `idle` に切り替えます。完全な状態マシンは [STATUS.md](https://github.com/subicura/purplemux/blob/main/docs/STATUS.md) を参照してください。

## ブラウザ & UI

### Web Push 通知が一向に来ない

このチェックリストを通してください:

1. **iOS Safari ≥ 16.4 のみ。** それ以前の iOS には Web Push がありません。
2. **iOS では PWA でなければならない。** **共有 → ホーム画面に追加** を先に。通常の Safari タブではプッシュは発火しません。
3. **HTTPS が必要。** 自己署名証明書は動きません — Web Push は静かに登録を拒否します。Tailscale Serve (無料 Let's Encrypt) または Nginx / Caddy 背後の本物のドメインを使ってください。
4. **通知許可が与えられている。** purplemux で **設定 → 通知 → オン** *かつ* ブラウザレベルの許可も与えられている必要があります。
5. **サブスクリプションが存在する。** `~/.purplemux/push-subscriptions.json` にデバイスのエントリがあるはずです。空なら再度許可を与えてください。

完全な互換性マトリクスは [ブラウザサポート](/purplemux/ja/docs/browser-support/) を参照。

### iOS Safari 16.4+ なのに通知が来ない

一部の iOS バージョンでは、PWA を長く閉じているとサブスクリプションを失います。PWA を開き、通知許可を一度拒否してから再度与え、`push-subscriptions.json` を再確認してください。

### Safari プライベートウィンドウで何も保持されない

Safari 17+ のプライベートウィンドウでは IndexedDB が無効化されているため、ワークスペースキャッシュが再起動を生き残れません。通常のウィンドウを使ってください。

### モバイルでバックグラウンドにするとターミナルが消える

iOS Safari は約 30 秒のバックグラウンド後に WebSocket を切断します。tmux は実際のセッションを維持しているので、タブに戻ると purplemux が再接続して再描画します。これは iOS の挙動で、私たちのものではありません。

### Firefox + Tailscale serve で証明書警告

tailnet が `*.ts.net` ではないカスタムドメインを使っている場合、Firefox は Chrome よりも HTTPS の信頼判定が厳しくなります。一度証明書を承認すれば残ります。

### 「ブラウザが古すぎる」または機能が欠けている

**設定 → ブラウザチェック** で API ごとのレポートを確認してください。[ブラウザサポート](/purplemux/ja/docs/browser-support/) の最低要件を下回るものは機能を優雅に失いますが、サポート対象外です。

## ネットワーク & リモートアクセス

### purplemux をインターネットに公開できますか?

可能ですが、必ず HTTPS で。推奨:

1. **Tailscale Serve** — `tailscale serve --bg 8022` で WireGuard 暗号化 + 自動証明書。ポートフォワーディング不要。
2. **リバースプロキシ** — Nginx / Caddy / Traefik。`Upgrade` と `Connection` ヘッダを必ず転送してください。さもなければ WebSocket が壊れます。

公開インターネット上の素の HTTP は悪い考えです — 認証クッキーは HMAC 署名されていますが、WebSocket ペイロード (ターミナルバイト!) は暗号化されていません。

### LAN 上の他のデバイスから purplemux に到達できない

デフォルトでは purplemux は localhost のみを許可します。env またはアプリ内設定でアクセスを開放:

```bash
HOST=lan,localhost purplemux       # LAN フレンドリー
HOST=tailscale,localhost purplemux # tailnet フレンドリー
HOST=all purplemux                 # 全部
```

またはアプリ内の **設定 → ネットワークアクセス**。これは `~/.purplemux/config.json` に書き込まれます。(`HOST` が env 経由で設定されている場合、そのフィールドはロックされます。) キーワードと CIDR の構文は [ポート & 環境変数](/purplemux/ja/docs/ports-env-vars/) を参照。

### リバースプロキシで WebSocket の問題

`/api/terminal` が接続して即座に切断する場合、プロキシが `Upgrade` / `Connection` ヘッダを剥がしています。最小 Nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy: WebSocket 転送はデフォルトです。`reverse_proxy 127.0.0.1:8022` だけで OK。

## データ & ストレージ

### データはどこにありますか?

すべて `~/.purplemux/` の下にローカルにあります。マシンを離れるものはありません。ログインパスワードは `config.json` の scrypt ハッシュです。完全なレイアウトは [データディレクトリ](/purplemux/ja/docs/data-directory/) を参照。

### パスワードを忘れた

`~/.purplemux/config.json` を削除して再起動してください。オンボーディングがやり直されます。ワークスペース、レイアウト、履歴は (別ファイルなので) 残ります。

### タブインジケータが「busy」で永遠に固まる

`busy stuck safety net` は、Claude プロセスが死んだ場合 10 分後にタブを静かに `idle` に切り替えます。待ちたくなければタブを閉じて再オープンしてください — ローカル状態がリセットされ、次のフックイベントからクリーンに再開します。原因調査には `LOG_LEVELS=hooks=debug,status=debug` で実行を。

### 既存の tmux 設定と競合しますか?

しません。purplemux は専用ソケット (`-L purple`) で独自設定 (`src/config/tmux.conf`) の隔離された tmux を実行します。あなたの `~/.tmux.conf` や既存の tmux セッションには触れません。

## コスト & 使用量

### purplemux は私のお金を節約してくれますか?

直接的にはしません。代わりに **使用量を透明にします**: 今日 / 月 / プロジェクト別のコスト、モデル別トークン内訳、5h / 7d のレート制限カウントダウンが 1 画面に並ぶので、壁にぶつかる前にペースを取れます。

### purplemux 自体は有料ですか?

いいえ。purplemux は MIT ライセンスのオープンソースです。Claude Code の使用は Anthropic から別途請求されます。

### 私のデータはどこかに送信されますか?

いいえ。purplemux は完全にセルフホストです。発するネットワーク呼び出しは、ローカルの Claude CLI (それ自身が Anthropic と話す) と起動時の `update-notifier` のバージョンチェックだけです。バージョンチェックは `NO_UPDATE_NOTIFIER=1` で無効化できます。

## 次のステップ

- **[ブラウザサポート](/purplemux/ja/docs/browser-support/)** — 詳細な互換性マトリクスと既知のブラウザのクセ。
- **[データディレクトリ](/purplemux/ja/docs/data-directory/)** — 各ファイルが何をするか、何を安全に削除できるか。
- **[アーキテクチャ](/purplemux/ja/docs/architecture/)** — 何かをより深く掘る必要があるとき、各部品がどう組み合わさっているか。
