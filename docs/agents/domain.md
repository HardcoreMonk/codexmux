# Domain Docs

Codex가 이 repo의 domain language와 ADR을 읽는 규칙.

## Read Before Work

- `CONTEXT.md` — 단일 context의 domain language.
- `CONTEXT-MAP.md` — multi-context repo에서 각 context의 `CONTEXT.md` 위치.
- `docs/adr/` — context-specific ADR 디렉터리. 없으면 오류로 보지 않는다.
- `docs/README.md` — 내부 문서 맵과 갱신 규칙.
- `docs/ADR.md` — durable architecture decisions and decision triggers.
- `docs/ARCHITECTURE-LOGIC.md` — server, WebSocket, workspace, terminal,
  timeline, status, sync service flow.
- `docs/STATUS.md`, `docs/TMUX.md`, `docs/DATA-DIR.md`, `docs/SYSTEMD.md` —
  status detection, terminal/tmux, persisted state, and service operation.
- `docs/ANDROID.md`, `docs/ELECTRON.md` — platform shell behavior.
- `docs/PERFORMANCE.md` — perf snapshot, timeline render/cache, diff/stats
  optimization priorities and verification.
- context-specific ADR이 있으면 해당 context의 `docs/adr/`도 확인한다.

없는 파일은 오류로 보지 않는다. 필요한 term이나 decision이 실제로 생겼을 때만
사용자 확인 후 생성한다.

## Domain Architecture Pass

`domain-architecture`는 `superpowers:brainstorming`의 `writing-spec` 산출물 이후,
`grill-me` 이전에 수행한다. 목적은 domain model이 code architecture를 결정하는
기준이 되게 하는 것이다. `writing-spec`은 별도 lifecycle gate가 아니라
brainstorming의 design spec output이다. `office-hours`는 early discovery 전후에
선택적으로 사용할 수 있다.

Pass는 가능한 domain source를 먼저 읽는다.

- `CONTEXT.md`
- `CONTEXT-MAP.md`
- `docs/adr/`
- context-specific ADR 디렉터리
- 관련 기존 코드와 문서

누락된 domain file은 오류가 아니다. 새 파일을 만들거나 기존 파일을 갱신하는 것은
실제 domain term 또는 되돌리기 어려운 decision이 있고 사용자가 확인한 경우로 제한한다.

Pass 결과는 plan grilling 전에 아래 영향을 명시해야 한다.

- canonical domain term과 거절한 synonym
- bounded context 또는 module 후보
- 필요한 경우 aggregate, entity, value object 후보
- folder structure 영향
- module boundary 영향
- public API, function signature, type shape 영향
- adapter 또는 infrastructure boundary 영향
- hard to reverse, surprising without context, real trade-off 조건을 만족하는 ADR 후보

## Vocabulary

- issue title, test name, architecture proposal은 `CONTEXT.md` 용어를 우선한다.
- 모호한 term은 사용자에게 canonical term을 확인한다.
- implementation detail은 domain term으로 올리지 않는다.

## ADR

ADR은 아래 세 조건이 모두 맞을 때만 제안한다.

- hard to reverse
- surprising without context
- real trade-off

기존 ADR과 충돌하는 제안은 충돌 사실과 재검토 이유를 함께 표시한다.

## Improve Codebase Architecture Boundary

`improve-codebase-architecture`는 implementation activity로 유지한다. 단, plan에서
수락된 architecture candidate에만 적용하며 open-ended cleanup phase로 쓰지 않는다.

허용 범위:

- shallow module
- duplicated seam
- testability friction
- domain behavior와 data 사이의 낮은 locality
- 확인된 domain language와 충돌하는 naming

경계:

- 관련 없는 module은 바꾸지 않는다.
- FE/React/Vercel 또는 BE/FastAPI skill rewrite를 도입하지 않는다.
- 사용자가 delegated 또는 parallel agent work를 명시적으로 요청하지 않으면 sub-agent를
  dispatch하지 않는다.
- domain boundary를 옮기기 전에 public behavior test 또는 project-standard regression
  test를 우선한다.

`plan-design-review`는 UI 변경이 아니어도 information architecture, gate clarity,
operator error prevention, discoverability를 검토한다. `plan-eng-review`는
`domain-architecture` pass가 module boundary, data flow, test strategy, rollback path에
미치는 영향을 반드시 검토한다.
