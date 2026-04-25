---
title: セキュリティと認証
description: purplemux がダッシュボードを守る方法 — scrypt ハッシュ化されたパスワード、ローカルのみのデータ、外部アクセス用の HTTPS。
eyebrow: モバイル & リモート
permalink: /ja/docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux はセルフホスト型で、あなたのマシンに留まります。外部サーバ、テレメトリ、クラウドアカウントはありません。以下に記すのは、実際にダッシュボードを守る数少ないピースです。

## パスワードのセットアップ

purplemux を初めて開いたとき、オンボーディング画面でパスワードを選ぶよう求められます。送信後:

- パスワードは **scrypt** でハッシュ化されます (16 バイトのランダムソルト、64 バイトの導出鍵)。
- ハッシュは `~/.purplemux/config.json` に `scrypt:{salt}:{hash}` として書き込まれます — 平文は決して保存されません。
- 別途 `authSecret` (ランダムな hex) が生成され、隣に保存されます。purplemux はログイン後に発行するセッションクッキーの署名にこれを使います。

以降の訪問では、ログイン画面が `crypto.timingSafeEqual` で保存ハッシュとパスワードを照合します。

{% call callout('note', 'パスワードの長さ') %}
最小 4 文字と短く設定されているのは、localhost のみのセットアップでうるさくならないためです。purplemux を tailnet — または他のどこか — に公開する場合は、もっと強いものを選んでください。ログイン失敗はプロセスごとに 15 分間で 16 回までにレート制限されます。
{% endcall %}

## パスワードのリセット

忘れた場合? ホストへのシェルアクセスだけあれば十分です:

```bash
rm ~/.purplemux/config.json
```

purplemux を再起動すると (`pnpm start`、`npx purplemux`、起動した方法で何でも)、オンボーディング画面が再表示されて新しいパスワードを選べます。

これは同じファイルに保存されている他の設定 (テーマ、ロケール、フォントサイズ、通知トグルなど) も消去します。ワークスペースとタブは `workspaces.json` と `workspaces/` ディレクトリに保存されているので、レイアウトには影響しません。

## 外部アクセス用の HTTPS

デフォルトのバインドは `localhost`、素の HTTP で配信されます。同じマシン内なら問題ありません — しかし他のデバイスから purplemux に到達した瞬間、HTTPS にすべきです。

- **Tailscale Serve** が推奨経路です: WireGuard 暗号化と自動 Let's Encrypt 証明書。[Tailscale アクセス](/purplemux/ja/docs/tailscale/) を参照。
- **リバースプロキシ** (Nginx、Caddy など) も使えます。WebSocket の `Upgrade` と `Connection` ヘッダを転送する限り。

iOS Safari は加えて PWA インストールと Web Push 登録に HTTPS を要求します。[PWA セットアップ](/purplemux/ja/docs/pwa-setup/) と [Web Push](/purplemux/ja/docs/web-push/) を参照してください。

## `~/.purplemux/` の中身

すべてローカルです。機密ファイルのパーミッションは `0600` です。

| ファイル | 内容 |
|---|---|
| `config.json` | scrypt パスワードハッシュ、セッションシークレット、アプリ設定 |
| `workspaces.json` + `workspaces/` | ワークスペースリストとワークスペース別ペイン / タブレイアウト |
| `vapid-keys.json` | Web Push VAPID 鍵ペア (自動生成) |
| `push-subscriptions.json` | デバイス別プッシュサブスクリプション |
| `cli-token` | フック / CLI がローカルサーバと通信するための共有トークン |
| `pmux.lock` | 単一インスタンスロック (`pid`、`port`、`startedAt`) |
| `logs/` | ローテーションされる pino ログファイル |

完全な目録とリセット表は、[docs/DATA-DIR.md](https://github.com/subicura/purplemux/blob/main/docs/DATA-DIR.md) のソース・オブ・トゥルースを参照してください。

## テレメトリなし

purplemux 自体は外向きリクエストを発しません。発する唯一のネットワーク呼び出しは:

- あなたがサブスクライブした Web Push 通知 — OS のプッシュサービス経由で送信。
- Claude CLI 自体が行うもの — それはあなたと Anthropic の間のことであり、purplemux ではありません。

コードもセッションデータもマシンを離れません。

## 次のステップ

- **[Tailscale アクセス](/purplemux/ja/docs/tailscale/)** — 外部 HTTPS への安全な経路。
- **[PWA セットアップ](/purplemux/ja/docs/pwa-setup/)** — 認証が片付いたらホーム画面にインストール。
- **[Web Push 通知](/purplemux/ja/docs/web-push/)** — バックグラウンドアラート。
