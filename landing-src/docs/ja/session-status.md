---
title: セッションステータス
description: purplemux が Claude Code の活動を 4 状態のバッジに変換する仕組みと、ほぼ瞬時に更新される理由。
eyebrow: Claude Code
permalink: /ja/docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

サイドバー上のすべてのセッションには色付きのドットがあり、Claude が何をしているかを一目で教えてくれます。このページでは、4 つの状態がどこから来て、ターミナルに手を伸ばさずに同期され続けるかを説明します。

## 4 つの状態

| 状態 | インジケータ | 意味 |
|---|---|---|
| **アイドル** | なし / グレー | Claude は次のプロンプトを待っています。 |
| **ビジー** | パープルのスピナー | Claude が処理中 — 読込、編集、ツール実行。 |
| **入力待ち** | アンバーのパルス | 権限プロンプトまたは質問があなたを待っています。 |
| **レビュー** | パープルのパルス | Claude が完了し、確認すべきものがあります。 |

5 つ目の値 **unknown** は、サーバ再起動時に `busy` だったタブに一時的に表示されます。purplemux がセッションを再検証できると自動的に解消されます。

## 信頼できるソースはフック

purplemux は Claude Code のフック設定を `~/.purplemux/hooks.json` に、小さなシェルスクリプトを `~/.purplemux/status-hook.sh` にインストールします。このスクリプトは 5 つの Claude Code フックイベントに登録され、それぞれを CLI トークン付きでローカルサーバに POST します:

| Claude Code フック | 結果の状態 |
|---|---|
| `SessionStart` | アイドル |
| `UserPromptSubmit` | ビジー |
| `Notification` (権限のみ) | 入力待ち |
| `Stop` / `StopFailure` | レビュー |
| `PreCompact` / `PostCompact` | コンパクト中インジケータを表示 (状態は不変) |

フックは Claude Code が遷移した瞬間に発火するため、サイドバーはターミナルで気づくよりも先に更新されます。

{% call callout('note', '権限通知のみ') %}
Claude の `Notification` フックはいくつかの理由で発火します。purplemux は通知タイプが `permission_prompt` または `worker_permission_prompt` のときだけ **入力待ち** に切り替えます。アイドル時のリマインダーやその他の通知タイプではバッジは変化しません。
{% endcall %}

## プロセス検出は並行で動作

Claude CLI が実際に動作しているかどうかは、作業状態とは別個に追跡されます。2 つの経路が連携します:

- **tmux のタイトル変更** — 各ペインは `pane_current_command|pane_current_path` をタイトルとして報告します。xterm.js が `onTitleChange` で変更を届け、purplemux は `/api/check-claude` で確認します。
- **プロセスツリー走査** — サーバ側で `detectActiveSession` がペインのシェル PID を見て子プロセスをたどり、Claude が `~/.claude/sessions/` に書き込む PID ファイルと突き合わせます。

ディレクトリが存在しない場合、ステータスドットの代わりに「Claude がインストールされていません」画面が表示されます。

## JSONL ウォッチャーが穴を埋める

Claude Code は各セッションのトランスクリプト JSONL を `~/.claude/projects/` の下に書き込みます。タブが `busy`、`needs-input`、`unknown`、`ready-for-review` の間、purplemux は 2 つの理由でこのファイルを `fs.watch` で監視します:

- **メタデータ** — 現在のツール、最新のアシスタントスニペット、トークンカウント。これらは状態を変えずにタイムラインとサイドバーに流れます。
- **合成 interrupt** — ストリーム途中で Esc を押すと、Claude は `[Request interrupted by user]` を JSONL に書き込みますがフックは発火しません。ウォッチャーがその行を検出して合成 `interrupt` イベントを生成し、タブが busy のまま固まらずに idle に戻ります。

## ポーリングはエンジンではなく安全網

メタデータのポーリングはタブ数に応じて 30〜60 秒ごとに実行されます。状態を決めるわけでは**ありません** — それは厳密にフック経路です。ポーリングは以下のために存在します:

- 新しい tmux ペインを発見する
- Claude プロセスが死んでいる状態で busy が 10 分以上続いているセッションを復旧する
- プロセス情報、ポート、タイトルをリフレッシュする

これがランディングページで触れている「5〜15 秒のフォールバックポーリング」です。フックの信頼性が証明されてから速度を落とし、対象を絞っています。

## サーバ再起動を生き延びる

purplemux がダウンしている間はフックが発火できないため、進行中の状態は古くなる可能性があります。復旧ルールは保守的です:

- 永続化された `busy` は `unknown` になり、再チェックされます: Claude がもう動作していなければタブは静かに idle に戻り、JSONL がきれいに終わっていれば review になります。
- それ以外のすべての状態 — `idle`、`needs-input`、`ready-for-review` — はあなたの対応待ちなので、そのまま残ります。

復旧中の自動状態遷移ではプッシュ通知は飛びません。*新しい* 作業が needs-input または review に入ったときだけ通知されます。

## 状態が表示される場所

- サイドバーセッション行のドット
- 各ペインのタブバーのドット
- ワークスペースのドット (ワークスペース全体で最も優先度の高い状態)
- ベルアイコンのカウントと通知シート
- ブラウザのタブタイトル (注意項目数)
- `needs-input` と `ready-for-review` の Web Push とデスクトップ通知

## 次のステップ

- **[権限プロンプト](/purplemux/ja/docs/permission-prompts/)** — **入力待ち** 状態の背後のワークフロー。
- **[ライブセッションビュー](/purplemux/ja/docs/live-session-view/)** — `busy` になったタブのタイムラインに何が表示されるか。
- **[最初のセッション](/purplemux/ja/docs/first-session/)** — ダッシュボードツアーの文脈の中で。
