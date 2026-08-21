# Perf Triage Snapshot Design

## Goal

`/api/debug/perf` 누적치를 사람이 매번 해석하지 않아도 timeline/status/diff/stats/session index/runtime worker 병목 후보를 자동 분류한다.

## Approach

추천안은 low-risk triage layer다. 기존 성능 계측과 서비스 동작은 바꾸지 않고, `runtime.timings`, `runtime.counters`, `services.*`, `services.runtimeWorkers` 숫자만 읽어 `triage` 배열과 `summary`를 만든다. 이 결과는 다음 perf slice가 stats, diff, status polling, timeline rendering, runtime worker health 중 어디를 먼저 볼지 결정하는 운영 입력으로 쓴다.

## Scope

- `/api/debug/perf` response에 `triage` field를 추가한다.
- `src/lib/perf-triage.ts` pure helper가 snapshot-like object를 받아 sanitized result를 반환한다.
- category는 `stats`, `diff`, `timeline`, `status`, `terminal`, `session-index`, `runtime-worker`, `runtime`로 제한한다.
- result에는 metric key, severity, reason, numeric evidence만 포함한다.
- cwd, session id/name, JSONL path, prompt, assistant text, terminal output 같은 민감 내용은 입력에 있어도 출력하지 않는다.

## Classification Rules

- timing `maxMs >= 3000` 또는 `averageMs >= 1000`: `high`.
- timing `maxMs >= 1000` 또는 `averageMs >= 250`: `medium`.
- runtime worker restart/timeout/health/ready/command/error counter가 1 이상이면 `high`.
- event loop p99 또는 max가 높으면 `runtime` candidate로 표시한다.
- noisy counter-only evidence는 severity를 `low`로 둔다.
- 결과는 severity, impact score, category/name 순으로 정렬하고 top 8개로 제한한다.

## Acceptance

- Unit tests cover stats, diff, timeline/status, runtime worker, event loop, and redaction behavior.
- `/api/debug/perf` unit test verifies `triage` shape and sensitive-key exclusion still holds.
- `docs/PERFORMANCE.md` and `docs/FOLLOW-UP.md` document this as the perf 31-36 automation slice.

## Non-Goals

- Status polling interval, timeline virtualization, diff cache policy, or stats parser behavior is not changed in this slice.
- No live deployment mutation or external device smoke is required.
