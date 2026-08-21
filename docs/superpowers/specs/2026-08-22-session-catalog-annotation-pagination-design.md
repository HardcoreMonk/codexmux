# Session Catalog Annotation Pagination 설계

- 날짜: 2026-08-22
- 상태: Implemented — code review 통과, live release 대기
- Lifecycle stage: `code-review`
- 선행 결정: ADR-031 `Verified`
- 사용자 설계 승인: 2026-08-22

## Intake

2026-08-22 live Session Catalog 검증에서 pin/tag filter는 올바른 session 1개를 반환했지만
page `total`은 filter 전 catalog session 18개를 반환했습니다. 현재 Supervisor는 Timeline
Worker가 만든 page에 Storage Worker annotation을 합친 뒤에 pin/tag predicate를 적용합니다.
이 순서는 `total`뿐 아니라 page fill과 `nextCursor`도 annotation filter 전 결과를 기준으로
계산하게 만듭니다.

대상은 Session Catalog search의 annotation-aware pagination 계약입니다. npm 배포는 최종 개발
완료 시점까지 동결하며 이번 lifecycle의 release surface가 아닙니다.

## 문제

현재 흐름은 다음과 같습니다.

```text
Browser query
-> Supervisor
-> Timeline Worker: catalog predicate, sort, limit, cursor, total
-> Storage Worker: returned page에 해당하는 annotation 조회
-> Supervisor: pinned/tags predicate로 results만 제거
```

따라서 annotation filter가 있으면 다음 불일치가 발생합니다.

- `results`는 filtered지만 `total`은 catalog predicate만 반영합니다.
- 첫 unfiltered page에 match가 적으면 limit보다 훨씬 작은 page를 반환할 수 있습니다.
- `nextCursor`는 filtered result가 아니라 unfiltered page의 마지막 위치를 가리킵니다.
- UI가 `total`과 cursor를 신뢰하면 결과 수, 더 보기 상태와 saved filter 재생이 일관되지 않습니다.

## 목표

- `query`, project, model, date, pinned와 tags를 모두 반영한 exact `total`을 반환합니다.
- annotation filter를 SQL pagination 전에 적용해 page fill, order와 cursor를 일치시킵니다.
- Storage Worker의 durable Session Annotation ownership과 Timeline Worker의 Session Catalog
  index/cursor ownership을 유지합니다.
- annotation filter가 없는 검색의 현재 hot path와 응답 계약을 유지합니다.
- 5,000-session performance gate에서 search 1초 threshold를 유지합니다.

## Non-goals

- Session Annotation의 durable owner를 Timeline Worker로 이동
- `runtime-v2/state.db`를 Timeline Worker에서 직접 read 또는 attach
- tag 검색의 case, prefix, OR semantics 변경
- public API field, URL, saved filter schema 또는 UI layout 변경
- Session Catalog 전체 rebuild 방식 변경
- npm version/tag/Release 갱신

## 승인 권고 설계

Supervisor가 annotation predicate를 Storage Worker에 먼저 질의하고, Storage Worker가 반환한
bounded selection을 Timeline Worker search의 internal predicate로 전달합니다. Timeline Worker는
selection을 catalog SQL의 `where`에 포함해 `search`, `countSearch`, sort와 cursor를 같은
predicate로 계산합니다.

```text
Browser query
-> Supervisor
   -> Storage Worker: annotation predicate -> selection
   -> Timeline Worker: catalog predicate + selection -> exact page/total/cursor
   -> Storage Worker: returned session annotation hydration
-> Browser
```

### Annotation Selection

Internal value는 public API에 노출하지 않습니다.

```typescript
type TSessionAnnotationSelection =
  | { mode: 'include'; sessionIds: string[] }
  | { mode: 'exclude'; sessionIds: string[] };
```

