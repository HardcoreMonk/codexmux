# Stats Date Filtering Design

## Goal

`/api/debug/perf`에서 확인된 stats cold build 병목을 줄인다. 재배포 직후 또는 memory cache
만료 뒤 stats endpoint가 `today`, `7d`, `30d` 같은 좁은 기간을 계산할 때 전체 Codex JSONL을
다시 훑지 않고, 경로 날짜가 대상 기간에 들어오는 파일만 파싱한다.

## Evidence

2026-05-06 KST live snapshot에서 stats endpoint 첫 호출은 다음 수치를 보였다.

- `/api/stats/overview`: 3174ms
- `/api/stats/projects`: 3099ms
- `/api/stats/sessions`: 3067ms
- `/api/stats/history`: 3060ms
- `/api/debug/perf`: `stats.cache.build = 3166.83ms`

같은 endpoint의 cache hit 호출은 대체로 2-6ms였다. 병목은 응답 변환보다 cold file scan에 있다.

## Scope

- Codex JSONL 경로 `~/.codex/sessions/YYYY/MM/DD/*.jsonl`에서 날짜를 추출하는 helper를 추가한다.
- 날짜를 알 수 있는 파일은 대상 날짜 set에 포함될 때만 파싱한다.
- 날짜를 알 수 없는 파일은 안전하게 포함한다.
- `getStatsCache()`의 missing day 계산에 helper를 적용한다.
- `parseAllSessions`, `parseAllProjects`, `parseTimestampsByDay`, `parseHistory`에도 같은 필터를 적용한다.
- `period=all`은 기존처럼 전체 파일을 포함한다.

## Non-Goals

- Stats cache schema version을 바꾸지 않는다.
- JSONL 내부 timestamp 의미를 바꾸지 않는다.
- Facet JSON file 처리 방식은 바꾸지 않는다.
- Timeline/status/diff 최적화는 이번 slice에 포함하지 않는다.

## Safety

경로 날짜와 내부 timestamp가 충돌할 수 있는 비정상 파일은 경로 날짜를 기준으로 제외될 수 있다.
이는 Codex session 저장 규칙이 날짜 디렉터리 아래 JSONL을 두는 현재 contract에 맞춘 최적화다.
날짜를 추출하지 못하는 파일은 fallback으로 포함해 custom layout이나 migration file 누락을 막는다.

## Success

- 기존 stats 결과 fixture는 유지된다.
- disk cache가 있고 missing target이 `today`뿐인 경우, 과거 날짜 경로의 JSONL은 today parse 대상에서 제외된다.
- Focused stats tests, `tsc`, `lint`, full tests가 통과한다.
- `docs/PERFORMANCE.md`와 `docs/FOLLOW-UP.md`에 2026-05-06 측정/조치가 기록된다.
