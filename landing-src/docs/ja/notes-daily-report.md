---
title: ノート (AI 日次レポート)
description: 1 日の Claude Code セッションを LLM がまとめた日次サマリ。ローカルに Markdown で保存。
eyebrow: Claude Code
permalink: /ja/docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

1 日が終わると、purplemux はその日のセッションログを読み、1 行のブリーフとプロジェクト別の Markdown サマリを書いてくれます。サイドバーの **ノート** に置かれ、振り返り、スタンドアップ、1on1 が「昨日何やったっけ?」から始まらないようにするためのものです。

## 1 日あたり得られるもの

各エントリは 2 層構造です:

- **1 行ブリーフ** — その日の輪郭を捉えた 1 文。ノートリストに直接表示されます。
- **詳細ビュー** — ブリーフを展開すると、プロジェクト別にグループ化された Markdown レポートが見られ、トピックごとに H3 セクションと箇条書きのハイライトが並びます。

ブリーフはざっと見るためのもの、詳細ビューは振り返りドキュメントに貼り付けるためのものです。

各日の小さなヘッダにはセッション数と総コストが表示されます — [統計ダッシュボード](/purplemux/ja/docs/usage-rate-limits/) と同じ数値の要約版です。

## レポートを生成する

レポートはオンデマンドで生成され、自動ではありません。ノートビューから:

- 欠けている日の隣の **生成** で、JSONL トランスクリプトからその日のレポートを作成。
- 既存のエントリの **再生成** で、新しい内容で同じ日を再構築 (コンテキストを追加した、言語を切り替えた、などの場合に便利)。
- **すべて生成** は欠けているすべての日を順に埋めていきます。バッチはいつでも停止可能です。

LLM は各セッションを個別に処理してからプロジェクト別にマージするので、タブが多い長い 1 日でもコンテキストが失われません。

{% call callout('note', 'ロケールはアプリに従う') %}
レポートは purplemux が設定されている言語で書かれます。アプリの言語を切り替えて再生成すると、新しいロケールで同じ内容が得られます。
{% endcall %}

## 配置場所

| 表面 | パス |
|---|---|
| サイドバー | **ノート** エントリ。リストビューを開く |
| ショートカット | macOS では <kbd>⌘⇧E</kbd>、Linux では <kbd>Ctrl⇧E</kbd> |
| ストレージ | `~/.purplemux/stats/daily-reports/<date>.json` |

各日は 1 つの JSON ファイルで、ブリーフ、詳細 Markdown、ロケール、セッションメタデータを含みます。マシンを離れるのは LLM 呼び出しそのものだけで、それはホストで設定されている Claude Code アカウントを通します。

## プロジェクト別の構造

詳細ビュー内で、典型的な 1 日はこのようになります:

```markdown
**purplemux**

### Landing page draft
- Designed the eight-section structure with Hero / Why / Mobile / Stats layouts
- Made the purple brand color an OKLCH variable
- Applied desktop / mobile screenshot mockup frames

### Feature card mockups
- Reproduced real spinner / pulse indicators on the multi-session dashboard
- Tightened Git Diff, workspace, and self-hosted mockup CSS
```

同じプロジェクトで作業したセッションは 1 つのプロジェクト見出しの下にマージされ、プロジェクト内のトピックは H3 セクションになります。レンダリングされた Markdown をそのまま振り返りテンプレートにコピーできます。

## 要約に意味がない日

Claude セッションがない日にはエントリは作られません。1 つの小さなセッションだけの日は非常に短いブリーフになるかもしれません — それで構いません。次に実際に作業したときにより長く再生成されます。

バッチ生成は現在のロケールで既にレポートがある日をスキップし、本当のギャップだけを埋めます。

## プライバシー

レポートを構築するために使われるテキストは、`~/.claude/projects/` であなた自身が読める JSONL トランスクリプトと同じものです。要約リクエストは 1 日 1 回の LLM 呼び出しで、キャッシュ出力は `~/.purplemux/` の下に留まります。テレメトリ、アップロード、共有キャッシュはありません。

## 次のステップ

- **[使用量とレート制限](/purplemux/ja/docs/usage-rate-limits/)** — このセッション数とコストが来るダッシュボード。
- **[ライブセッションビュー](/purplemux/ja/docs/live-session-view/)** — ソースデータをリアルタイムで。
- **[キーボードショートカット](/purplemux/ja/docs/keyboard-shortcuts/)** — ノートの <kbd>⌘⇧E</kbd> も含む。
