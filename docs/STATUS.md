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
  ├─ status-state-machine reducer로 상태 전이 판정
  ├─ status-session-mapping으로 session id/completion key 정규화
  ├─ status-notification-policy로 hook notification 처리 여부 판정
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

Codex 감지는 pane PID 아래 child process를 따라가며 `codex`를 찾고, session id 또는
process start time으로 `~/.codex/sessions/YYYY/MM/DD/*.jsonl`을 연결한다. Linux에서는
`src/lib/session-detection.ts`의 `/proc` 기반 helper로 child PID, command, cwd, start time을
읽어 상태 polling 중 `pgrep`/`ps` subprocess 생성을 피한다. Codex CLI가
프로세스 시작 후 늦게 JSONL을 남기는 경우를 고려해 process start time 매칭은 120초
허용치를 둔다. cwd fallback은 live Codex process가 확인된 `detectActiveCodexSession`
경로에서만 마지막 보정으로 사용한다. 일반 JSONL 검색은 cwd만으로 가장 최근 JSONL을
선택하지 않는다. 같은 workspace에서 여러 Codex tab이 동시에 실행될 수 있으므로, tab에
저장된 `agentSessionId`/`agentJsonlPath`를 우선 보존하고 rollout 파일명은 plain Codex
UUID로 정규화한다.

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

일반 hook 상태 전이는 다음처럼 단순하게 유지한다.

```text
session-start -> idle
prompt-submit -> busy
notification  -> needs-input
stop          -> ready-for-review
interrupt     -> idle
```

Hook event와 Codex JSONL/process metadata의 다음 상태 판단은
`src/lib/status-state-machine.ts`의 순수 reducer가 담당한다. session id 추출,
completion dedupe key, input 요청성 notification 판정, JSONL metadata merge는
`status-session-mapping`, `status-notification-policy`, `status-metadata`의 순수
helper가 담당한다. `StatusManager`는 tmux/process/JSONL 신호 수집, 상태 적용,
history 저장, notification 같은 부수효과를 처리한다.

Codex tab에서는 `stop` hook을 바로 `ready-for-review`로 전환하지 않는다. `stop`은
JSONL 재확인을 예약하는 신호이며, 실제 완료 판정은 같은 turn의
`event_msg.payload.type="task_complete"` 기록이 확인될 때만 한다. `StopFailure`는
`stop-failure`로 전달되며 상태 전이를 만들지 않는다.

`task_complete.turn_id`는 완료 correlation key의 일부로 사용한다. Web Push와 session
history 저장은 `sessionId:turnId` 기준으로 dedupe되어, 같은 Codex turn이 JSONL watch,
poll, stop-hook 재확인 경로에서 여러 번 관측되어도 완료 알림과 history가 중복 생성되지
않는다. turn id를 확인할 수 없는 legacy 경로는 기존 상태 전이 동작을 유지한다.

생성된 hook/statusline bridge file도 event를 POST할 수 있지만 Codex 상태의 주 경로는 process detection, JSONL metadata, terminal state, polling이다.

## JSONL metadata

Codex parser는 `session_meta`, `turn_context`, `event_msg`, `response_item` 계열 record를 읽어 message, tool call, tool result, reasoning summary, token usage를 추출한다. StatusManager는 active tab의 JSONL을 tail하면서 `lastAssistantMessage`, `currentAction`, `agentSessionId`, `jsonlPath`를 갱신한다.

`response_item`의 synthetic user context, 예를 들어 `# AGENTS.md instructions for ...`나
`<environment_context>`는 visible timeline message로 표시하지 않는다.

Timeline entry id는 JSONL record offset과 record identity 기반으로 생성한다. 재연결,
tail 재읽기, load-more 과정에서 같은 record가 다시 파싱되어도 entry id가 안정적으로
유지되고, client merge/dedupe 로직은 id 재생성이나 중복 append에 의존하지 않는다.
`use-timeline`은 WebSocket 상태와 React state 연결을 담당하고, init/append/load-more
병합 정책은 `timeline-entry-merge`에서 처리한다.

Codex CLI는 정상 동작 중 같은 visible assistant text를 `event_msg.payload.type="agent_message"`와
paired `response_item.payload.type="message"` record로 몇 ms 간격에 남길 수 있다.
`codex-session-parser`는 같은 role/text가 `MESSAGE_PAIR_DEDUPE_WINDOW_MS` 안에 들어오면
하나의 entry로 취급한다. file watch가 두 record를 서로 다른 append batch로 보낸 경우에는
`timeline-entry-dedupe`와 `timeline-entry-merge`가 같은 near-duplicate 규칙으로 한 번만
표시한다. 이 때문에 assistant message identity를 timestamp 단독으로 잡지 않는다.

`agent_message`는 commentary/final text 모두에 쓰일 수 있어 완료 신호로 보지 않는다.
예를 들어 "이제 파일을 편집합니다" 같은 중간 commentary 뒤에 바로 tool call이 이어질
수 있다. 따라서 작업 완료 알림과 `ready-for-review` 전환은 현재 turn의
`task_complete`가 가장 최근 turn activity 뒤에 기록된 경우에만 발생한다.

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
| `src/lib/status-state-machine.ts` | hook/process/JSONL 상태 전이 reducer |
| `src/lib/status-session-mapping.ts` | Codex session id 정규화와 completion key 생성 |
| `src/lib/status-notification-policy.ts` | notification hook 처리/전송 정책 |
| `src/lib/status-metadata.ts` | JSONL metadata merge helper |
| `src/hooks/use-agent-status.ts` | status WebSocket hook |
| `src/hooks/use-tab-store.ts` | client tab state |
| `src/lib/providers/codex/index.ts` | Codex provider adapter |
| `src/lib/codex-session-detection.ts` | Codex process/session detection |
| `src/lib/codex-session-parser.ts` | Codex JSONL parser |
| `src/lib/timeline-entry-id.ts` | JSONL 기반 stable timeline entry id 생성 |
| `src/lib/timeline-entry-dedupe.ts` | timeline entry fingerprint와 중복 제거 |
| `src/lib/timeline-entry-merge.ts` | timeline init/append/load-more 병합 정책 |
| `src/lib/timeline-server-state.ts` | timeline WebSocket shared singleton state |
| `src/pages/api/check-agent.ts` | process check API |
