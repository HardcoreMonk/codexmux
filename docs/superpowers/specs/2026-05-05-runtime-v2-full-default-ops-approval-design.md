# Runtime V2 Full Default And Ops Approval Design

## Goal

runtime v2를 production 기본 경로로 완성하되 terminal/storage, timeline, status, 운영 control, performance, approval workflow를 한 번에 전환하지 않는다. 각 surface는 독립 gate, rollback, smoke evidence를 가진다.

## Current State

- Terminal v2는 `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=new-tabs`로 live enabled다.
- Storage v2는 `CODEXMUX_RUNTIME_STORAGE_V2_MODE=default`로 live enabled다.
- Timeline v2는 read-only worker/API foundation과 shadow compare smoke까지 완료했고 live WebSocket watcher ownership은 legacy다.
- Status v2는 reducer/policy shadow compare까지 완료했고 polling, ack/dismiss, Web Push, session history side effect ownership은 legacy다.
- 2026-05-05 14:20 KST runtime v2 observation은 운영자 승인 closeout으로 완료 처리했다. 원래 clock gate인 2026-05-06 01:42 KST 이전 closeout이므로 elapsed-time pass가 아니라 operator-approved closeout이다.

## Decomposition

### 1. Phase 4 Timeline v2 Live Shadow

Timeline Worker가 live watcher/subscriber state를 소유하기 전, legacy `/api/timeline`과 동일한 init/append/session-changed semantics를 worker-backed shadow channel에서 검증한다.

Scope:

- Worker service에 live file watcher lifecycle을 추가한다.
- Supervisor에는 timeline subscription command/event boundary를 추가한다.
- Server WebSocket은 `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=shadow`에서 legacy response를 계속 client에 보내고 v2 worker output을 shadow compare/counter로만 기록한다.
- `default` mode는 shadow smoke와 Android foreground reconnect evidence가 닫힌 뒤 별도 commit에서 켠다.

Non-goals:

- Status side effects를 같이 이동하지 않는다.
- Resume command execution ownership은 첫 slice에서 legacy에 둔다. Worker는 active JSONL watch/init/append/session-changed event parity를 먼저 맡는다.
- Timeline entry text, prompt, tool args를 perf/diagnostic mismatch output에 넣지 않는다.

Success:

- Long JSONL append smoke에서 duplicate assistant message가 없다.
- Worker crash closes timeline sockets with retryable behavior or legacy fallback.
- Android foreground reconnect opens a fresh timeline without stale JSONL.

### 2. Phase 5 Status v2 Side Effects

Status Worker가 polling, hook/statusline application, ack/dismiss, Web Push, session history write를 단계적으로 소유한다.

Scope:

- Pure reducer/policy parity를 유지한다.
- Side-effect adapter는 legacy `StatusManager`와 같은 event shape를 생산한다.
- Web Push/session history는 status worker default 마지막 단계에서만 이동한다.

Non-goals:

- Timeline cutover와 같은 release에서 default 전환하지 않는다.
- Web Push payload에 prompt body, cwd, JSONL path, terminal output을 추가하지 않는다.

Success:

- `needs-input`, `ready-for-review`, dismiss, ack, Web Push smoke가 통과한다.
- Session history dedupe는 `sessionId:turnId` 기준을 유지한다.

### 3. Measurement-based Performance Tuning

새 최적화는 `/api/debug/perf` snapshot과 smoke evidence가 병목을 가리킬 때만 적용한다.

Initial candidates:

- `status.poll` 평균과 p95가 증가하면 active/background workspace scheduling을 분리한다.
- Long timeline에서 render jank가 남으면 small windowed render를 별도 feature flag로 검증한다.
- Terminal stdout coalescing은 raw chunk 대비 sent message 감소율과 input latency smoke를 같이 본 뒤 flush window만 조정한다.

Non-goals:

- 수치 없이 full virtualization, broad polling rewrite, terminal protocol rewrite를 시작하지 않는다.

### 4. Approval Workflow High-grade Path

Approval queue metadata slice 이후 mobile push copy/deep link와 durable audit history를 분리해 진행한다.

Scope:

- Web Push click은 approval target tab/pane으로 이동하고 notification panel selection path를 열어준다.
- Durable audit history는 sanitized metadata, selected option index, outcome, timestamp만 저장한다.
- Raw command, cwd, JSONL path, prompt body, assistant text, terminal output은 저장하지 않는다.

Non-goals:

- Codex CLI approval policy를 바꾸지 않는다.
- Raw CLI option label을 durable audit security boundary로 사용하지 않는다.

### 5. Lifecycle Control Executable UI

Read-only lifecycle panel은 완료됐다. 실행형 control은 별도 spec으로 둔다.

Scope:

- systemd drop-in edit, service restart, deploy, rollback drill button은 auth, confirmation, audit log, failure recovery가 있어야 한다.
- 최초 implementation은 dry-run/copy command에서 시작하고, 실제 실행 버튼은 별도 gate를 거친다.

## Grill-me Review

1. 한 번에 모든 surface를 default로 바꾸면 rollback 원인 분리가 불가능하다. Timeline Phase 4와 Status Phase 5는 별도 release gate로 유지한다.
2. Timeline Worker가 resume command execution까지 동시에 가져가면 process-safety 회귀 위험이 크다. 첫 slice는 init/append/session-changed parity에 집중한다.
3. Approval audit history는 운영상 유용하지만 보안 blast radius가 있다. 저장 payload는 sanitized metadata와 option index/outcome으로 제한한다.
4. Performance tuning은 이미 여러 저위험 cache/memo가 들어갔다. 다음 변경은 perf snapshot에서 병목이 보일 때만 한다.

## Test Strategy

- Baseline: `corepack pnpm test`, `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, `corepack pnpm build`.
- Timeline Phase 4: existing `smoke:runtime-v2:timeline-shadow`, new long append smoke, Android foreground timeline reconnect smoke.
- Status Phase 5: status shadow smoke, permission prompt smoke, Web Push smoke, session history dedupe tests.
- Approval: parser/API/unit tests, permission smoke, push navigation smoke, audit redaction tests.
- Ops: `deploy:local`, `/api/health`, `/api/v2/runtime/health`, `/api/debug/perf`, systemd status and warning journal.

## Rollout Order

1. Close observation docs and snapshot evidence.
2. Implement Phase 4 Timeline v2 live shadow.
3. Promote Timeline v2 to default only after shadow evidence and rollback smoke.
4. Implement Phase 5 Status v2 side-effect shadow.
5. Promote Status v2 to default only after notification/Web Push/session history evidence.
6. Run measured perf tuning and approval workflow high-grade slices independently.
7. Spec executable lifecycle control UI before any systemd/deploy action button.
