---
title: Web ブラウザパネル
description: 開発の出力をテストするための組み込みブラウザタブ。purplemux CLI から操作でき、モバイルビューポート用のデバイスエミュレータも搭載。
eyebrow: ワークスペース & ターミナル
permalink: /ja/docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

ターミナルと Claude セッションの隣に Web ブラウザタブを置いてみてください。ローカルの開発サーバ、ステージングサイト、到達可能なものは何でも実行できます — そしてシェルを離れることなく `purplemux` CLI で操作できます。

## ブラウザタブを開く

新しいタブを追加してパネルタイプに **Web ブラウザ** を選びます。アドレスバーに URL を入力してください — `localhost:3000`、IP、フル HTTPS の URL いずれも可。アドレスバーは入力を正規化します: ホスト名や IP は `http://` に、それ以外は `https://` に向けます。

このパネルは purplemux が macOS ネイティブアプリ (Electron ビルド) のときには本物の Chromium webview として動作し、通常のブラウザからアクセスした場合は iframe にフォールバックします。iframe パスはほとんどのページをカバーしますが、`X-Frame-Options: deny` を送るサイトは動きません。Electron パスにはその制限はありません。

{% call callout('note', 'ネイティブアプリでこそ真価を発揮') %}
デバイスエミュレーション、CLI スクリーンショット、コンソール / ネットワークキャプチャは Electron ビルドでのみ動作します。ブラウザタブのフォールバックではアドレスバー、戻る / 進む、リロードは使えますが、より深い統合には webview が必要です。
{% endcall %}

## CLI でナビゲーション

このパネルは小さな HTTP API を公開しており、それを同梱の `purplemux` CLI がラップしています。任意のターミナル — ブラウザパネルの隣に座っているターミナルも含め — から:

```bash
# タブ一覧から web-browser タブの ID を見つける
purplemux tab list -w <workspace-id>

# 現在の URL とタイトルを取得
purplemux tab browser url -w <ws> <tabId>

# スクリーンショットをファイルに保存 (--full でフルページ)
purplemux tab browser screenshot -w <ws> <tabId> -o shot.png --full

# 直近のコンソールログを tail (500 件のリングバッファ)
purplemux tab browser console -w <ws> <tabId> --since 60000 --level error

# ネットワーク活動を確認、必要なら個別レスポンスボディも取得
purplemux tab browser network -w <ws> <tabId> --method POST --status 500
purplemux tab browser network -w <ws> <tabId> --request <id>

# タブ内で JavaScript を評価し、シリアライズされた結果を取得
purplemux tab browser eval -w <ws> <tabId> "document.title"
```

CLI は `~/.purplemux/cli-token` のトークンで認証し、ポートは `~/.purplemux/port` から読み込みます。同じマシンで実行する場合フラグは不要です。完全なコマンドは `purplemux help` を、その背後の HTTP エンドポイントは `purplemux api-guide` を参照してください。

これがパネルを Claude にとって有用にしている理由です: Claude にスクリーンショット撮影を頼む、コンソールでエラーを確認させる、プローブスクリプトを実行させる — Claude はあなたと同じ CLI を使えるからです。

## デバイスエミュレータ

モバイルワーク用に、パネルをモバイルモードに切り替えられます。デバイスピッカーには iPhone SE から 14 Pro Max まで、Pixel 7、Galaxy S20 Ultra、iPad Mini、iPad Pro 12.9" のプリセットが用意されています。各プリセットは以下を含みます:

- 幅 / 高さ
- デバイスピクセル比
- 一致するモバイルユーザーエージェント

縦 / 横の切り替え、ズームレベル (`fit` でパネルにフィット、または `50% / 75% / 100% / 125% / 150%` の固定値) を選択できます。デバイスを変えると、新しい UA で webview がリロードされ、サーバ側のモバイル検出も電話と同じ判定になります。

## 次のステップ

- **[タブとペイン](/purplemux/ja/docs/tabs-panes/)** — Claude の隣にブラウザを分割で置く方法。
- **[Git ワークフローパネル](/purplemux/ja/docs/git-workflow/)** — もう 1 つの専用パネルタイプ。
- **[インストール](/purplemux/ja/docs/installation/)** — フル webview 統合がある macOS ネイティブアプリ。
