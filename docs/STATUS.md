# Agent 상태 감지

codexmux는 tab마다 세 가지 상태를 분리해 추적한다.

1. terminal WebSocket 연결 여부.
2. tmux pane 아래 agent process 실행 여부.
3. UI badge와 notification에 표시할 agent 작업 상태.

등록된 provider는 Codex 하나이며 payload와 client store field는 `agent*` 이름을 사용한다.

## 흐름

```text
tmux pane
  ├─ process tree poll      -> provider.detectActiveSession()
  ├─ title update           -> current process + cwd
  └─ Codex JSONL change     -> timeline + metadata

StatusManager
  ├─ tab별 status 저장
  ├─ layout.json에 cliState/session metadata 저장
  ├─ /api/status WebSocket broadcast
  └─ review/input 상태에서 toast/native/Web Push 알림 전송
```

## process state

`agentProcess`는 tmux pane 아래에 agent process가 있는지를 나타낸다.

| 값 | 의미 |
|---|---|
| `null` | 아직 확인하지 않음 |
| `true` | Codex process를 찾음 |
| `false` | Codex process가 없음 |

Codex 감지는 pane PID 아래 child process를 따라가며 `codex`를 찾고, cwd와 `~/.codex/sessions/YYYY/MM/DD/*.jsonl`을 연결한다.

## work state

| 상태 | 의미 |
|---|---|
| `inactive` | agent process가 없거나 초기 상태 |
| `idle` | 다음 입력 대기 |
| `busy` | Codex가 작업 중 |
| `ready-for-review` | 한 turn이 끝났고 아직 사용자가 확인하지 않음 |
| `needs-input` | permission 또는 input 선택 대기 |
| `unknown` | 서버 재시작 전 `busy`였고 복구 중 |
| `cancelled` | tab close 중인 client-local 상태 |

`ready-for-review`는 사용자가 tab을 focus하거나 dismiss할 때만 `idle`로 돌아간다.

## notification

- foreground window는 `use-toast-notification`이 작업 완료 toast를 표시한다.
- Electron/native notification은 `use-native-notification`이 처리한다.
- background Web Push는 `StatusManager`가 전송한다.
- `soundOnCompleteEnabled=false`이면 작업 완료 toast sound를 재생하지 않고, native/background system notification도 silent로 요청한다.
- permission/input 요청성 notification은 `needs-input`으로 전환하고, 일반 작업 완료 notification은 review flow를 따른다.

## event model

```ts
export type TEventName =
  | 'session-start'
  | 'prompt-submit'
  | 'notification'
  | 'stop'
  | 'interrupt';
```

상태 전이는 다음처럼 단순하게 유지한다.

```text
session-start -> idle
prompt-submit -> busy
notification  -> needs-input
stop          -> ready-for-review
interrupt     -> idle
```

생성된 hook/statusline bridge file도 event를 POST할 수 있지만 Codex 상태의 주 경로는 process detection, JSONL metadata, terminal state, polling이다.

## JSONL metadata

Codex parser는 `session_meta`, `turn_context`, `event_msg`, `response_item` 계열 record를 읽어 message, tool call, tool result, reasoning summary, token usage를 추출한다. StatusManager는 active tab의 JSONL을 tail하면서 `lastAssistantMessage`, `currentAction`, `agentSessionId`, `jsonlPath`를 갱신한다.

## client field

| field | 의미 |
|---|---|
| `terminalConnected` | terminal WebSocket 연결 여부 |
| `agentProcess` | process 감지 결과 |
| `agentInstalled` | Codex 설치/초기화 gate |
| `cliState` | badge와 notification 상태 |
| `sessionView` | session-list, check, timeline 중 현재 view |
| `agentSessionId` | Codex session id |
| `agentSummary` | session 요약 |
| `lastEvent`, `eventSeq` | event 순서 보장 |
| `currentAction` | 현재 tool/action 요약 |

## 관련 파일

| 파일 | 역할 |
|---|---|
| `src/lib/status-manager.ts` | 서버 상태, polling, JSONL watch, Web Push |
| `src/hooks/use-agent-status.ts` | status WebSocket hook |
| `src/hooks/use-tab-store.ts` | client tab state |
| `src/lib/providers/codex/index.ts` | Codex provider adapter |
| `src/lib/codex-session-detection.ts` | Codex process/session detection |
| `src/lib/codex-session-parser.ts` | Codex JSONL parser |
| `src/pages/api/check-agent.ts` | process check API |
