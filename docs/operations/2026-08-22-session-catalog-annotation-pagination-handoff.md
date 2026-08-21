# Session Catalog Annotation Pagination 운영 handoff

## 범위

- 일자: 2026-08-22 KST
- Lifecycle: `intake -> writing-spec -> domain-architecture -> grill-me -> plan-design-review -> writing-plans -> plan-eng-review -> implement -> code-review -> release -> operate`
- 대상: Session Catalog `pinned`/`tags` filter의 exact total, page fill과 cursor
- Release 경계: 사용자가 `0.4.24` npm publish, commit/push와 live deploy/restart를 승인함;
  remote tag/GitHub Windows Release는 별도 gate

## 구현 결과

기존 Supervisor page post-filter를 제거했습니다. Annotation filter가 있으면 다음 순서를 사용합니다.

```text
Supervisor
-> Storage Worker: annotation predicate -> bounded include/exclude selection
-> Timeline Worker: catalog predicate + selection -> SQL page/exact total/cursor
-> Storage Worker: final page annotation hydration
-> Supervisor: predicate consistency check
```

- `pinned=true`: pinned annotation session include
- `pinned=false`, tag 없음: pinned session exclude; annotation 없는 session도 false로 포함
- tag: 요청 tag 전체를 포함하는 session include
- tag와 pinned: AND semantics
- selection 최대 10,000 unique ID; 초과는 retryable fail closed
- hydration predicate가 바뀌면 orchestration 한 번 재시도; 반복 충돌은 retryable fail closed
- filter 없는 hot path는 selection command를 호출하지 않음

Public API, UI, saved-filter schema와 durable DB schema는 변경하지 않았습니다. SQLite ID membership은
bound JSON과 `json_each`를 사용하며 session 수만큼 SQL placeholder를 만들지 않습니다.

## 검증 evidence

| Gate | 결과 |
| --- | --- |
| focused unit | 8 files, 79 tests 통과 |
| performance unit | 1 file, 1 test 통과 |
| full unit | 267 files/1,665 tests 통과, 1 file/3 tests skip |
| TypeScript | `corepack pnpm tsc --noEmit` 통과 |
| lint | 0 error, 기존 warning 6개 |
| project design | `corepack pnpm check:project-design` 통과 |
| isolated production build | Next Pages Router/custom server와 5개 worker bundle 통과 |
| 10,001 selection | truncation 없이 `session-annotation-selection-too-large` 확인 |
| concurrent update | 1회 retry 성공과 반복 conflict fail-closed 확인 |
| 5,000-session initial index | `5156.764ms` / 30초 이하 |
| incremental append | `0.564ms` / 500ms 이하 |
| FTS query | `11.249ms` / 1초 이하 |
| 2,500-ID annotation query | `11.547ms`, exact 2,500 / 1초 이하 |
| replay projection | `0.111ms` / 200ms 이하 |
| RSS delta | `22,167,552 bytes` / 512MiB 이하 |

Build는 `/tmp` mirror와 hard-link dependency copy에서 먼저 검증하고 mirror를 삭제했습니다.
Release 시점에는 같은 source commit으로 production build와 live 배포를 다시 수행했습니다.

## 운영 상태와 rollback

Commit `322ccfb777d45ef80fdcd9079cfcd88e3a9151ac`을 branch
`codex/session-catalog-annotation-release-0.4.24`에 push하고 같은 build를 live service에
배포했습니다. Service 정지 중 backup `runtime-v2-storage-20260821T163716Z`을 생성한 뒤 PID
`1294595`, restart count 0으로 재기동했습니다. Listener는 authenticated `0.0.0.0:8122`, version은
`0.4.24`, build time은 `2026-08-21T16:37:29.363Z`이며 governance write gate도 유지됩니다.

실제 durable annotation을 대상으로 `pinned=true`, tag `verified-2026-08-22` 검색을 재실행했습니다.
응답은 `results=1`, `total=1`, next cursor 없음이었고 모든 결과가 pin/tag predicate를
만족했습니다. 이어서 live Phase 6 12-check도 통과했습니다.

Durable schema/migration이 없으므로 rollback은 직전 source bundle로 되돌리면 됩니다. Catalog index와
annotation DB restore는 필요하지 않습니다. 필요하면 배포 전 backup에서 runtime durable state 5개를
service 정지 상태로 복구합니다.
