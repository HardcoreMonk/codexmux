# 2026-05-05 Codex 입력 프롬프트 복구 handoff

## 범위

- Android에서 `purecvisor-single` workspace가 계속 hang/busy로 보이던 상태를 점검했다.
- 실제 tmux pane은 Codex CLI가 `Conversation interrupted` 또는 resume working directory 선택 프롬프트에 멈춘 상태였다.
- JSONL에는 현재 prompt를 명확히 종료/interrupt로 표시하는 marker가 없어서 기존 `StatusManager`가 stale `busy` 또는 persisted `idle`을 유지했다.

## 배포

| 항목 | 값 |
| --- | --- |
| 배포 commit | `7e83313` |
| 포함 commit | `86b46fd`, `9b609bb`, `7e83313` |
| version | `0.4.1` |
| live health | `/api/health` `commit=7e83313` |
| service | `codexmux.service` active/running, `NRestarts=0` |

## 변경

- `src/lib/codex-pane-state.ts`가 Codex `Conversation interrupted - tell the model what to do differently` 입력 프롬프트를 감지한다.
- `StatusManager`는 JSONL marker 없이 interrupted prompt가 live pane에 남아 있으면 stale `busy`를 `idle`로 되돌리고 `currentAction`을 비운다.
- `permission-prompt` parser는 Codex resume working directory prompt의 `Use session directory`/`Use current directory` 선택지를 인식한다.
- persisted state가 `idle`이어도 live pane에 입력 선택지가 보이면 `needs-input`으로 복구한다.

## 검증

```bash
corepack pnpm exec vitest run \
  tests/unit/lib/permission-prompt.test.ts \
  tests/unit/lib/codex-pane-state.test.ts \
  tests/unit/lib/status-state-machine.test.ts \
  tests/unit/lib/codex-jsonl-state.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm deploy:local
curl -fsS http://127.0.0.1:8122/api/health
systemctl --user show codexmux.service --property=ActiveState,SubState,NRestarts,ExecMainPID,Result
journalctl --user -u codexmux.service --since '5 minutes ago' -p warning..alert --no-pager
```

결과:

- 관련 unit test 31개 통과.
- `tsc --noEmit`, `lint`, production build 통과.
- `deploy:local` 후 `/api/health`가 `commit=7e83313` 반환.
- service active/running, `NRestarts=0`, warning journal 없음.
- `/api/tmux/permission-options?session=pt-ws-CxKkad-pane-PsotMe-tab-hA9xSm`가 `Use session directory`와 `Use current directory` 선택지를 반환.
- `/api/debug/perf` status snapshot에서 Codex provider tab이 stale `busy`가 아니라 `needs-input`으로 집계됨.

## 운영 메모

- 이 변경은 Android 전용이 아니다. Android는 `/api/status` WebSocket에서 서버 상태를 반영했을 뿐이며, source of truth는 `StatusManager`다.
- Prompt 선택 자체는 여전히 Codex CLI와 tmux stdin이 소유한다. codexmux는 visible prompt를 감지해 UI 상태와 선택지 전달 경로를 복구한다.
- 다음 prompt 회귀가 의심되면 먼저 tmux pane capture와 `/api/tmux/permission-options` 응답을 비교한다.
