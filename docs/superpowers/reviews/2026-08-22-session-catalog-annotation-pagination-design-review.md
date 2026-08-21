# Session Catalog Annotation Pagination Design Review

- 날짜: 2026-08-22
- 대상: `docs/superpowers/specs/2026-08-22-session-catalog-annotation-pagination-design.md`
- Stage: `plan-design-review`
- 결과: 통과
- Blocking finding: 없음

## 검토 범위

- Filtered result, exact total, page fill과 opaque cursor의 단일 predicate 계약
- Storage/Timeline Worker ownership과 Supervisor orchestration 경계
- Empty/unannotated/pinned/tag AND semantics
- Concurrent annotation update와 retry/error feedback
- Bounded IPC, public error redaction, 성능과 rollback

## 승인된 동작 구조

| 상태 | 결과 |
| --- | --- |
| Annotation filter 없음 | 기존 Timeline search 뒤 page annotation만 hydrate |
| Empty include selection | Timeline SQL false predicate로 `results=[]`, `total=0`과 health 반환 |
| Empty exclude selection | Catalog predicate만 적용하되 page annotation은 hydrate |
| Selection 10,000 초과 | `session-annotation-selection-too-large` retryable service error |
| Hydration predicate 불일치 | selection부터 한 번 재시도 |
| 반복 hydration 충돌 | `session-annotation-search-conflict` retryable service error |

Empty include도 Timeline Worker를 호출해 Catalog health와 error semantics를 유지합니다. Supervisor가
`total=0`을 합성하지 않습니다.

## Boundary 검토

- Storage Worker는 annotation DB를 단독 read/write하고 exact selection만 반환합니다.
- Timeline Worker는 Storage DB를 attach/read하지 않고 bounded ID selection만 SQL predicate로 소비합니다.
- Supervisor는 page를 사후 제거하지 않으며 filtered cursor를 다시 만들지 않습니다.
- API route는 기존 query/response schema를 유지하고 worker/DB를 직접 열지 않습니다.
- Durable DB schema와 migration이 없어 source rollback을 방해하지 않습니다.

## Error prevention과 관측성

- Oversize selection을 truncate하거나 unfiltered result로 fallback하지 않습니다.
- Conflict retry/error metric에는 count만 기록하고 session ID, tag와 path는 기록하지 않습니다.
- Public error message는 고정된 bounded 문구를 사용합니다.
- 한 번의 bounded retry만 허용해 지속적인 write 경쟁이 request loop를 만들지 않게 합니다.

## Review 결론

Public UI나 API shape를 넓히지 않고 검색 결과/개수/cursor의 내부 일관성을 복구할 수 있습니다.
Worker ownership, bounded resource와 rollback에 blocking issue가 없으므로 Spec Freeze와 구현 계획으로
진행할 수 있습니다.
