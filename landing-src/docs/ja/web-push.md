---
title: Web Push 通知
description: ブラウザタブを閉じていても、入力待ちやタスク完了の状態を背後から知らせるプッシュアラート。
eyebrow: モバイル & リモート
permalink: /ja/docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push を使えば、Claude セッションがあなたの注意を必要としているとき — 権限プロンプト、完了したタスク — タブを閉じていても purplemux が知らせてくれます。通知をタップすると、そのセッションに直接着地します。

## 何が通知をトリガーするか

purplemux はサイドバーで色付きバッジとして表示されるのと同じ遷移でプッシュを発火します。

- **入力待ち** — Claude が権限プロンプトに到達したか、質問しています。
- **タスク完了** — Claude が 1 ターンを終えました (**レビュー** 状態)。

アイドルやビジーへの遷移は意図的にプッシュしません。ノイズだからです。

## 有効化する

トグルは **設定 → 通知** にあります。手順:

1. **設定 → 通知** を開いて **オン** にする。
2. ブラウザが通知許可を求めるので承認する。
3. purplemux がサーバの VAPID 鍵に対して Web Push サブスクリプションを登録します。

サブスクリプションは `~/.purplemux/push-subscriptions.json` に保存され、特定のブラウザ / デバイスを識別します。通知を受け取りたいデバイスごとに同じ手順を繰り返してください。

{% call callout('warning', 'iOS は Safari 16.4 + PWA が必要') %}
iPhone と iPad では、purplemux をホーム画面に追加してそのアイコンから起動した後でなければ Web Push は動きません。設定ページはスタンドアロンの PWA ウィンドウから開いてください — 通常の Safari タブでは通知許可プロンプトが no-op になります。先に PWA をセットアップしてください: [PWA セットアップ](/purplemux/ja/docs/pwa-setup/)。
{% endcall %}

## VAPID 鍵

purplemux は初回起動時にアプリケーションサーバ用 VAPID 鍵ペアを生成し、`~/.purplemux/vapid-keys.json` に (モード `0600` で) 保存します。あなたが何かする必要はありません — サブスクライブ時にブラウザに公開鍵が自動配信されます。

すべてのサブスクリプションをリセットしたい場合 (鍵をローテートした後など)、`vapid-keys.json` と `push-subscriptions.json` を削除して purplemux を再起動してください。各デバイスは再サブスクライブが必要になります。

## バックグラウンド配信

サブスクライブされると、スマートフォンは OS のプッシュサービス経由で通知を受け取ります:

- **iOS** — APNs 経由、Safari の Web Push ブリッジ。配信はベストエフォートで、デバイスが過度にスロットリングされていれば結合される場合があります。
- **Android** — FCM 経由、Chrome から。一般に瞬時。

通知は purplemux がフォアグラウンドかどうかに関わらず届きます。あなたの *いずれかの* デバイスでダッシュボードが現在表示されている場合、purplemux は二重通知を避けるためプッシュをスキップします。

## タップで飛び込む

通知をタップすると、それを発火したセッションに直接 purplemux が開きます。PWA がすでに動作していれば該当タブにフォーカスが移り、そうでなければアプリが起動して直接そこへナビゲートします。

## トラブルシューティング

- **トグルがグレーアウト** — Service Workers や Notifications API がサポートされていません。**設定 → ブラウザチェック** または [ブラウザサポート](/purplemux/ja/docs/browser-support/) を確認。
- **許可が拒否された** — ブラウザ設定でサイトの通知許可をクリアし、purplemux で再度トグルしてください。
- **iOS でプッシュが来ない** — ホーム画面アイコンから起動していること、iOS が **16.4 以降** であることを確認してください。
- **自己署名証明書** — Web Push は登録を拒否します。Tailscale Serve または本物の証明書を持つリバースプロキシを使ってください。[Tailscale アクセス](/purplemux/ja/docs/tailscale/) を参照。

## 次のステップ

- **[PWA セットアップ](/purplemux/ja/docs/pwa-setup/)** — iOS プッシュには必須。
- **[Tailscale アクセス](/purplemux/ja/docs/tailscale/)** — 外部配信のための HTTPS。
- **[セキュリティと認証](/purplemux/ja/docs/security-auth/)** — `~/.purplemux/` の中身。
