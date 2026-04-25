---
title: Tailscale アクセス
description: Tailscale Serve 経由で HTTPS でスマートフォンから purplemux に到達 — ポートフォワーディング不要、証明書のやりくり不要。
eyebrow: モバイル & リモート
permalink: /ja/docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

デフォルトでは purplemux はローカルでのみ待ち受けます。Tailscale Serve は他のデバイスに公開する一番きれいな方法です: WireGuard 暗号化、自動 Let's Encrypt 証明書、ファイアウォール変更ゼロ。

## なぜ Tailscale か

- **WireGuard** — すべての接続がデバイス間で暗号化されます。
- **自動 HTTPS** — Tailscale が `*.<tailnet>.ts.net` の本物の証明書をプロビジョニングします。
- **ポートフォワーディング不要** — マシンが公開インターネットにポートを開くことはありません。
- **iOS は HTTPS が必須** — PWA インストールも Web Push も HTTPS なしでは動きません。[PWA セットアップ](/purplemux/ja/docs/pwa-setup/) と [Web Push](/purplemux/ja/docs/web-push/) を参照。

## 前提条件

- Tailscale アカウント、purplemux を実行するマシンに `tailscale` デーモンがインストール済みでサインイン済み。
- tailnet で HTTPS が有効化されている (Admin console → DNS → HTTPS Certificates を有効化、まだなら)。
- purplemux がデフォルトポート `8022` で実行中 (または `PORT` で設定したポート)。

## 実行

1 行:

```bash
tailscale serve --bg 8022
```

Tailscale はローカルの `http://localhost:8022` を HTTPS でラップし、tailnet 内に以下で公開します:

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` はマシンのホスト名、`<tailnet>` は tailnet の MagicDNS サフィックスです。同じ tailnet にサインインしている他のデバイスでその URL を開けば接続できます。

提供を停止するには:

```bash
tailscale serve --bg off 8022
```

## 動いたら何ができるか

- スマートフォンで URL を開き、**共有 → ホーム画面に追加** で [PWA セットアップ](/purplemux/ja/docs/pwa-setup/) に従う。
- スタンドアロンの PWA からプッシュをオン: [Web Push](/purplemux/ja/docs/web-push/)。
- タブレット、ノート PC、別のデスクトップから同じダッシュボードに到達 — ワークスペース状態はリアルタイム同期されます。

{% call callout('tip', 'Funnel と Serve') %}
`tailscale serve` は purplemux を tailnet 内に留めます — ほぼ常にこちらが望むものです。`tailscale funnel` は公開インターネットに公開しますが、個人用マルチプレクサにはやり過ぎ (かつリスキー) です。
{% endcall %}

## リバースプロキシのフォールバック

Tailscale が選択肢にない場合、本物の TLS 証明書を持つ任意のリバースプロキシで構いません。1 つだけ正しく設定する必要があるのは **WebSocket アップグレード** です — purplemux はターミナル I/O、ステータス同期、ライブタイムラインに使っています。

Nginx (スケッチ):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy はもっと簡単です — `reverse_proxy 127.0.0.1:8022` がアップグレードヘッダを自動で扱います。

`Upgrade` / `Connection` の転送なしではダッシュボードは描画されますが、ターミナルが接続せず、ステータスが固まります。何かが半分壊れているように見えたら、まずこれらのヘッダを疑ってください。

## トラブルシューティング

- **HTTPS がまだプロビジョニングされていない** — 最初の証明書は 1 分ほどかかることがあります。少し待ってから `tailscale serve --bg 8022` を再実行すると通常落ち着きます。
- **ブラウザが証明書を警告** — `<machine>.<tailnet>.ts.net` の URL に正確に当たっていることを確認してください。LAN IP ではなく。
- **モバイルが「到達不能」と言う** — スマートフォンが同じ tailnet にサインインしていて、OS 設定で Tailscale がアクティブであることを確認してください。
- **自己署名証明書** — Web Push は登録を拒否します。Tailscale Serve または ACME 発行の本物の証明書を使ってください。

## 次のステップ

- **[PWA セットアップ](/purplemux/ja/docs/pwa-setup/)** — HTTPS が手に入ったので、ホーム画面にインストール。
- **[Web Push 通知](/purplemux/ja/docs/web-push/)** — バックグラウンドアラートを有効化。
- **[セキュリティと認証](/purplemux/ja/docs/security-auth/)** — パスワード、ハッシュ、tailnet 公開の意味するもの。
