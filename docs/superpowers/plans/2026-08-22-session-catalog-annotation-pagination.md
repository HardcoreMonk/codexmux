# Session Catalog Annotation Pagination 구현 계획

- 날짜: 2026-08-22
- 상태: Approved
- 대상 spec: `docs/superpowers/specs/2026-08-22-session-catalog-annotation-pagination-design.md`
- Grill-me: `docs/superpowers/grill-me/2026-08-22-session-catalog-annotation-pagination.md`
- 선행 review: `docs/superpowers/reviews/2026-08-22-session-catalog-annotation-pagination-design-review.md`
- 구현 방식: combined predicate와 observable behavior 중심 vertical TDD

## 범위

Storage Worker가 annotation predicate를 bounded session selection으로 계산하고 Timeline Worker가 이를
Catalog SQL search/count/cursor 전에 적용합니다. Supervisor는 최종 page annotation을 hydrate하고
predicate 경쟁을 한 번 재시도합니다.

Public API/UI/saved-filter/durable schema, npm/version/tag/Release, commit/push, live deployment/restart는
변경하지 않습니다.

## Execution Environment Constraints

- Active target: Linux single engine host, systemd user service, POSIX filesystem
- Runtime: Node `>=20.9.0`, Next.js Pages Router/custom server, Runtime v2 worker IPC
- Package manager: `corepack pnpm`
- Database owner: Storage `runtime-v2/state.db`, Timeline `session-catalog/index.db`
- Limits: page 200, selection 10,000 unique ID, tags 20, session ID 160자
- Next contract read: `node_modules/next/dist/docs/02-pages/03-building-your-application/01-routing/07-api-routes.md`,
  `node_modules/next/dist/docs/02-pages/02-guides/custom-server.md`
- Live isolation: source checkout의 `.next`를 교체하지 않으며 build가 필요하면 temporary mirror를 사용합니다.

## Task 1. Internal selection/IPC와 Storage query를 TDD로 추가

Files:

- Modify: `tests/unit/lib/runtime/session-catalog-ipc.test.ts`
- Modify: `tests/unit/lib/runtime/session-annotation-storage.test.ts`
- Modify: `tests/unit/lib/runtime/storage-worker-service.test.ts`
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/storage/repository.ts`
- Modify: `src/lib/runtime/storage/worker-service.ts`

Steps:

1. `storage.select-session-annotations` payload가 pinned/tags 중 하나 이상, normalized tag와 strict field를
   검증하고 reply가 include/exclude 및 최대 10,000 unique ID를 강제하는 failing test를 추가합니다.
2. Repository에 pinned true, pinned false exclude, tag AND, tags+pinned, unannotated와 10,001 oversize
   test를 추가합니다.
3. Storage query는 bound JSON `json_each`로 tag AND를 계산하고 10,001번째 row로 oversize를 감지합니다.
4. Worker command를 연결하고 고정된 retryable oversize error를 반환합니다.

## Task 2. Catalog SQL search/count/cursor에 selection을 TDD로 적용

Files:

- Modify: `tests/unit/lib/session-catalog/index-repository.test.ts`
- Modify: `tests/unit/lib/session-catalog/query-service.test.ts`
- Modify: `tests/unit/lib/runtime/timeline-worker-service.test.ts`
- Modify: `src/lib/session-catalog/contracts.ts`
- Modify: `src/lib/session-catalog/index-repository.ts`
- Modify: `src/lib/session-catalog/query-service.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/timeline/worker-service.ts`

Steps:

1. Include/exclude/empty selection이 project/model/date/FTS와 결합되고 search/count에 동일 적용되는 failing
   repository test를 추가합니다.
2. Filtered first/second page가 exact total, full page와 filtered last-row cursor를 반환하는 query test를
   추가합니다.
3. Bound JSON `json_each` predicate helper를 search/count가 공유하고 count에서 cursor만 제외합니다.
4. Timeline internal search schema/type에 optional selection을 추가하되 public query/page shape는 유지합니다.

## Task 3. Supervisor orchestration과 bounded retry를 TDD로 구현

Files:

- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `src/lib/runtime/api-handler.ts`

Steps:

1. Filter 없음은 selection command를 생략하고 기존 Timeline→hydrate 순서를 유지하는 test를 추가합니다.
2. Filter 있음은 Storage selection→Timeline combined search→Storage hydration 순서를 검증합니다.
3. Supervisor의 page post-filter를 제거하고 exact Timeline total/cursor를 보존합니다.
4. Hydration predicate 불일치 시 전체 orchestration을 한 번 재시도하고 반복 시 고정된 retryable conflict
   error를 반환하는 test를 추가합니다.
5. Retry/conflict perf counter만 기록하고 sensitive value는 기록하지 않습니다.
6. 두 error code를 503으로 명시적으로 매핑합니다.

## Task 4. API regression과 성능 evidence를 추가

Files:

- Modify: `tests/unit/pages/session-catalog-api.test.ts`
- Modify: `tests/unit/scripts/session-catalog-perf-snapshot.test.ts`
- Modify: `scripts/session-catalog-perf-snapshot.ts`

Steps:

1. API가 filtered exact total/cursor 응답을 그대로 반환하고 retryable worker error를 sanitize하는 test를
   추가합니다.
2. 5,000-session fixture의 representative 2,500-ID selection query 시간과 exact match count를 측정합니다.
3. `annotationFilterQueryMs <= 1,000` threshold를 기존 report/pass 조건에 추가합니다.

## Task 5. 문서, regression gate와 handoff를 완료

Files:

- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/PERFORMANCE.md`
- Create: `docs/operations/2026-08-22-session-catalog-annotation-pagination-handoff.md`

Steps:

1. Combined predicate flow, selection/retry/error와 perf evidence를 문서화합니다.
2. Focused unit → related unit → `tsc --noEmit` → lint 순서로 검증합니다.
3. `corepack pnpm perf:session-catalog`로 5,000-session threshold를 확인합니다.
4. Source/build/release/live 상태와 rollback을 operate handoff에 기록합니다.
