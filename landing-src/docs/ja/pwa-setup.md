---
title: PWA セットアップ
description: フルスクリーンでアプリのような体験を得るために、iOS Safari と Android Chrome で purplemux をホーム画面に追加する。
eyebrow: モバイル & リモート
permalink: /ja/docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux を Progressive Web App としてインストールすると、ブラウザタブがホーム画面の独立したアイコンになり、フルスクリーンレイアウトと適切なスプラッシュ画面が手に入ります。iOS では Web Push の前提条件にもなります。

## 得られるもの

- **フルスクリーンレイアウト** — ブラウザクロームなし。ターミナルとタイムラインのための縦方向スペースが増えます。
- **アプリアイコン** — purplemux はネイティブアプリのようにホーム画面から起動します。
- **スプラッシュ画面** — purplemux は iPhone 用にデバイスごとのスプラッシュ画像を同梱しているので、起動の遷移がネイティブのように感じられます。
- **Web Push** (iOS のみ) — プッシュ通知は PWA インストール後にのみ発火します。

マニフェストは `/api/manifest` で配信され、purplemux のマークとテーマカラー付きで `display: standalone` を登録します。

## インストール前に

PWA が機能するには、ページが **HTTPS** で到達可能である必要があります。`localhost` の場合 Chrome では動作します (ループバック例外) が、iOS Safari は素の HTTP ではインストールを拒否します。きれいな経路は Tailscale Serve です — [Tailscale アクセス](/purplemux/ja/docs/tailscale/) を参照してください。

{% call callout('warning', 'iOS は Safari 16.4 以降が必要') %}
それ以前の iOS リリースでは PWA をインストールできても Web Push が届きません。プッシュが重要なら、まず iOS をアップデートしてください。ブラウザごとの詳細は [ブラウザサポート](/purplemux/ja/docs/browser-support/) にあります。
{% endcall %}

## iOS Safari

1. **Safari** で purplemux の URL を開く (他の iOS ブラウザは PWA 用の「ホーム画面に追加」を出しません)。
2. 下部のツールバーの **共有** アイコンをタップ。
3. アクションシートをスクロールして **ホーム画面に追加** を選ぶ。
4. お好みで名前を編集し、右上の **追加** をタップ。
5. 新しいホーム画面アイコンから purplemux を起動 — フルスクリーンで開きます。

このアイコンからの初回起動が、iOS が真に PWA として扱う瞬間です。プッシュ許可のプロンプトはスタンドアロンウィンドウから出るべきで、通常の Safari タブからではありません。

## Android Chrome

Chrome はインストール可能なマニフェストを自動検出してバナーを提示します。表示されない場合:

1. **Chrome** で purplemux の URL を開く。
2. 右上の **⋮** メニューをタップ。
3. **アプリをインストール** (場合により **ホーム画面に追加**) を選ぶ。
4. 確認すると、アイコンがホーム画面とアプリドロワーに表示されます。

Samsung Internet も同様に動作します — インストールプロンプトは通常自動的に出ます。

## インストール確認

ホーム画面のアイコンから purplemux を開いてください。ブラウザのアドレスバーが消えているはずです。まだブラウザ UI が見える場合、マニフェストが適用されていません — 通常はページが素の HTTP または変則的なプロキシ経由でロードされていることが原因です。

**設定 → 通知** でも確認できます — PWA がインストールされ Web Push がサポートされていれば、トグルが有効になります。

## PWA のアップデート

何もする必要はありません。PWA は purplemux インスタンスが配信する同じ `index.html` をロードするので、purplemux をアップグレードすれば、次回起動時にインストール済みアプリもアップグレードされます。

削除するにはアイコンを長押しして OS ネイティブのアンインストール操作を選んでください。

## 次のステップ

- **[Web Push 通知](/purplemux/ja/docs/web-push/)** — PWA がインストールできたので、バックグラウンドアラートを有効化。
- **[Tailscale アクセス](/purplemux/ja/docs/tailscale/)** — iOS が要求する HTTPS URL を取得。
- **[ブラウザサポート](/purplemux/ja/docs/browser-support/)** — 完全な互換性マトリクス。
