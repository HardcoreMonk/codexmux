# Post-MVP Agent Provider Architecture Design

Date: 2026-05-06
Status: Draft for review

## Goal

Fork/sub-agent UI, Codex app-server adapter, provider fixtures, and timeline/status module splitting을
하나의 큰 구현으로 묶지 않고 안전한 순서로 진행한다. 승인된 순서는 다음과 같다.

1. Provider fixture/contract 강화
2. Timeline/status module split
3. App-server adapter
4. Fork/sub-agent UI

핵심 원칙은 provider model과 timeline/status ownership을 먼저 고정하고, 그 위에 새 transport와
UI를 올리는 것이다. 기존 Codex JSONL + tmux 경로는 release rollback path로 유지한다.

## Current Context

- 현재 등록 provider는 Codex 하나이며 `src/lib/providers/types.ts`의 `IAgentProvider`가
  session detection, resume/launch command, JSONL parse/read, tab metadata access를 정의한다.
- `tests/unit/lib/providers.test.ts`는 provider shape와 기본 Codex parser 안정성만 확인한다.
- `src/lib/timeline-server.ts`는 WebSocket request, provider resolution, JSONL file watcher,
  resume/session-changed, init/append delivery가 한 파일에 모여 있다.
- `src/lib/status-manager.ts`는 process poll, JSONL watch, live pane recovery, state transition,
  Web Push, session history, bridge trace, client broadcast를 한 클래스가 처리한다.
- Runtime v2는 timeline/status default ownership을 이미 제공하지만, provider 확장과 app-server
  adapter가 들어오면 provider identity, source identity, parent/child relationship을 더 명확히
  해야 한다.

## Non-Goals

- 첫 구현에서 fork/sub-agent 실행 제어, sub-agent 생성, provider switching UI를 만들지 않는다.
- Codex app-server protocol이 불안정한 상태에서 production default provider로 전환하지 않는다.
- `agent*` persisted field를 즉시 rename하지 않는다. 호환성을 위해 기존 field 이름을 유지한다.
- Timeline/status module split은 behavior rewrite가 아니라 책임 분리와 테스트 가능성 개선이다.
- External provider transcript, raw prompt, terminal output, full command, JSONL path를 durable audit나
  UI metadata에 새로 저장하지 않는다.

## Workstream 1: Provider Fixture And Contract

Provider 확장의 첫 단계는 contract를 더 엄격하게 만드는 것이다.

- `IAgentProvider`의 필수 capability를 contract test로 검증한다.
- Codex fixture를 `tests/fixtures/providers/codex/` 아래에 둔다.
- Fixture는 최소 세 종류를 포함한다.
  - 기본 user/assistant/tool/reasoning timeline
  - paired `event_msg.agent_message` + `response_item.message` dedupe case
  - session metadata, cwd, model, token usage, interrupted/needs-input 주변 record
- Provider contract test는 다음을 확인한다.
  - `provider.id`, `panelType`, `matchesProcess`, `isValidSessionId`
  - `parseJsonlContent`, `readTailEntries`, `readEntriesBefore`, `parseIncremental`의 stable id와 dedupe
  - `resolveJsonlPath`는 session id를 우선하고 cwd-only fallback을 일반 검색에서 허용하지 않음
  - provider output이 raw cwd/path/prompt를 불필요하게 public metadata에 섞지 않음

이 workstream은 app-server adapter의 기준선이다. 새 provider는 Codex fixture와 같은 shape의
contract를 통과해야 experimental registry에 들어갈 수 있다.

## Workstream 2: Timeline/Status Module Split

Timeline과 status의 source of truth는 바꾸지 않고 side-effect boundary를 나눈다.

Timeline split target:

- `timeline-server.ts`는 request/auth/session guard와 high-level orchestration만 남긴다.
- `timeline-subscription-service`는 subscriber set, init/append/error delivery, backpressure-safe send를
  소유한다.
- `timeline-file-watcher-service`는 JSONL watcher, tail snapshot cache, incremental read scheduling을
  소유한다.
- `timeline-resume-service`는 unsafe active process guard, resume command delivery,
  `timeline:session-changed` sequencing을 소유한다.

Status split target:

- `status-manager.ts`는 live manager facade와 orchestration만 남긴다.
- `status-poll-service`는 tmux/process/provider scan과 polling cadence를 소유한다.
- `status-jsonl-watch-service`는 active JSONL watcher, session id mapping, current action update를
  소유한다.
- `status-notification-service`는 notification policy, Web Push command, session history side effect,
  bridge trace forwarding을 소유한다.
- `status-pane-recovery-service`는 live pane capture, permission prompt recovery, interrupted prompt
  correction을 소유한다.

Split은 순수 helper test를 보존하면서 진행한다. Public WebSocket message shape, `/api/status`,
`/api/timeline`, Runtime v2 mode flags, rollback behavior는 그대로 유지한다.

