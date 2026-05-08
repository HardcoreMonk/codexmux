# Codex 작업 상태 감지

이 문서는 codexmux가 Codex tab의 상태를 판단하고 UI, notification, timeline에 전달하는 기준을 정리합니다.

## 흐름

```text
terminal runtime / process inspector
  + Codex JSONL
  + live pane capture
  + hook/client event
  v
status policy helpers
  v
StatusManager 또는 Status Worker
  v
WebSocket / notification / session history
```

상태 정책은 가능한 순수 helper에서 계산하고, polling, watch, broadcast, Web Push 같은 부수효과는 manager/worker가 담당합니다.

## 런타임 v2 상태

Runtime v2에서는 Status Worker가 status polling, JSONL watch, hook application, ack/dismiss, session history, Web Push update를 소유할 수 있습니다.

| Mode | 의미 |
| --- | --- |
| `off` | legacy status path |
| `shadow` | legacy와 worker policy를 비교 |
| `default` | worker status를 production source로 사용 |

`CODEXMUX_RUNTIME_V2=1`에서 status mode가 unset이면 Phase 6 기준 `default`로 해석합니다. Rollback은 mode를 `off`로 두는 것입니다.

## 프로세스 상태

프로세스 상태는 terminal 안에서 Codex가 실제로 실행 중인지 판단합니다.

| 상태 | 의미 |
| --- | --- |
| `running` | Codex process가 pane/session 아래에서 실행 중 |
| `shell` | shell은 살아 있지만 Codex process는 없음 |
| `missing` | terminal session 또는 process tree를 확인할 수 없음 |
| `unknown` | adapter가 충분한 정보를 제공하지 못함 |

Windows에서는 process inspector adapter가 PID, command line, child/descendant, start time을 제공합니다. 임의 `/proc` 또는 POSIX process command를 새 코드에 직접 추가하지 않습니다.

## 작업 상태

작업 상태는 사용자가 보는 Codex 작업 상태입니다.

| 상태 | 의미 |
| --- | --- |
| `busy` | Codex가 응답 생성, tool 실행, command 실행 중 |
| `idle` | 입력 가능한 정상 대기 상태 |
| `needs-input` | permission/input prompt가 열려 있음 |
| `review-needed` | 결과 검토 또는 승인 판단이 필요 |
| `interrupted` | Codex가 중단되었거나 prompt marker 없이 멈춤 |
| `stale` | 최근 관측이 오래되어 재확인이 필요 |

Permission/input prompt는 JSONL marker가 늦거나 없을 수 있으므로 live pane capture를 함께 봅니다.

## 알림

Notification 정책은 foreground toast, native notification, Web Push를 같은 기준으로 다룹니다.

- `notificationsEnabled=false`이면 사용자 notification을 보내지 않습니다.
- `soundOnCompleteEnabled=false`이면 완료 사운드를 재생하지 않고 system notification도 silent로 요청합니다.
- 같은 tab/session/action 조합의 중복 완료 알림은 dedupe합니다.
- Raw prompt, full command, terminal output, token-like 값은 notification payload에 넣지 않습니다.

## 이벤트 모델

Status update event는 summary projection입니다.

포함 가능한 정보:

- workspace id
- tab id/name
- Codex session id
- `cliState`
- `currentAction`
- sanitized last assistant/user summary
- prompt type, approval kind, risk level 같은 enum metadata

포함하지 않는 정보:

- raw transcript
- full terminal stdout
- full command
- cwd 전체 경로
- JSONL path
- auth token/cookie

## JSONL 메타데이터

Codex JSONL은 다음 record를 status와 timeline에 사용합니다.

- `session_meta`
- `turn_context`
- assistant/user message record
- tool call/result record
- event message
- permission/input 관련 record

Codex CLI가 process 시작 뒤 JSONL을 늦게 만들 수 있으므로 session id, process start time, live process, cwd fallback 순서로 연결합니다. 일반 session list lookup에서는 cwd만으로 최신 JSONL을 선택하지 않습니다.

## 클라이언트 필드

UI와 저장 데이터는 역사적 호환성 때문에 `agentSessionId`, `agentSummary` 같은 field 이름을 유지합니다. 의미는 Codex provider session metadata입니다.

이 field의 의미나 shape를 바꾸면 `ADR.md`와 이 문서를 함께 갱신합니다.

## Provider Registry

현재 등록 provider는 Codex 하나입니다. 새 provider를 추가하려면 registry contract를 먼저 통과해야 합니다.

- provider id는 lowercase id 형식이어야 합니다.
- display name은 비어 있으면 안 됩니다.
- panel type은 `normalizePanelType`에서 인정되어야 합니다.
- provider id와 panel type은 기존 provider와 중복될 수 없습니다.

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `src/lib/status-manager.ts` | legacy status manager 부수효과 |
| `src/lib/providers/registry.ts` | provider 등록과 contract 검증 |
| `src/lib/status-web-push-payload.ts` | status Web Push payload projection |
| `src/lib/status-state-machine.ts` | 상태 전이 helper |
| `src/lib/status-notification-policy.ts` | notification 판단 |
| `src/lib/status-session-mapping.ts` | Codex session mapping |
| `src/lib/status-metadata.ts` | status metadata projection |
| `src/lib/permission-prompt.ts` | permission/input prompt parsing |
| `src/lib/codex-session-detection.ts` | Codex process/session detection |
| `src/lib/process-inspector*.ts` | process inspector adapter |
| `src/lib/windows-process-inspector.ts` | Windows process inspector |
| `src/workers/status-worker.ts` | 런타임 v2 status worker |