| Public predicate | Storage selection | 이유 |
| --- | --- | --- |
| filter 없음 | selection command 생략 | 현재 hot path 유지 |
| `pinned=true` | pinned annotation ID `include` | annotation 없는 session은 pinned가 아님 |
| `pinned=false`, tags 없음 | pinned annotation ID `exclude` | annotation 없는 session도 false로 취급 |
| tags만 있음 | 모든 tag를 가진 annotation ID `include` | tag는 annotation이 있어야 match |
| tags + `pinned=true` | tags와 pinned를 모두 만족하는 ID `include` | AND predicate |
| tags + `pinned=false` | tags를 만족하고 pinned가 아닌 annotation ID `include` | tag match가 include set을 제한 |

Tag predicate는 현재처럼 요청한 모든 tag를 포함하는 AND semantics를 유지합니다. 빈 include
selection은 SQL `false` predicate로 처리하고, 빈 exclude selection은 annotation predicate가 없는
것과 같은 catalog 결과를 반환합니다.

### Timeline Search Predicate

Timeline IPC의 public query shape와 별도로 internal annotation selection을 받을 수 있는 runtime
search input을 정의합니다. Session Catalog repository input에는 `includeSessionIds` 또는
`excludeSessionIds` 중 하나만 전달합니다.

ID list는 SQL text placeholder를 session 수만큼 늘리지 않고 SQLite `json_each`에 bound JSON
parameter 하나로 전달합니다. Search와 count가 같은 helper로 predicate를 만들고, count에서는
cursor만 제외합니다. ID는 기존 `sessionIdSchema`로 검증하고 selection은 최대 10,000 unique
session ID로 제한합니다.

### Annotation Hydration

Timeline Worker page가 확정된 뒤 Supervisor는 현재처럼 page session ID 최대 200개만 Storage
Worker에 보내 annotation을 hydrate합니다. 이 단계는 표시용이며 결과 포함 여부, `total` 또는
cursor를 다시 바꾸지 않습니다.

## Pagination 계약

- `total`은 cursor를 제외한 모든 catalog/annotation predicate의 distinct session count입니다.
- `results`와 `nextCursor`는 같은 combined predicate와
  `last_activity_at desc, session_id desc` order를 사용합니다.
- `nextCursor`는 반환한 filtered page의 마지막 session을 기준으로 합니다.
- Annotation update 뒤 같은 saved filter를 다시 실행하면 Storage selection을 새로 계산합니다.
- Cursor 발행 뒤 annotation이 바뀌는 경우는 기존 catalog mutation과 같은 best-effort cursor
  consistency로 취급하며 snapshot isolation을 새로 약속하지 않습니다.

## Failure와 안전 경계

- Storage selection command가 실패하면 annotation-filtered search도 retryable worker error로
  실패합니다. Unfiltered search로 조용히 fallback하지 않습니다.
- Timeline Worker는 Storage DB를 직접 열지 않습니다.
- Selection payload가 contract limit을 넘으면 결과를 잘라 잘못 반환하지 않고 명시적
  `session-annotation-selection-too-large` error로 fail closed합니다.
- Selection 계산과 page hydration 사이 annotation predicate가 달라지면 Supervisor가 selection부터
  전체 orchestration을 한 번 재시도합니다. 두 번째에도 충돌하면
  `session-annotation-search-conflict` retryable error로 fail closed합니다.
- Public error에는 session ID list, tag 전체 또는 local path를 포함하지 않습니다.
- Annotation hydration 실패는 현재 worker error semantics를 유지하며 annotation 없는 결과로
  조용히 downgrade하지 않습니다.

## 성능

- Unfiltered search는 Storage selection round trip을 추가하지 않습니다.
- Filtered search는 Storage selection 1회, Timeline search 1회, page annotation hydration 1회로
  bounded합니다.
- Storage repository는 annotation row만 scan하고 pinned index를 재사용합니다. Tag predicate는
  durable annotation 수에 비례하며 catalog JSONL/message table을 읽지 않습니다.
