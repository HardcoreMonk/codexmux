# Lifecycle Control UI Design

## Goal

`/experimental/runtime`을 runtime v2 운영 상태를 한눈에 확인하는 read-only control
plane으로 확장한다. 운영자는 terminal/storage cutover 상태, worker health, 24시간
observation gate, perf 병목 후보, rollback 절차를 같은 화면에서 확인할 수 있어야 한다.

## Context

2026-05-05 KST 기준 production은 `CODEXMUX_RUNTIME_V2=1`,
`CODEXMUX_RUNTIME_TERMINAL_V2_MODE=new-tabs`,
`CODEXMUX_RUNTIME_STORAGE_V2_MODE=default`,
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`,
`CODEXMUX_RUNTIME_STATUS_V2_MODE=off`로 운영 중이다. Runtime v2 terminal/storage는
live target smoke와 rollback window canary를 통과했지만, 현재 process 기준 24시간
restart-loop 부재 관찰은 아직 닫히지 않았다. Timeline/status cutover는 Phase 4/5
별도 gate로 남아 있다.

## Scope

1차 범위:

- 기존 `/experimental/runtime` 페이지 상단에 read-only lifecycle overview를 추가한다.
- `/api/health`로 app version, commit, build time을 표시한다.
- `/api/v2/runtime/health`로 worker health와 runtime surface mode를 표시한다.
- `/api/debug/perf`로 worker diagnostics와 주요 timing/counter 요약을 표시한다.
- 24시간 observation gate는 `runtime.sampledSince` 또는 process/service start 기준에서
  계산한 종료 가능 시각을 표시한다.
- Rollback 절차는 복사 가능한 shell command block으로 제공한다.
- Systemd 직접 상태는 UI에서 실행하지 않고, 검증 명령을 보여준다.
- Korean/English runtime locale copy를 함께 갱신한다.
- `docs/RUNTIME-V2-CUTOVER.md`, `docs/FOLLOW-UP.md`, `docs/TESTING.md`에 운영 기준을
  반영한다.

## Non-Goals

- UI에서 `systemctl`, drop-in 수정, service restart, deploy, rollback을 실행하지 않는다.
- `timelineV2Mode` 또는 `statusV2Mode`를 전환하는 버튼을 만들지 않는다.
- Approval queue를 이 화면에 통합하지 않는다.
- Token, cwd, JSONL path, prompt body, assistant text, terminal output을 표시하지 않는다.
- New installs의 runtime v2 default 정책을 바꾸지 않는다.

## UX

`/experimental/runtime` 화면은 기존 diagnostic playground 기능을 유지하되, 상단에 운영
대시보드 section을 추가한다.

Section 구성:

- **Release**: app, version, commit, build time.
- **Modes**: terminal/storage/timeline/status runtime v2 mode badge.
- **Observation**: sampled since, current uptime, 24h gate end time, gate state.
- **Workers**: storage/terminal/timeline/status별 health, restarts, timeouts,
  command failures, last error.
- **Perf Watch**: timing 중 가장 큰 duration 항목과 status poll, stats cache, timeline
  read 계열 핵심 지표.
- **Rollback Runbook**: mode rollback과 검증 command를 read-only code block으로 표시.

상태 표현은 운영 UI답게 조밀하고 단정하게 유지한다. 정상 값은 과한 장식 없이 작은 badge로
표시하고, gate 미충족이나 worker failure만 amber/red 계열로 강조한다.

## Data Flow

Client page context:

1. `/api/health` fetch.
2. `/api/v2/runtime/health` fetch.
3. `/api/debug/perf` fetch.
4. 세 응답을 local view model로 normalize한다.
5. 화면은 normalize된 숫자와 mode만 표시한다.

인증은 기존 page session cookie를 사용한다. CLI token을 browser local state에 노출하지 않는다.

## Architecture

새 순수 helper를 둔다.

- `src/lib/runtime/lifecycle-control.ts`
  - health/perf 응답에서 UI에 필요한 숫자만 추출한다.
  - 24시간 gate 종료 시각과 gate 상태를 계산한다.
  - worker diagnostics를 stable list로 정렬한다.
  - rollback runbook command text를 생성한다.

UI component는 기존 runtime page 근처에 둔다.

- `src/components/features/runtime/lifecycle-control-panel.tsx`
  - props로 normalized view model을 받는다.
  - fetch를 직접 수행하지 않는다.
  - mode badge, worker rows, perf rows, runbook code block을 렌더링한다.

Page:

- `src/pages/experimental/runtime.tsx`
  - 기존 create workspace/tab diagnostic 기능을 유지한다.
  - mount/refresh 시 lifecycle endpoints를 함께 조회한다.
  - 조회 실패 시 playground 기능과 분리된 lifecycle error를 표시한다.

## Error Handling

- `/api/debug/perf`가 인증 실패 또는 일시 실패하면 lifecycle panel의 perf section만
  degraded 상태로 표시한다.
- `/api/v2/runtime/health`가 `runtime-v2-disabled`를 반환하면 mode/worker section은
  disabled state로 표시하고 playground의 기존 disabled message를 유지한다.
- `/api/health` 실패는 release section에만 실패 상태를 표시한다.
- 24시간 gate 계산에 필요한 timestamp가 없으면 `unknown`으로 표시하고 gate를 통과로
  간주하지 않는다.

## Security And Privacy

- Perf snapshot은 숫자 지표만 화면에 표시한다.
- 원본 perf JSON을 그대로 노출하지 않는다.
- Rollback runbook에는 token 값, cwd, session name, JSONL path를 넣지 않는다.
- System command는 UI에서 실행하지 않으며 copy-only text로 제공한다.

## Testing

Unit tests:

- `tests/unit/lib/runtime-lifecycle-control.test.ts`
  - mode badge view model 생성.
  - worker health aggregation.
  - 24시간 gate pending/complete/unknown 계산.
  - perf timing top offender 선택.
  - rollback command text가 token/cwd/session/prompt를 포함하지 않는지 검증.

Component tests:

- lifecycle panel renders healthy modes and workers.
- failed perf section does not hide runtime mode section.
- pending observation gate shows exact end time.

Smoke:

- Existing `/experimental/runtime` page loads with authenticated session.
- `corepack pnpm build` validates page SSR/import boundaries.
- `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, focused unit test.

## Documentation

- `docs/RUNTIME-V2-CUTOVER.md`: read-only lifecycle panel을 Phase 2/3 운영 관찰
  evidence surface로 추가한다.
- `docs/FOLLOW-UP.md`: lifecycle control UI 1차 완료 기준과 남은 executable control
  범위를 분리한다.
- `docs/TESTING.md`: lifecycle panel smoke와 민감 정보 비노출 확인을 추가한다.

## Rollout

1. Read-only panel을 구현한다.
2. Unit/type/lint/build를 통과시킨다.
3. Local authenticated page에서 `/experimental/runtime`을 열어 mode/worker/perf/gate 표시를
   확인한다.
4. Docs를 갱신한다.
5. Commit/push는 사용자가 명시적으로 요청할 때만 수행한다.

## Open Decision

Executable control panel은 이번 범위 밖이다. `systemd --user` drop-in 수정과 service
restart를 UI에서 실행하려면 별도 spec에서 auth, audit log, rollback failure handling,
confirmation UX를 먼저 설계한다.