## Workstream 3: Codex App-Server Adapter

App-server adapter는 Codex JSONL/tmux provider의 대체가 아니라 experimental provider capability로
추가한다.

Adapter policy:

- 기본값은 disabled다.
- env/config gate 예: `CODEXMUX_CODEX_APP_SERVER=experimental`.
- app-server가 제공하는 event stream이 안정적일 때만 read-only session source로 등록한다.
- tmux process detection과 JSONL provider는 fallback으로 유지한다.
- app-server event는 provider fixture contract를 통과한 normalized timeline/status event로만 내부에
  들어온다.
- approval/status event는 신뢰 경계를 분리한다. app-server가 권한 요청을 말하더라도 실제 선택 전송은
  기존 Codex CLI/tmux prompt path와 drift가 없는 경우에만 연결한다.

Initial adapter scope:

- health/capability probe
- read-only session list or current session metadata
- normalized timeline event fixture
- status hint fixture
- no launch/resume default ownership
- no approval action execution

Rollback은 gate를 끄는 것으로 충분해야 한다. 기존 Codex provider registry와 tab metadata는 계속
동작해야 한다.

## Workstream 4: Fork/Sub-Agent UI

UI는 provider/session relationship model이 고정된 뒤 read-only surface로 시작한다.

Data model:

- `agentSessionId`는 기존 호환 field로 유지한다.
- provider-neutral derived relationship을 추가한다.
  - `providerId`
  - `sourceSessionId`
  - `parentSessionId`
  - `rootSessionId`
  - `relationshipType`: `root | fork | sub-agent | resume | unknown`
  - `relationshipConfidence`: `high | medium | low`
- 첫 단계에서는 relationship을 durable mutation으로 만들지 않고, provider/parser/session index가 계산한
  projection으로 다룬다.

UI surface:

- Session list row에 parent/child indicator를 작게 표시한다.
- Timeline header 또는 session details surface에 parent/root link를 표시한다.
- Notification panel이나 terminal input 흐름은 건드리지 않는다.
- 관계가 불확실하면 `unknown`으로 표시하고 자동 merge하지 않는다.

UX는 operational density를 유지한다. 별도 marketing hero나 시각 장식 없이 session navigation과
원인 파악을 돕는 작은 정보 surface로 제한한다.

## Data Safety

- Provider fixture와 test artifact에는 raw secret, full command, token, auth cookie를 넣지 않는다.
- App-server adapter는 raw transport payload를 durable file에 저장하지 않는다.
- Relationship projection은 session id와 sanitized provider metadata만 사용한다.
- Debug/perf output은 count, duration, enum, boolean만 포함한다.
- `~/.codex/sessions/`는 계속 read-only다.

## Testing

Minimum tests by workstream:

- Provider fixture/contract:
  - `corepack pnpm test tests/unit/lib/providers.test.ts`
  - new provider fixture tests for stable ids, dedupe, incremental parse, read-before behavior
- Timeline/status split:
  - existing timeline/status unit tests unchanged
  - focused tests for new services
  - `corepack pnpm smoke:runtime-v2:timeline-websocket-default`
  - `corepack pnpm smoke:runtime-v2:status-default`
- App-server adapter:
  - fixture-only adapter tests first
  - capability probe failure test
  - disabled-by-default test
- Fork/sub-agent UI:
  - relationship projection unit tests
  - session list rendering tests
  - mobile width smoke or screenshot check if UI changes are visible

Final verification for a completed implementation slice must include:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

## Rollout

1. Add provider fixture contract and Codex fixtures.
2. Split timeline services behind the same public exports.
3. Split status side-effect services behind the same `StatusManager` facade.
4. Add app-server adapter as disabled experimental capability with fixture tests only.
5. Add relationship projection and read-only fork/sub-agent UI.
6. Update `docs/ADR.md`, `docs/ARCHITECTURE-LOGIC.md`, `docs/STATUS.md`, and
   `docs/TMUX.md` only when implementation changes durable behavior or documented ownership.

## Risks

- App-server protocol drift can create false status or approval state. Mitigation: disabled default,
  fixture contract, read-only first slice.
- Module split can accidentally change reconnect or notification timing. Mitigation: keep public facade
  stable and run existing runtime v2 smokes after each split.
- Fork/sub-agent relationship can be inferred incorrectly. Mitigation: confidence field and read-only UI.
- Large refactor can conflict with pending operations batch work. Mitigation: land the existing batch
  runner changes before starting broad implementation, or isolate this work in a separate branch/worktree.

## Open Decisions

- App-server adapter config surface should be env-only for the first slice, not UI-configurable.
- Relationship projection should be non-durable until fixture evidence proves stable identity.
- Timeline split should precede status split if only one split can be done in the first implementation pass.