- Timeline repository는 bound JSON selection을 `json_each`로 적용하고 기존 project/model/date/FTS
  predicate, order와 limit을 유지합니다.
- `perf:session-catalog`에 annotation filter exact count/page measurement를 추가하고 기존 1초
  query threshold 안에서 검증합니다.

## Domain Architecture

### 기준 용어

| 용어 | 의미 |
| --- | --- |
| Session Catalog | Codex JSONL에서 계산한 rebuildable session/search projection |
| Session Annotation | Storage Worker가 소유하는 durable pin/tag state |
| Catalog Predicate | text/project/model/date처럼 Timeline Worker index가 평가하는 조건 |
| Annotation Predicate | pinned/tags처럼 Storage Worker state가 평가하는 조건 |
| Annotation Selection | Annotation Predicate 결과를 Timeline Worker SQL에 전달하는 internal ID set |
| Filtered Search Page | 두 predicate를 모두 반영한 results/total/cursor 단위 |

거부 용어는 `joined catalog`, `shared session DB`, `annotation-owned catalog`입니다. 두 DB를 한
owner가 공유하거나 annotation이 Catalog aggregate에 편입됐다는 오해를 만들기 때문입니다.

### Bounded context와 module 영향

- `src/lib/runtime/storage/`: Annotation Predicate와 selection 계산의 owner
- `src/lib/runtime/supervisor.ts`: 두 worker command의 orchestration owner
- `src/lib/runtime/timeline/`: combined predicate를 Session Catalog query에 전달
- `src/lib/session-catalog/`: selection을 SQL pagination/count에 적용하는 projection adapter
- `src/pages/api/sessions/search.ts`: public contract 유지, 직접 worker/DB access 없음

### Type와 signature 영향

- Public `ISessionSearchQuery`, `ISessionSearchPage` shape는 변경하지 않습니다.
- Internal `TSessionAnnotationSelection`과 selection command payload/reply를 추가합니다.
- Runtime Timeline search input은 public query와 internal selection을 분리해 검증합니다.
- Repository search input은 mutually exclusive include/exclude ID selection을 받습니다.

### ADR 후보

새 ADR은 만들지 않습니다. Storage Worker durable state ownership, Timeline Worker projection
ownership과 Supervisor orchestration은 ADR-031의 기존 결정 안에 있습니다. 구현 뒤 ADR-031의
검증 근거를 바꿀 필요는 없고 `ARCHITECTURE-LOGIC.md`, `TESTING.md`, `PERFORMANCE.md`에 query
flow와 evidence를 갱신합니다.

## 거부한 대안

### Supervisor가 모든 catalog page를 순회한 뒤 in-memory filter

5,000 session마다 다수의 Timeline/Storage IPC가 필요하고 opaque cursor를 Supervisor가 다시
구성해야 합니다. Exact total을 위해 매 search마다 전체 result를 순회하므로 거부합니다.

### Session Annotation을 Session Catalog DB에 복제

SQL join은 단순해지지만 startup reconciliation, projection lag, update failure recovery와 새
schema migration이 필요합니다. 현재 결함 수정 범위보다 consistency surface가 커지므로
거부합니다.

### Timeline Worker가 Storage DB를 read-only attach

Worker single-owner 경계와 DB schema coupling을 깨고 WAL/backup/degraded mode를 결합하므로
거부합니다.

### `total = results.length`

첫 page에만 맞고 다음 cursor, limit 초과 결과와 전체 filtered count를 계속 잘못 표현하므로
거부합니다.

## 테스트 전략

- Storage repository: pinned true/false, unannotated false, tag AND와 empty selection
- Runtime IPC: selection payload/reply strict validation과 oversize rejection
- Session Catalog repository: include/exclude가 search/count/order/cursor에 동일 적용
- Query service: count에서 cursor만 제거하고 selection은 유지
- Supervisor: filter 없을 때 selection command 생략, filter가 있으면 selection→Timeline→hydrate
  순서와 post-page filtering 제거
