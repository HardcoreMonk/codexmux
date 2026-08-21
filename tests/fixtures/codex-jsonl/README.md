# Codex JSONL fixtures

이 디렉터리는 Codex CLI JSONL schema drift를 막기 위한 sanitized fixture를 보관합니다.

- Raw transcript, cwd, token, 실제 JSONL path는 넣지 않습니다.
- 새 fixture는 synthetic message만 사용합니다.
- `codex-cli-0-128-*` fixture는 로컬 `codex-cli 0.128.0`에서 관측한 record/key shape를 바탕으로
  만든 synthetic sample입니다.
- `codex-cli-legacy-*` fixture는 이전 event-message 중심 parser contract를 유지하기 위한 sample입니다.
