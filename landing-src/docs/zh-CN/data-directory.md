---
title: 데이터 디렉터리
description: ~/.codexmux/ 아래에 저장되는 파일과 삭제 기준.
eyebrow: 레퍼런스
permalink: /zh-CN/docs/data-directory/index.html
---
{% from "docs/callouts.njk" import callout %}

codexmux의 영속 상태는 `~/.codexmux/` 아래에 저장됩니다. Codex CLI의 원본 session JSONL은 `~/.codex/sessions/`에 있으며 codexmux는 읽기 전용으로만 접근합니다.

## 구조

```text
~/.codexmux/
├── config.json
├── workspaces.json
├── workspaces/{wsId}/layout.json
├── workspaces/{wsId}/message-history.json
├── hooks.json
├── status-hook.sh
├── statusline.sh
├── rate-limits.json
├── session-history.json
├── session-index.json
├── quick-prompts.json
├── sidebar-items.json
├── keybindings.json
├── vapid-keys.json
├── push-subscriptions.json
├── cli-token
├── port
├── cmux.lock
├── logs/
├── uploads/
└── stats/
```

`hooks.json`, `status-hook.sh`, `statusline.sh`는 local hook/statusline bridge용 생성 파일입니다. Codex tab 실행에는 필요하지 않습니다.

`session-index.json`은 로컬 `~/.codex/sessions`의 session list metadata cache입니다. 삭제해도 다음 refresh에서 다시 생성되며, Codex JSONL 원본을 대체하지 않습니다.

## 주요 파일

| 파일 | 내용 | 삭제 가능 여부 |
|---|---|---|
| `config.json` | login hash, session secret, theme, Codex option | 가능. onboarding 재실행 |
| `workspaces.json` | workspace 목록과 sidebar 상태 | 가능. 모든 workspace 초기화 |
| `workspaces/{wsId}/layout.json` | pane/tab tree와 tab metadata | 가능. 해당 workspace layout 초기화 |
| `workspaces/{wsId}/message-history.json` | workspace별 web input history | 가능. 해당 workspace 입력 history 초기화 |
| `cli-token` | CLI와 hook bridge token | 가능. 재시작 시 재생성 |
| `port` | 현재 server port | 가능. 재시작 시 재생성 |
| `cmux.lock` | 단일 인스턴스 guard | process가 없을 때만 삭제 |
| `session-index.json` | 로컬 Codex session list metadata cache | 가능. 다음 refresh에서 재생성 |
| `stats/` | usage cache와 daily report. runtime build는 in-flight dedupe 적용 | 가능. 다음 요청에서 재계산 |

## 백업

```bash
tar czf codexmux-backup.tgz -C ~ .codexmux
```

복원 전에는 codexmux를 종료하고 같은 위치에 풀어 넣습니다.

## reset 기준

- 로그인만 초기화: `config.json` 삭제.
- 모든 workspace 초기화: `workspaces.json`과 `workspaces/` 삭제.
- 통계 재계산: `stats/` 삭제.
- session list index 재생성: `session-index.json` 삭제.
- 전체 초기화: `~/.codexmux/` 삭제.

`~/.codex/`는 Codex CLI의 auth와 session history를 포함하므로 일반적인 codexmux reset에서는 삭제하지 않습니다. 이전 빌드에서 남은 원격 복사본 디렉터리는 현재 앱에서 읽지 않으며 필요하면 수동으로 삭제합니다.