- API regression: filtered `results.length`, exact `total`, next cursor와 saved filter replay
- Performance: 5,000 session + representative annotation selection query 1초 이하
- Live smoke: pinned/tag filter 결과 1건일 때 `total=1`, replay/annotation과 worker counters clean

## Rollback

Public API와 durable schema를 바꾸지 않으므로 source rollback으로 복구합니다. 새 runtime
command가 없는 이전 worker와 혼용하지 않고 Supervisor와 worker bundle을 같은 build로
배포합니다. Live rollback은 직전 source build와 Runtime v2 Phase 6 gate를 기준으로 합니다.

## 설계 승인

권고안은 Storage Worker가 annotation selection을 계산하고 Timeline Worker가 그 selection을
SQL pagination/count 전에 적용하는 방식입니다. 사용자가 2026-08-22 승인했으며 Plan Grilling,
design review, Spec Freeze Snapshot, implementation plan 순서로 진행합니다.

## Plan Grilling Approval

- 기록: `docs/superpowers/grill-me/2026-08-22-session-catalog-annotation-pagination.md`
- 사용자 승인: 완료
- Selection limit: 10,000 unique session ID, 초과 시 fail closed
- Concurrent update: predicate mismatch 시 orchestration 1회 재시도, 반복 충돌은 retryable error
- 열린 설계 질문: 없음

## Plan Design Review

- 결과: 통과
- 기록: `docs/superpowers/reviews/2026-08-22-session-catalog-annotation-pagination-design-review.md`
- Blocking finding: 없음
- Public API/UI/schema 변경 없이 filtered result, total과 cursor의 일관성만 수정합니다.

## Spec Freeze Snapshot

- Topic: `session-catalog-annotation-pagination`
- Product boundary: Session Catalog의 `pinned`/`tags` filter를 SQL pagination/count 이전에 적용합니다.
- Ownership: Storage Worker는 durable Session Annotation과 Annotation Selection을, Timeline Worker는
  rebuildable Catalog SQL/search/count/cursor를, Supervisor는 orchestration/retry/hydration을 소유합니다.
- Public contract: `ISessionSearchQuery`, `ISessionSearchPage`, saved filter와 UI shape를 유지합니다.
- Selection semantics: filter 없음은 selection command 생략; `pinned=true`는 include;
  `pinned=false` 단독은 pinned ID exclude; tags가 있으면 AND match ID include입니다.
- Pagination semantics: results, exact total과 next cursor가 같은 combined predicate/order를 사용합니다.
- Bound: selection은 최대 10,000 unique ID이며 JSON parameter와 SQLite `json_each`를 사용합니다.
- Consistency: hydration predicate mismatch는 전체 orchestration 1회 재시도 후 반복 시 retryable
  `session-annotation-search-conflict`로 fail closed합니다.
- Error policy: selection oversize/storage failure/hydration conflict에 unfiltered fallback이나 truncation을
  사용하지 않고 ID/tag/path를 public error/log에 노출하지 않습니다.
- Persistence: durable schema/migration 없음. Catalog index는 기존처럼 삭제/rebuild할 수 있습니다.
- Performance: 기존 5,000-session fixture에서 annotation-aware SQL query도 1초 이하를 요구합니다.
- Rollback: source rollback만 필요하며 Supervisor와 worker bundle을 같은 build로 배포합니다.
- Release boundary: npm/version/tag/Release는 최종 개발 완료 확정까지 동결합니다. 이번 작업의
  commit/push/live deployment/restart도 별도 명시 요청 전 수행하지 않습니다.

## Implementation과 Code Review

- 구현: 완료
- Code review: 통과
- 기록: `docs/superpowers/reviews/2026-08-22-session-catalog-annotation-pagination-code-review.md`
- Public/durable schema drift: 없음
- Source release candidate: full unit/type/lint/project-design/performance/isolated production build 통과
- Live release: 별도 승인 전 대기; 현재 live build는 `f46410b4`
