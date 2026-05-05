# Runtime V2 Timeline WebSocket Cutover Design

## Goal

`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`에서 client-facing `/api/timeline`
WebSocket delivery ownership을 legacy `timeline-server` watcher에서 Runtime v2
Timeline Worker/Supervisor path로 전환한다.

기존 client URL과 message schema는 유지한다. Rollback은
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off` 하나로 legacy WebSocket owner로 복귀할 수
있어야 한다.

## Current State

- Timeline Worker는 read command, live subscribe/append/error IPC, session watcher
  subscribe/unsubscribe IPC를 갖고 있다.
- Legacy `/api/timeline/*` HTTP read URL은 `default` mode에서 Timeline Worker read
  command로 route된다.
- Legacy `/api/timeline` WebSocket은 아직 init/append/session-changed/resume delivery를
  직접 소유한다.
- `corepack pnpm smoke:runtime-v2:timeline-live-shadow`는 worker live append parity를
  검증한다.
- `corepack pnpm smoke:runtime-v2:timeline-session-changed`는 legacy session-changed
  ordering evidence를 검증한다.
- `corepack pnpm smoke:android:timeline-foreground`는 Android foreground 후 fresh
  timeline init을 검증한다.

## Scope

- `/api/timeline` WebSocket handler에서 timeline mode별 delivery owner를 선택한다.
- `default` mode에서는 Timeline Worker live subscription result를 client
  `timeline:init`으로 보낸다.
- Timeline Worker `timeline.live-append`, `timeline.live-error`, and
  `timeline.session-changed` events를 Supervisor fanout을 통해 client message로 변환한다.
- Client-facing message shape는 기존 `TTimelineServerMessage`와 호환한다.
- Worker failure, command timeout, malformed payload는 retryable reconnect 또는
  `timeline:error`로 닫힌다.
- `off` mode에서는 기존 legacy handler가 그대로 owner다.

## Non-goals

- `timeline:resume` command execution ownership은 이 slice에서 이동하지 않는다.
- Status v2 polling, ack/dismiss, Web Push, session history ownership을 함께 바꾸지 않는다.
- Timeline client hook URL, WebSocket protocol name, entry id/dedupe semantics를 바꾸지 않는다.
- Legacy JSONL files, `pt-` sessions, Codex provider parser를 migration하지 않는다.
- Perf/log/diagnostic output에 prompt, assistant text, cwd, JSONL path, terminal output,
  auth token, raw command body를 추가하지 않는다.

## Architecture

### Mode Router

`handleTimelineConnection`은 request URL과 initial subscribe message를 해석한 뒤
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE`를 확인한다.

- `off`: legacy watcher/subscriber implementation을 사용한다.
- `shadow`: legacy delivery를 유지하고 existing live shadow compare path를 유지한다.
- `default`: v2 delivery branch를 사용한다.

Mode parsing은 existing `timeline-mode` helper를 재사용한다. Unknown mode는 fail-closed로
legacy owner 또는 disabled path가 아니라 현재 helper의 off semantics를 따른다.

### V2 WebSocket Session

v2 branch는 WebSocket 하나당 명시적인 subscription state를 가진다.

- active JSONL subscription id
- optional session watcher subscription id
- current tmux session, panel type, session id
- closed/cleanup flag

초기 attach는 기존 WebSocket query and message contract를 유지한다. `timeline:subscribe`가
도착하면 Supervisor에 `subscribeTimelineLive()`를 호출하고 reply `init`을 client로 보낸다.
이후 append/error/session-changed는 subscriber id로 fanout한다.

### Session-changed Delivery

Timeline Worker session watcher event는 client-facing `timeline:session-changed`로 변환한다.
Ordering은 기존 smoke evidence와 같은 의미를 유지한다.

새 Codex JSONL이 감지되면:

1. v2 branch sends `timeline:session-changed`.
2. client reconnects or subscribes to the new JSONL.
3. v2 live subscription sends fresh `timeline:init`.

이 slice는 resume execution을 worker로 옮기지 않으므로, unsafe active process protection은
기존 resume safety path를 유지한다.

### Cleanup

WebSocket close, unsubscribe message, session switch, and server shutdown must unsubscribe from
Timeline Worker/Supervisor. Cleanup is best-effort but must not leave stale subscribers after normal
close.

If Worker or Supervisor returns a retryable error, the socket closes with a retryable reason where
the existing client reconnect policy can recover. Non-retryable path sends `timeline:error` without
printing sensitive source values.

## Data Flow

```text
client /api/timeline
  -> timeline WebSocket mode router
  -> Runtime Supervisor subscribeTimelineLive
  -> Timeline Worker live JSONL watcher
  -> Supervisor event fanout
  -> timeline:init / timeline:append / timeline:error / timeline:session-changed
```

Legacy resume remains:

```text
client timeline:resume
  -> legacy process safety check
  -> existing resume handler
```

## Error Handling

- Provider missing: send existing `timeline:error` equivalent and close only when the legacy path
  would close.
- Forbidden JSONL path: reject subscribe with `timeline:error` and do not start a worker watcher.
- Worker timeout/start failure: close retryably and record count-only perf counters.
- Worker append parse error: send sanitized `timeline:error` and keep reconnect possible.
- Client unsubscribe/close: unsubscribe worker subscription and clear local state.
- Duplicate close/cleanup calls are idempotent.

## Observability

Use existing perf counter boundaries:

- Runtime worker health/readiness/restart/timeout counters remain in `/api/debug/perf`.
- Timeline default WebSocket delivery adds count-only counters for v2 init, append, error,
  session-changed, cleanup, and fallback/rollback events if needed.
- Counter labels must not include session names, paths, prompts, commands, or transcript text.

## Testing

Focused tests:

- Runtime IPC schema tests for existing timeline live/session watcher events.
- Timeline Worker service tests for live subscribe/unsubscribe and session watcher cleanup.
- Supervisor tests for subscriber-scoped event fanout.
- Timeline WebSocket mode routing tests proving:
  - `off` uses legacy delivery.
  - `shadow` keeps legacy delivery plus shadow compare.
  - `default` uses v2 delivery.
  - cleanup unsubscribes from Supervisor.

Smoke:

```bash
corepack pnpm smoke:runtime-v2:timeline-live-shadow
corepack pnpm smoke:runtime-v2:timeline-resume-safety
corepack pnpm smoke:runtime-v2:timeline-session-changed
corepack pnpm smoke:android:timeline-foreground
```

Baseline:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
```

## Rollout

1. Implement v2 WebSocket branch behind `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`.
2. Verify temp server and Android foreground timeline smoke.
3. Deploy with existing service mode still observable through `/api/v2/runtime/health`.
4. Watch runtime worker counters and warning journal.
5. Keep `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off` as the documented rollback.

## Rollback

Set:

```text
CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off
```

Then reload/restart the service. Legacy `/api/timeline` WebSocket delivery resumes ownership.
No JSONL, SQLite, tmux, or Codex session cleanup is required for rollback.

## Acceptance Criteria

- In `default` mode, client `/api/timeline` WebSocket receives init/append/error/session-changed
  from Timeline Worker/Supervisor delivery.
- In `off` mode, legacy WebSocket delivery remains intact.
- `timeline:resume` process-safety behavior remains unchanged.
- Android foreground timeline reconnect smoke passes and restores the Android WebView to the
  configured restore URL after the smoke.
- No diagnostic output includes prompt text, assistant text, cwd, JSONL path, terminal output, auth
  token, or raw command body.
