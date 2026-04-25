---
title: ブラウザサポート
description: デスクトップとモバイルの互換性マトリクス、ブラウザ固有のクセに関するメモ。
eyebrow: はじめに
permalink: /ja/docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux は Web アプリなので、体験は使用するブラウザに依存します。以下は私たちがアクティブにテストしているバージョンです — 古いブラウザでも動くかもしれませんが、サポート対象外です。

## デスクトップ

| ブラウザ | 最小バージョン | 備考 |
|---|---|---|
| Chrome | 110+ | 推奨。PWA + Web Push をフル対応。 |
| Edge | 110+ | Chrome と同じエンジン、同じサポート。 |
| Safari | 17+ | macOS Sonoma 以降で PWA フル対応。Web Push には macOS 13+ とインストール済み PWA が必要。 |
| Firefox | 115+ ESR | 問題なく動作。PWA インストールは手動 (インストールプロンプトなし)。 |

すべての機能 — xterm.js ターミナル、ライブタイムライン、Claude セッションビュー、Git diff パネル — はこれらのエンジン間で同じように動作します。

## モバイル

| ブラウザ | 最小バージョン | 備考 |
|---|---|---|
| iOS Safari | **16.4+** | Web Push に必須。先に **ホーム画面に追加** が必要。通常のタブからは Push が発火しません。 |
| Android Chrome | 110+ | 通常のタブでも Web Push は動作しますが、フルスクリーンレイアウトのため PWA インストールを推奨。 |
| Samsung Internet | 22+ | 動作します。インストールプロンプトが自動表示されます。 |

{% call callout('warning', 'iOS Safari ≥ 16.4 が分岐点') %}
Apple は iOS の Web Push を Safari 16.4 (2023 年 3 月) でようやく追加しました。それ以前の iOS バージョンでもダッシュボードは使えますが、PWA をインストールしてもプッシュ通知は受け取れません。
{% endcall %}

## 機能要件

purplemux はいくつかのモダンなブラウザ API に依存しています。これらが欠けている場合、アプリは優雅にフォールバックしますが、対応する機能を失います。

| API | 用途 | フォールバック |
|---|---|---|
| WebSocket | ターミナル I/O、ステータス同期、タイムライン | 必須 — フォールバックなし。 |
| Clipboard API | `npx purplemux` のコピー、コードブロックのコピー | 利用不可ならボタンを非表示。 |
| Notifications API | デスクトップ / モバイルプッシュ | スキップ — アプリ内ステータスは引き続き表示。 |
| Service Workers | PWA + Web Push | 通常の Web アプリとして提供。 |
| IntersectionObserver | ライブセッションタイムライン、ナビゲーション表示 | アニメーションなしで描画。 |
| `backdrop-filter` | 半透明ナビ、モーダル | 単色の色付き背景にフォールバック。 |
| CSS `color-mix()` + OKLCH | テーマ変数 | Safari < 16.4 では一部の色味状態が失われます。 |

## このブラウザは大丈夫?

purplemux には組み込みのセルフチェックが **設定 → ブラウザチェック** にあります。上記と同じテストを実行し、機能ごとに緑 / オレンジ / 赤のバッジを表示するので、仕様書を読まなくても確認できます。

## 既知のクセ

- **Safari 17 + プライベートウィンドウ** — IndexedDB が無効化されるため、再起動をまたいでワークスペースキャッシュが残りません。通常のウィンドウを使ってください。
- **iOS Safari + バックグラウンドタブ** — バックグラウンドに 30 秒ほどあるとターミナルが自動的に切断されます。tmux は実際のセッションを維持しているので、戻ってきたら UI が再接続します。
- **Firefox + Tailscale Serve 証明書** — `ts.net` ではないカスタム tailnet 名を使う場合、Firefox は Chrome より HTTPS の信頼判定が厳しくなります。一度証明書を承認すれば残ります。
- **自己署名証明書** — Web Push は登録自体を拒否します。Tailscale Serve (自動 Let's Encrypt) または本物のドメイン + リバースプロキシを使ってください。

## 非サポート

- **Internet Explorer** — 永久に非サポート。
- **UC Browser、Opera Mini、Puffin** — プロキシ型ブラウザは WebSocket を壊します。動きません。
- **3 年以上前のブラウザ** — CSS で OKLCH カラーとコンテナクエリを使っており、2023 年代のエンジンが必要です。

特殊な構成で何かが動かない場合は、ユーザーエージェントとセルフチェックの出力を添えて [Issue を立てて](https://github.com/subicura/purplemux/issues) ください。
