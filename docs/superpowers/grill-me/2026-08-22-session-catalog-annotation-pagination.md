# Session Catalog Annotation Pagination Plan Grilling

- 날짜: 2026-08-22
- 대상 spec: `docs/superpowers/specs/2026-08-22-session-catalog-annotation-pagination-design.md`
- 방식: 질문을 한 번에 하나씩 제시하고 추천 정책과 사용자 결정을 기록
- 상태: 완료

## 승인된 기준선

- Storage Worker가 annotation predicate를 exact session ID selection으로 계산합니다.
- Timeline Worker가 selection을 SQL search/count/cursor 이전에 적용합니다.
- `pinned=false`는 annotation이 없거나 `pinned=false`인 session을 포함합니다.
- Public API, durable schema와 saved-filter schema는 변경하지 않습니다.
- npm 갱신은 최종 개발 완료가 명시적으로 확정될 때까지 보류합니다.

## Q1. Annotation selection이 IPC 상한을 넘으면 어떻게 처리하는가?

문제:

Exact annotation filter는 Storage Worker가 Timeline Worker로 session ID selection을 전달해야 합니다.
무제한 배열은 worker IPC memory와 validation 비용을 통제할 수 없지만, selection을 잘라 보내거나
annotation filter 없이 fallback하면 `total`, page와 cursor를 다시 조용히 틀리게 만듭니다.

추천 결정:

- Internal selection 상한을 10,000 unique session ID로 둡니다.
- 현재 5,000-session performance gate의 두 배를 수용하고 worst-case payload를 bounded합니다.
- 상한 초과 시 `session-annotation-selection-too-large`로 fail closed합니다.
- Public error에는 ID, tag 또는 local path를 넣지 않고 재시도 가능한 service error로 매핑합니다.
- Selection truncation, unfiltered fallback과 Supervisor full scan은 금지합니다.
- 10,000개를 넘는 catalog 지원은 chunked/stateful selection 또는 projection 전략을 검토하는 별도
  scaling lifecycle로 분리합니다.

사용자 결정: 승인

## Q2. Selection 계산과 page hydration 사이 annotation이 바뀌면 어떻게 처리하는가?

문제:

Storage Worker selection과 Timeline Worker page query는 서로 다른 DB/worker에 있어 하나의 transaction으로
묶을 수 없습니다. Selection 뒤 annotation update가 발생하면 page 포함 여부는 이전 snapshot을 따르지만
최종 hydration은 최신 `pinned`/`tags`를 반환해 filter와 row 표시가 서로 모순될 수 있습니다.

추천 결정:

- Supervisor는 hydration 결과가 요청한 annotation predicate와 일치하는지 검증합니다.
- 불일치가 있으면 selection부터 전체 search orchestration을 한 번만 재시도합니다.
- 두 번째에도 불일치하면 `session-annotation-search-conflict` retryable error로 fail closed합니다.
- 첫 시도 결과, stale annotation 또는 unfiltered page를 조용히 반환하지 않습니다.
- Page 밖 annotation의 동시 변경은 selection 시점 snapshot에 포함된 것으로 취급하며 cross-DB global
  transaction이나 장기 lock은 도입하지 않습니다.
- Retry count와 conflict를 runtime metric에 기록하되 session ID, tag와 path는 log에 남기지 않습니다.

사용자 결정: 승인

## Grill 결과

- Annotation selection은 최대 10,000 unique session ID이며 초과 시 fail closed합니다.
- Selection truncation, unfiltered fallback과 Supervisor full scan은 사용하지 않습니다.
- Selection과 hydration이 충돌하면 전체 orchestration을 한 번 재시도합니다.
- 재시도 뒤에도 충돌하면 `session-annotation-search-conflict` retryable error로 fail closed합니다.
- Cross-DB global transaction과 장기 lock은 도입하지 않습니다.
- 열린 설계 질문 없음.
